import type { default as UTXOTracker, UTXOTrackerEntry } from '../utxo-tracker.js';
import type ElectrumClientManager from '../electrum-client-manager.js';
import type { ElectrumClient, ElectrumClientEvents, RPCNotification as ElectrumRPCNotification } from '@electrum-cash/network';
import type { ModuleSchema, ModuleDependency, ModuleMethod, ServiceConstructor } from '../types.js';
import type { Moria0StateManagerService, Moria0State } from './types.js';
import { EventEmitter } from 'node:events';
import VegaFileStorageProvider, { genWalletAddressInfo, WalletData } from '../vega-file-storage-provider.js';
import {
  moria as cashlab_moria, common as cashlab_common, libauth,
  UTXO, SpendableCoin, SpendableCoinType, PayoutRule, PayoutAmountRuleType, UTXOWithNFT, OutputWithFT,
  TokenId, Fraction,
  NATIVE_BCH_TOKEN_ID,
} from 'cashlab';
const { MoriaV0 } = cashlab_moria;
const { uint8ArrayEqual } = cashlab_common;

const {
  assertSuccess, decodeTransaction, decodeAuthenticationInstructions,
  binToNumberUint32LE, vmNumberToBigInt,
} = libauth;

import { hexToBin, binToHex, deferredPromise, convertUTXOToJSON } from '../../util.js';
import { InvalidProgramState, ValueError } from '../../exceptions.js';
import { initModuleMethodWrapper, selectInputCoins } from '../helpers.js';
import broadcastTransaction from '../network/broadcast-transaction.js';

export class Moria0StateManager extends EventEmitter implements Moria0StateManagerService {
  _moria_utxo_tracker_entry?: UTXOTrackerEntry;
  _oracle_utxo_tracker_entry?: UTXOTrackerEntry;
  _loans_utxo_tracker_entry?: UTXOTrackerEntry;
  _loans_utxo?: UTXOWithNFT[];
  _state?: Moria0State;
  _state_pending_update?: Promise<void>;
  _running_initialize_moria_state?: Promise<void>;
  _utxo_tracker?: UTXOTracker;
  _electrum_client_manager?: ElectrumClientManager;
  _console?: Console;
  static create (): Moria0StateManager {
    return new Moria0StateManager();
  }
  static getDependencies (): ModuleDependency[] {
    return [
      { name: 'electrum_client_manager' },
      { name: 'utxo_tracker' },
      { name: 'console' },
    ];
  }
  async init ({ utxo_tracker, electrum_client_manager, console }: MoriaV0InputServices): Promise<void> {
    this._utxo_tracker = utxo_tracker;
    this._electrum_client_manager = electrum_client_manager;
    this._console = console;
    (this as any)._onTrackerEntryUpdate = this.onTrackerEntryUpdate.bind(this);
    utxo_tracker.addListener('update', (this as any)._onTrackerEntryUpdate);
    await this.initializeMoriaState();
    if (this._state == null) {
      throw new Error('this._state is null!');
    }
    const moria_context = this._state.moria.getCompilerContext();
    this._loans_utxo_tracker_entry = await this._utxo_tracker.addTrackerByLockingBytecode(this._state.loan_locking_bytecode);
    this._loans_utxo = this.filterLoanUTXOList(moria_context.musd_token_id, this._loans_utxo_tracker_entry.data||[]);
  }
  async destroy (): Promise<void> {
    if (this._utxo_tracker != null) {
      this._utxo_tracker.removeListener('update', (this as any)._onTrackerEntryUpdate);
    }
    this._moria_utxo_tracker_entry = undefined;
    this._oracle_utxo_tracker_entry = undefined;
    this._loans_utxo_tracker_entry = undefined;
  }
  getWalletLoans (pkh: Uint8Array): UTXOWithNFT[] {
    return this.getLoans()
      .filter((a: UTXOWithNFT) => uint8ArrayEqual(a.output.token.nft.commitment.slice(0, 20), pkh));
  }
  getLoans (): UTXOWithNFT[] {
    if (this._loans_utxo == null) {
      throw new Error(`state_manager is not initialized!`);
    }
    return this._loans_utxo;
  }
  async requireMoriaState (): Promise<Moria0State> {
    if (this._state == null) {
      await this.initializeMoriaState();
      if (this._state == null) {
        throw new Error('initializeMoriaState failed!');
      }
    }
    return this._state;
  }
  getMoriaState (): Moria0State | undefined {
    return this._state;
  }
  waitUntilPendingTrackersUpdate (): Promise<void> {
    const items = [
      this._moria_utxo_tracker_entry,
      this._oracle_utxo_tracker_entry,
      this._loans_utxo_tracker_entry,
    ];
    return Promise.all(items.filter((a) => !!a && !!a.pending_request).map((a) => (a as any).pending_request))
      .then(() => undefined) as Promise<void>;
  }
  hasPendingTrackerUpdate (): boolean {
    const items = [
      this._moria_utxo_tracker_entry,
      this._oracle_utxo_tracker_entry,
      this._loans_utxo_tracker_entry,
    ];
    return items.filter((a) => !!a && !!a.pending_request).length > 0;
  }
  filterLoanUTXOList (musd_token_id: TokenId, utxo_list: UTXO[]): UTXOWithNFT[] {
    return (utxo_list as UTXOWithNFT[]).filter((a: UTXOWithNFT) => a.output.token?.token_id == musd_token_id && a.output.token?.nft?.commitment?.length > 20 && a.output.token?.nft?.capability != 'minting');
  }
  selectMoriaUTXO (musd_token_id: TokenId, utxo_list: UTXO[]): UTXOWithNFT {
    const moria_utxo_list = utxo_list.filter((a: UTXO) => a.output.token?.nft?.capability == 'minting' && a.output.token?.token_id == musd_token_id);
    if (moria_utxo_list.length != 1) {
      throw new ValueError(`Expecting only a single moria-v0 utxo in the blockchain. got: ${moria_utxo_list.length}`);
    }
    return moria_utxo_list[0] as UTXOWithNFT;
  }
  selectOracleUTXO (oracle_token_id: TokenId, utxo_list: UTXO[]): UTXOWithNFT {
    const msgSeq = (a: UTXO): number => a.output.token?.nft?.commitment != null ? binToNumberUint32LE(a.output.token.nft.commitment.slice(28, 32)) : -1;
    const oracle_utxo_list = utxo_list.filter((a: UTXO) => a.output.token?.nft?.capability == 'mutable' && a.output.token?.token_id == oracle_token_id);
    if (oracle_utxo_list.length > 0) {
      let oracle_utxo: UTXO = oracle_utxo_list[0] as UTXO;
      let oracle_utxo_msg_seq = msgSeq(oracle_utxo);
      for (let i = 1; i < oracle_utxo_list.length; i++) {
        const item: UTXO = oracle_utxo_list[i] as UTXO;
        const item_msg_seq = msgSeq(item);
        if (item_msg_seq > oracle_utxo_msg_seq) {
          oracle_utxo = item;
          oracle_utxo_msg_seq = item_msg_seq;
        }
      }
      return oracle_utxo as UTXOWithNFT;
    }
    throw new ValueError(`Failed to find the oracle utxo.`);
  }
  onTrackerEntryUpdate (entry: UTXOTrackerEntry) {
    if (!this._state) {
      return;
    }
    if (entry.type != 'locking_bytecode') {
      return;
    }
    try {
      const moria_context = this._state.moria.getCompilerContext();
      if (this._moria_utxo_tracker_entry != null && uint8ArrayEqual(entry.locking_bytecode, this._moria_utxo_tracker_entry.locking_bytecode)) {
        this._moria_utxo_tracker_entry = entry;
        const selected_utxo = this.selectMoriaUTXO(moria_context.musd_token_id, entry.data||[]);
        if (this._state.oracle_utxo == null || !uint8ArrayEqual(this._state.oracle_utxo.outpoint.txhash, selected_utxo.outpoint.txhash) || this._state.oracle_utxo.outpoint.index != selected_utxo.outpoint.index) {
          this._state.moria_utxo = selected_utxo;
          this.emit('update', this._state);
        }
      }
      if (this._oracle_utxo_tracker_entry != null && uint8ArrayEqual(entry.locking_bytecode, this._oracle_utxo_tracker_entry.locking_bytecode)) {
        this._oracle_utxo_tracker_entry = entry;
        const selected_utxo = this.selectOracleUTXO(moria_context.oracle_token_id, entry.data||[]);
        if (this._state.oracle_utxo == null || !uint8ArrayEqual(this._state.oracle_utxo.outpoint.txhash, selected_utxo.outpoint.txhash) || this._state.oracle_utxo.outpoint.index != selected_utxo.outpoint.index) {
          const message_changed = this._state.oracle_utxo == null || !uint8ArrayEqual(this._state.oracle_utxo.output.token.nft.commitment, selected_utxo.output.token.nft.commitment);
          this._state.oracle_utxo = selected_utxo;
          this.emit('update', this._state);
          if (message_changed) {
            this.emit('oracle-message-change', this._state.oracle_utxo.output.token.nft.commitment);
          }
        }
      }
      if (this._loans_utxo_tracker_entry != null && uint8ArrayEqual(entry.locking_bytecode, this._loans_utxo_tracker_entry.locking_bytecode)) {
        this._loans_utxo_tracker_entry = entry;
        this._loans_utxo = this.filterLoanUTXOList(moria_context.musd_token_id, this._loans_utxo_tracker_entry.data||[]);
        this.emit('loans-update', this._state);
      }
    } catch (err) {
      if (this._console) {
        this._console.warn('onTrackerEntryUpdate fail, ', err);
      }
    }
  }
  async initializeMoriaState (): Promise<void> {
    const { promise, resolve, reject } = await deferredPromise<void>();
    if (this._running_initialize_moria_state != null) {
      this._running_initialize_moria_state.then(resolve, reject);
      await promise;
      return;
    }
    this._running_initialize_moria_state = this._state_pending_update = promise;
    ;(async () => {
      try {
        if (this._utxo_tracker == null || this._electrum_client_manager == null) {
          throw new Error('utxo_tracker or electrum_client_manager is null!');
        }
        const client = this._electrum_client_manager.getClient();
        if (client == null) {
          throw new ValueError('Failed to initialize moria0, client is not available!');
        }
        const { musd_token_id, oracle_token_id, sunset_pubkey, sunset_message } = MoriaV0.getConstants()
        const moria_compiler = MoriaV0.moriaLibauthCompiler(() => ({ sunset_pubkey, sunset_message, oracle_token: hexToBin(oracle_token_id) }));
        const moria_locking_result = moria_compiler.generateBytecode({
          data: {},
          scriptId: 'moria',
        });
        if (!moria_locking_result.success) {
          /* c8 ignore next */
          throw new InvalidProgramState('Failed to generate bytecode, script: loan, ' + JSON.stringify(moria_locking_result, null, '  '));
        }
        const loan_locking_result = moria_compiler.generateBytecode({
          data: {},
          scriptId: 'loan',
        });
        if (!loan_locking_result.success) {
          /* c8 ignore next */
          throw new InvalidProgramState('Failed to generate bytecode, script: loan, ' + JSON.stringify(loan_locking_result, null, '  '));
        }
        const moria_locking_bytecode = moria_locking_result.bytecode;
        const loan_locking_bytecode = loan_locking_result.bytecode;
        this._moria_utxo_tracker_entry = await this._utxo_tracker.addTrackerByLockingBytecode(moria_locking_bytecode);
        const moria_utxo = this.selectMoriaUTXO(musd_token_id, this._moria_utxo_tracker_entry.data||[]);
        let oracle_owner_pubkey: Uint8Array;
        { // extract oracle owner_pubkey from last moria transaction
          const last_transaction: libauth.TransactionCommon = assertSuccess(decodeTransaction(hexToBin(await client.request('blockchain.transaction.get', binToHex(moria_utxo.outpoint.txhash), false) as string)));
          // oracle unlocking
          const oracle_unlocking_instructions = decodeAuthenticationInstructions((last_transaction.inputs[1] as any).unlockingBytecode);
          const last_instruction = oracle_unlocking_instructions[oracle_unlocking_instructions.length - 1]
          if (last_instruction == null || (last_instruction as libauth.AuthenticationInstructionMalformed).malformed || !(last_instruction.opcode >= 1 && last_instruction.opcode <= 78)) {
            throw new Error('last instruction of a p2sh (oracle) unlocking script should be a push opcode, got: ' + last_instruction?.opcode);
          }
          const oracle_redeem_bytecode = (last_instruction as libauth.AuthenticationInstructionPush).data;
          if (oracle_redeem_bytecode[0] != 0x21) {
            throw new Error('Expecting the oracle_redeem_script to begin with OP_PUSHDATA33!');
          }
          oracle_owner_pubkey = oracle_redeem_bytecode.slice(1, 34);
        }
        const moria = new MoriaV0({ oracle_owner_pubkey, txfee_per_byte: 1n });
        const oracle_locking_result = moria.getCompilerContext().oracle_compiler.generateBytecode({
          data: {},
          scriptId: 'oracle',
        });
        if (!oracle_locking_result.success) {
          /* c8 ignore next */
          throw new InvalidProgramState('Failed to generate bytecode, script: loan, ' + JSON.stringify(oracle_locking_result, null, '  '));
        }
        const oracle_locking_bytecode = oracle_locking_result.bytecode;
        this._oracle_utxo_tracker_entry = await this._utxo_tracker.addTrackerByLockingBytecode(oracle_locking_bytecode);
        const oracle_utxo = this.selectOracleUTXO(oracle_token_id, this._oracle_utxo_tracker_entry.data||[]);
        this._state = {
          moria,
          moria_utxo, oracle_utxo,
          moria_locking_bytecode, loan_locking_bytecode,
          oracle_locking_bytecode, oracle_owner_pubkey,
        };
        this._state_pending_update = undefined;
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        this._running_initialize_moria_state = undefined;
      }
    })();
    await promise;
  }

}

type MoriaV0InputServices = {
  electrum_client_manager: ElectrumClientManager;
  cauldron_client_manager: ElectrumClientManager;
  utxo_tracker: UTXOTracker;
  vega_storage_provider: VegaFileStorageProvider;
  console: Console;
  state_manager: Moria0StateManager;
};

const methods_wrapper = initModuleMethodWrapper();

methods_wrapper.add('oracle-message', async ({ state_manager }: MoriaV0InputServices) => {
  const { oracle_utxo } = await state_manager.requireMoriaState();
  return MoriaV0.parseOracleMessageFromNFTCommitment(oracle_utxo.output.token.nft.commitment);
});

methods_wrapper.add('get-loans', async ({ state_manager }: MoriaV0InputServices) => {
  return state_manager.getLoans();
});


methods_wrapper.add('get-my-loans', async ({ vega_storage_provider, state_manager }: MoriaV0InputServices, wallet_name: string) => {
  const { musd_token_id } = MoriaV0.getConstants();
  const moria_state = await state_manager.requireMoriaState();
  const wallet_data = await vega_storage_provider.getWalletData(wallet_name);
  if (wallet_data == null) {
    throw new ValueError(`wallet not found, name: ${wallet_name}`);
  }
  const addr_info = genWalletAddressInfo(wallet_data);
  return state_manager.getWalletLoans(addr_info.public_key_hash);
});

const DEFAULT_TX_FEE_RESERVE = 5000n;

methods_wrapper.add('mint-loan', async ({ vega_storage_provider, utxo_tracker, cauldron_client_manager, state_manager }: MoriaV0InputServices, wallet_name: string, loan_amount: bigint, collateral_amount: bigint, { broadcast, txfee_per_byte, verify }: { broadcast?: boolean, txfee_per_byte?: bigint, verify?: boolean } = {}) => {
  const { moria, moria_utxo, oracle_utxo } = await state_manager.requireMoriaState();
  const wallet_data = await vega_storage_provider.getWalletData(wallet_name);
  if (wallet_data == null) {
    throw new ValueError(`wallet not found, name: ${wallet_name}`);
  }
  const addr_info = genWalletAddressInfo(wallet_data);
  if (addr_info.private_key == null) {
    throw new Error(`wallet's private_key is not available!`);
  }
  const wallet_input_coins: SpendableCoin[] = (await utxo_tracker.getUTXOListForLockingBytecode(addr_info.locking_bytecode)).map((utxo) => ({
    type: SpendableCoinType.P2PKH,
    output: utxo.output,
    outpoint: utxo.outpoint,
    key: addr_info.private_key as Uint8Array,
  }));
  const input_coins: SpendableCoin[] = selectInputCoins(wallet_input_coins, [ { token_id: NATIVE_BCH_TOKEN_ID, amount: collateral_amount + DEFAULT_TX_FEE_RESERVE } ], { allow_nft: false, select_pure_bch: true });
  const payout_rules: PayoutRule[] = [
    {
      locking_bytecode: addr_info.locking_bytecode,
      type: PayoutAmountRuleType.CHANGE,
    },
  ];
  moria.setTxFeePerByte(txfee_per_byte == null ? 1n : txfee_per_byte);
  const result = moria.mintLoan(moria_utxo, oracle_utxo, input_coins, loan_amount, collateral_amount, addr_info.public_key_hash, addr_info.locking_bytecode, payout_rules);
  if (verify) {
    moria.verifyTxResult(result);
  }
  if (broadcast) {
    const client = cauldron_client_manager.getClient();
    if (client == null) {
      throw new ValueError('client is not available!');
    }
    await broadcastTransaction(client, result.txbin, false);
  }
  return result;
});

methods_wrapper.add('repay-loan', async ({ vega_storage_provider, utxo_tracker, cauldron_client_manager, state_manager }: MoriaV0InputServices, wallet_name: string, loan_utxo: UTXOWithNFT, { broadcast, txfee_per_byte, verify }: { broadcast?: boolean, txfee_per_byte?: bigint, verify?: boolean } = {}) => {
  const { musd_token_id } = MoriaV0.getConstants();
  const { moria, moria_utxo, oracle_utxo } = await state_manager.requireMoriaState();
  const wallet_data = await vega_storage_provider.getWalletData(wallet_name);
  if (wallet_data == null) {
    throw new ValueError(`wallet not found, name: ${wallet_name}`);
  }
  const addr_info = genWalletAddressInfo(wallet_data);
  if (addr_info.private_key == null) {
    throw new Error(`wallet's private_key is not available!`);
  }
  const loan_params = MoriaV0.parseParametersFromLoanNFTCommitment(loan_utxo.output.token.nft.commitment);
  if (!uint8ArrayEqual(addr_info.public_key_hash, loan_params.borrower_pkh)) {
    throw new ValueError(`The selected wallet is not the owner of this loan, wallet name: ${wallet_name}`);
  }
  const wallet_input_coins: SpendableCoin[] = (await utxo_tracker.getUTXOListForLockingBytecode(addr_info.locking_bytecode)).map((utxo) => ({
    type: SpendableCoinType.P2PKH,
    output: utxo.output,
    outpoint: utxo.outpoint,
    key: addr_info.private_key as Uint8Array,
  }));
  const input_coins: SpendableCoin[] = selectInputCoins(wallet_input_coins, [ { token_id: musd_token_id, amount: loan_params.amount } ], { allow_nft: false, select_pure_bch: false });
  const payout_rules: PayoutRule[] = [
    {
      locking_bytecode: addr_info.locking_bytecode,
      type: PayoutAmountRuleType.CHANGE,
    },
  ];
  moria.setTxFeePerByte(txfee_per_byte == null ? 1n : txfee_per_byte);
  const result = moria.repayLoan(moria_utxo, oracle_utxo, loan_utxo, addr_info.private_key, input_coins, payout_rules);
  if (verify) {
    moria.verifyTxResult(result);
  }
  if (broadcast) {
    const client = cauldron_client_manager.getClient();
    if (client == null) {
      throw new ValueError('client is not available!');
    }
    await broadcastTransaction(client, result.txbin, false);
  }
  return result;
});

methods_wrapper.add('liquidate-loan', async ({ vega_storage_provider, utxo_tracker, cauldron_client_manager, state_manager }: MoriaV0InputServices, wallet_name: string, loan_utxo: UTXOWithNFT, { broadcast, txfee_per_byte, verify }: { broadcast?: boolean, txfee_per_byte?: bigint, verify?: boolean } = {}) => {
  const { musd_token_id } = MoriaV0.getConstants();
  const { moria, moria_utxo, oracle_utxo } = await state_manager.requireMoriaState();
  const wallet_data = await vega_storage_provider.getWalletData(wallet_name);
  if (wallet_data == null) {
    throw new ValueError(`wallet not found, name: ${wallet_name}`);
  }
  const addr_info = genWalletAddressInfo(wallet_data);
  if (addr_info.private_key == null) {
    throw new Error(`wallet's private_key is not available!`);
  }
  const loan_params = MoriaV0.parseParametersFromLoanNFTCommitment(loan_utxo.output.token.nft.commitment);
  const wallet_input_coins: SpendableCoin[] = (await utxo_tracker.getUTXOListForLockingBytecode(addr_info.locking_bytecode)).map((utxo) => ({
    type: SpendableCoinType.P2PKH,
    output: utxo.output,
    outpoint: utxo.outpoint,
    key: addr_info.private_key as Uint8Array,
  }));
  const input_coins: SpendableCoin[] = selectInputCoins(wallet_input_coins, [ { token_id: musd_token_id, amount: loan_params.amount } ], { allow_nft: false, select_pure_bch: false });
  const payout_rules: PayoutRule[] = [
    {
      locking_bytecode: addr_info.locking_bytecode,
      type: PayoutAmountRuleType.CHANGE,
    },
  ];
  moria.setTxFeePerByte(txfee_per_byte == null ? 1n : txfee_per_byte);
  const result = moria.liquidateLoan(moria_utxo, oracle_utxo, loan_utxo, input_coins, payout_rules);
  if (verify) {
    moria.verifyTxResult(result);
  }
  if (broadcast) {
    const client = cauldron_client_manager.getClient();
    if (client == null) {
      throw new ValueError('client is not available!');
    }
    await broadcastTransaction(client, result.txbin, false);
  }
  return result;
});

methods_wrapper.add('redeem-loan-with-sunset-sig', async ({ vega_storage_provider, utxo_tracker, cauldron_client_manager, state_manager }: MoriaV0InputServices, wallet_name: string, loan_utxo: UTXOWithNFT, sunset_datasig: Uint8Array, { broadcast, txfee_per_byte, verify }: { broadcast?: boolean, txfee_per_byte?: bigint, verify?: boolean } = {}) => {
  const { musd_token_id } = MoriaV0.getConstants();
  const { moria, moria_utxo, oracle_utxo } = await state_manager.requireMoriaState();
  const wallet_data = await vega_storage_provider.getWalletData(wallet_name);
  if (wallet_data == null) {
    throw new ValueError(`wallet not found, name: ${wallet_name}`);
  }
  const addr_info = genWalletAddressInfo(wallet_data);
  if (addr_info.private_key == null) {
    throw new Error(`wallet's private_key is not available!`);
  }
  const loan_params = MoriaV0.parseParametersFromLoanNFTCommitment(loan_utxo.output.token.nft.commitment);
  const wallet_input_coins: SpendableCoin[] = (await utxo_tracker.getUTXOListForLockingBytecode(addr_info.locking_bytecode)).map((utxo) => ({
    type: SpendableCoinType.P2PKH,
    output: utxo.output,
    outpoint: utxo.outpoint,
    key: addr_info.private_key as Uint8Array,
  }));
  const input_coins: SpendableCoin[] = selectInputCoins(wallet_input_coins, [ { token_id: musd_token_id, amount: loan_params.amount } ], { allow_nft: false, select_pure_bch: false });
  const payout_rules: PayoutRule[] = [
    {
      locking_bytecode: addr_info.locking_bytecode,
      type: PayoutAmountRuleType.CHANGE,
    },
  ];
  moria.setTxFeePerByte(txfee_per_byte == null ? 1n : txfee_per_byte);
  const result = moria.redeemWithSunsetSignature(moria_utxo, oracle_utxo, loan_utxo, sunset_datasig, input_coins, payout_rules);
  if (verify) {
    moria.verifyTxResult(result);
  }
  if (broadcast) {
    const client = cauldron_client_manager.getClient();
    if (client == null) {
      throw new ValueError('client is not available!');
    }
    await broadcastTransaction(client, result.txbin, false);
  }
  return result;
});

methods_wrapper.add('loan-add-collateral', async ({ vega_storage_provider, utxo_tracker, cauldron_client_manager, state_manager }: MoriaV0InputServices, wallet_name: string, loan_utxo: UTXOWithNFT, amount: bigint, { broadcast, txfee_per_byte, verify }: { broadcast?: boolean, txfee_per_byte?: bigint, verify?: boolean } = {}) => {
  const { musd_token_id } = MoriaV0.getConstants();
  const { moria } = await state_manager.requireMoriaState();
  const wallet_data = await vega_storage_provider.getWalletData(wallet_name);
  if (wallet_data == null) {
    throw new ValueError(`wallet not found, name: ${wallet_name}`);
  }
  const addr_info = genWalletAddressInfo(wallet_data);
  if (addr_info.private_key == null) {
    throw new Error(`wallet's private_key is not available!`);
  }
  const loan_params = MoriaV0.parseParametersFromLoanNFTCommitment(loan_utxo.output.token.nft.commitment);
  if (!uint8ArrayEqual(addr_info.public_key_hash, loan_params.borrower_pkh)) {
    throw new ValueError(`The selected wallet is not the owner of this loan, wallet name: ${wallet_name}`);
  }
  const wallet_input_coins: SpendableCoin[] = (await utxo_tracker.getUTXOListForLockingBytecode(addr_info.locking_bytecode)).map((utxo) => ({
    type: SpendableCoinType.P2PKH,
    output: utxo.output,
    outpoint: utxo.outpoint,
    key: addr_info.private_key as Uint8Array,
  }));
  const input_coins: SpendableCoin[] = selectInputCoins(wallet_input_coins, [ { token_id: NATIVE_BCH_TOKEN_ID, amount: amount + DEFAULT_TX_FEE_RESERVE } ], { allow_nft: false, select_pure_bch: false });
  const payout_rules: PayoutRule[] = [
    {
      locking_bytecode: addr_info.locking_bytecode,
      type: PayoutAmountRuleType.CHANGE,
    },
  ];
  moria.setTxFeePerByte(txfee_per_byte == null ? 1n : txfee_per_byte);
  const result = moria.addCollateral(loan_utxo, amount, addr_info.private_key, input_coins, payout_rules);
  if (verify) {
    moria.verifyTxResult(result);
  }
  if (broadcast) {
    const client = cauldron_client_manager.getClient();
    if (client == null) {
      throw new ValueError('client is not available!');
    }
    await broadcastTransaction(client, result.txbin, false);
  }
  return result;
});

methods_wrapper.add('reduce-loan', async ({ vega_storage_provider, utxo_tracker, cauldron_client_manager, state_manager }: MoriaV0InputServices, wallet_name: string, loan_utxo: UTXOWithNFT, next_collateral_rate: Fraction | 'MIN', { keep_loan_amount, broadcast, txfee_per_byte, verify }: { keep_loan_amount?: boolean, broadcast?: boolean, txfee_per_byte?: bigint, verify?: boolean } = {}) => {
  const { musd_token_id } = MoriaV0.getConstants();
  const { moria, moria_utxo, oracle_utxo } = await state_manager.requireMoriaState();
  const wallet_data = await vega_storage_provider.getWalletData(wallet_name);
  if (wallet_data == null) {
    throw new ValueError(`wallet not found, name: ${wallet_name}`);
  }
  const addr_info = genWalletAddressInfo(wallet_data);
  if (addr_info.private_key == null) {
    throw new Error(`wallet's private_key is not available!`);
  }
  const loan_params = MoriaV0.parseParametersFromLoanNFTCommitment(loan_utxo.output.token.nft.commitment);
  const oracle_message = MoriaV0.parseOracleMessageFromNFTCommitment(oracle_utxo.output.token.nft.commitment);
  const wallet_input_coins: SpendableCoin[] = (await utxo_tracker.getUTXOListForLockingBytecode(addr_info.locking_bytecode)).map((utxo) => ({
    type: SpendableCoinType.P2PKH,
    output: utxo.output,
    outpoint: utxo.outpoint,
    key: addr_info.private_key as Uint8Array,
  }));

  const musd_coins_sum: bigint = keep_loan_amount ? 0n :
    wallet_input_coins.filter((a) => a.output.token?.token_id == musd_token_id && a.output.token?.nft == null && a.output.token?.amount > 0n)
      .reduce((a: bigint, b: SpendableCoin) => a + (b.output as OutputWithFT).token.amount, 0n);
  if (!(musd_coins_sum < loan_params.amount)) {
    throw new ValueError(`Cannot perform reduce-loan when there's enough musd available in the wallet to repay the loan fully.`);
  }
  const next_loan_amount: bigint = loan_params.amount - musd_coins_sum;
  const next_collateral_amount: bigint = MoriaV0.calculateCollateralAmountForTargetRate(next_loan_amount, next_collateral_rate, oracle_message.price);
  const requirements: Array<{ token_id: TokenId, amount: bigint }> = [
    ...(keep_loan_amount ? [] : [{ token_id: musd_token_id, amount: musd_coins_sum }]),
    { token_id: NATIVE_BCH_TOKEN_ID, amount: next_collateral_amount + DEFAULT_TX_FEE_RESERVE },
  ];
  const input_coins: SpendableCoin[] = selectInputCoins(wallet_input_coins, requirements, { allow_nft: false, select_pure_bch: true });
  const payout_rules: PayoutRule[] = [
    {
      locking_bytecode: addr_info.locking_bytecode,
      type: PayoutAmountRuleType.CHANGE,
    },
  ];
  moria.setTxFeePerByte(txfee_per_byte == null ? 1n : txfee_per_byte);
  const result = moria.refiLoan(moria_utxo, oracle_utxo, next_loan_amount, next_collateral_amount, loan_utxo, addr_info.private_key, addr_info.public_key_hash, input_coins, payout_rules);
  if (verify) {
    for (const tx_result of result.tx_result_chain) {
      moria.verifyTxResult(tx_result);
    }
  }
  if (broadcast) {
    const client = cauldron_client_manager.getClient();
    if (client == null) {
      throw new ValueError('client is not available!');
    }
    for (const tx_result of result.tx_result_chain) {
      await broadcastTransaction(client, tx_result.txbin, false);
    }
  }
  return result;
});

export function getServices (): Array<{ name: string, service_constructor: ServiceConstructor }> {
  return [
    { name: 'state_manager', service_constructor: Moria0StateManager },
  ];
}

export function getSchema (): ModuleSchema {
  return {
    methods: Object.keys(methods_wrapper.methods).map((name) => ({ name })),
  };
}

export function getDependencies (): ModuleDependency[] {
  return [
    { name: 'electrum_client_manager' },
    { name: 'cauldron_client_manager' },
    { name: 'utxo_tracker' },
    { name: 'vega_storage_provider' },
    { name: 'console' },
    { name: '.state_manager', argument_name: 'state_manager' },
  ];
};


export async function init (services: MoriaV0InputServices): Promise<void> {
  methods_wrapper.defineServices(services);
}

export async function destroy (): Promise<void> {
}

export function getMethod (name: string): ModuleMethod | undefined {
  return methods_wrapper.methods[name];
}
