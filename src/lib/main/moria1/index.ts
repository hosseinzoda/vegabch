import type { default as UTXOTracker, UTXOTrackerEntry } from '../utxo-tracker.js';
import type ElectrumClientManager from '../electrum-client-manager.js';
import type { ElectrumClient, ElectrumClientEvents, RPCNotification as ElectrumRPCNotification } from '@electrum-cash/network';
import type { ModuleSchema, ModuleDependency, ModuleMethod, ServiceConstructor } from '../types.js';
import type { Moria1Status, Moria1MUSDStateManagerService, Moria1WalletSettings, MutationOptions } from './types.js';
import { EventEmitter } from 'node:events';
import VegaFileStorageProvider, {
  genWalletAddressInfo, WalletData, WalletMetadata,
  WalletAddressInfoWithPrivateKey,
} from '../vega-file-storage-provider.js';
import {
  uint8ArrayEqual, outputToLibauthOutput,
  Outpoint, Output, UTXO, SpendableCoin, SpendableCoinType, PayoutRule, PayoutAmountRuleType,
  NonFungibleTokenCapability,
  UTXOWithNFT, OutputWithNFT, TokenId, Fraction, TxResult,
  NATIVE_BCH_TOKEN_ID,
  createPayoutTx, CreatePayoutTxContext,
} from '@cashlab/common';
import {
  createMoriaMutationContext, createMoriaMUSDV1CompilerContext, MoriaMutator, verifyTxResult,
} from '@cashlab/moria/v1/moria.js';
import {
  withdrawPay2NFTHCoins, loanAddCollateral,
} from '@cashlab/moria/v1/compiler.js';
import {
  MoriaCompilerContext, MoriaMutationContext, MoriaTxResult, Pay2NFTHWithdrawEntry,
} from '@cashlab/moria/v1/types.js';
import {
  loanAgentNFTHashFromLoanCommitment, principalFromLoanCommitment,
  annualInterestBPFromLoanCommitment, timestampFromLoanCommitment,
  priceFromDelphiCommitment, timestampFromDelphiCommitment,
  dataSequenceFromDelphiCommitment, useFeeFromDelphiCommitment,
  bpValueFromBPOracleCommitment, timestampFromBPOracleCommitment, useFeeFromBPOracleCommitment,
  calcInterestOwed, outputNFTHash,
} from '@cashlab/moria/v1/util.js';

import {
  assertSuccess, lockingBytecodeToCashAddress, decodeTransaction, decodeAuthenticationInstructions,
  binToNumberUint32LE, vmNumberToBigInt, getDustThreshold,
  TransactionCommon as libauth_TransactionCommon,
  AuthenticationInstructionMalformed as libauth_AuthenticationInstructionMalformed,
  AuthenticationInstructionPush as libauth_AuthenticationInstructionPush
} from '@cashlab/common/libauth.js';
import {
  generateBytecodeWithLibauthCompiler,
} from '@cashlab/common/util-libauth-dependent.js';
import {
  bigIntMax, simpleJsonSerializer
} from '@cashlab/common/util.js';

import {
  hexToBin, binToHex, deferredPromise, convertUTXOToJSON, parseElectrumUTXO,
  tokensBalanceDetailFromUTXOList,
} from '../../util.js';
import { InvalidProgramState, ValueError, NotFoundError } from '../../exceptions.js';
import { initModuleMethodWrapper, selectInputCoins } from '../helpers.js';
import broadcastTransaction from '../network/broadcast-transaction.js';
import { validateMoriaWalletSettings, serializeMoriaWalletSettings, deserializeMoriaWalletSettings } from './helpers.js';


const getOutputMinAmount = (output: Output): bigint => {
  return getDustThreshold(outputToLibauthOutput(output));
};
let preferred_token_output_bch_amount: bigint | null = null;
// @ts-ignore
const getPreferredTokenOutputBCHAmount = (output: Output): bigint | null => {
  return preferred_token_output_bch_amount;
};

class UTXOSelector {
  token_id: string;
  capability: NonFungibleTokenCapability | null;
  min_commitment_size?: number;
  constructor ({
    token_id, capability, min_commitment_size,
  }: {
    token_id: string,
    capability: NonFungibleTokenCapability,
    min_commitment_size?: number
  }) {
    this.token_id = token_id;
    this.capability = capability;
    this.min_commitment_size = min_commitment_size;
  }

  select (list: UTXO[]): UTXO[] {
    return list.filter((a) => this.filter(a));
  }

  filter (utxo: UTXO): boolean {
    if (utxo.output.token == null) {
      return false;
    }
    if (utxo.output.token.token_id != this.token_id) {
      return false;
    }
    if (this.capability == null) {
      if (utxo.output.token.nft != null) {
        return false;
      }
    } else {
      if (utxo.output.token.nft == null) {
        return false;
      }
      if (utxo.output.token.nft.capability != this.capability ||
          (this.min_commitment_size != null && utxo.output.token.nft.commitment.length < this.min_commitment_size)) {
        return false;
      }
    }
    return true;
  }
}

class DelphiUTXOSelector extends UTXOSelector {
  select (list: UTXO[]): UTXO[] {
    const sublist = list.filter((a) => this.filter(a));
    const msgSeq = (a: UTXO): bigint => a.output.token?.nft?.commitment != null ? dataSequenceFromDelphiCommitment(a.output.token.nft.commitment) : -1n;
    if (sublist.length > 0) {
      let delphi_utxo: UTXO = sublist[0] as UTXO;
      let delphi_utxo_msg_seq = msgSeq(delphi_utxo);
      for (let i = 1; i < sublist.length; i++) {
        const item: UTXO = sublist[i] as UTXO;
        const item_msg_seq = msgSeq(item);
        if (item_msg_seq > delphi_utxo_msg_seq) {
          delphi_utxo = item;
          delphi_utxo_msg_seq = item_msg_seq;
        }
      }
      return [delphi_utxo];
    }
    return [];
  }
}

export class Moria1StateManager extends EventEmitter implements Moria1MUSDStateManagerService {
  _utxo_set_entries: { [name: string]: {
    tracker: UTXOTrackerEntry,
    selector: UTXOSelector,
    locking_bytecode: Uint8Array,
  } };
  _state_pending_update?: Promise<void>;
  _running_initialize_moria_state?: Promise<void>;
  _utxo_tracker: UTXOTracker;
  _electrum_client_manager: ElectrumClientManager;
  _console: Console;
  _compiler_context: MoriaCompilerContext;
  constructor () {
    super();
    this._compiler_context = createMoriaMUSDV1CompilerContext({
      getOutputMinAmount, getPreferredTokenOutputBCHAmount,
      txfee_per_byte: null,
    });
    this._utxo_set_entries = {};
    this._utxo_tracker = null as any;
    this._electrum_client_manager = null as any;
    this._console = null as any;
  }
  static create (): Moria1StateManager {
    return new Moria1StateManager();
  }
  static getDependencies (): ModuleDependency[] {
    return [
      { name: 'electrum_client_manager' },
      { name: 'utxo_tracker' },
      { name: 'console' },
    ];
  }
  async init ({ utxo_tracker, electrum_client_manager, console }: MoriaV1InputServices): Promise<void> {
    this._utxo_tracker = utxo_tracker;
    this._electrum_client_manager = electrum_client_manager;
    this._console = console;
    (this as any)._onTrackerEntryUpdate = this.onTrackerEntryUpdate.bind(this);
    utxo_tracker.addListener('update', (this as any)._onTrackerEntryUpdate);
    await this.initializeMoriaState();
  }
  async destroy (): Promise<void> {
    if (this._utxo_tracker != null) {
      this._utxo_tracker.removeListener('update', (this as any)._onTrackerEntryUpdate);
    }
    this._utxo_set_entries = {};
  }
  waitUntilPendingTrackersUpdate (): Promise<void> {
    return Promise.all(
      Object.values(this._utxo_set_entries)
        .filter(({ tracker }) => !!tracker.pending_request)
        .map(({ tracker }) => tracker.pending_request)
    )
      .then(() => undefined) as Promise<void>;
  }
  hasPendingTrackerUpdate (): boolean {
    return Object.values(this._utxo_set_entries)
      .filter(({ tracker }) => !!tracker.pending_request).length > 0;
  }
  onTrackerEntryUpdate (entry: UTXOTrackerEntry): void {
    if (entry.type != 'locking_bytecode') {
      return;
    }
    try {
      for (const [ name, target ] of Object.entries(this._utxo_set_entries)) {
        if (uint8ArrayEqual(entry.locking_bytecode, target.locking_bytecode)) {
          target.tracker = entry;
          this.emit('utxo-set-update', name, target);
          break;
        }
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
        if (this._utxo_tracker == null) {
          throw new Error('utxo_tracker is null!');
        }
        const promises = [];
        for (const { name, locking_bytecode, selector } of [
          {
            name: 'moria',
            locking_bytecode: generateBytecodeWithLibauthCompiler(this._compiler_context.moria_compiler, { scriptId: 'moria' }),
            selector: new UTXOSelector({
              token_id: this._compiler_context.moria_token_id,
              capability: NonFungibleTokenCapability.minting,
              min_commitment_size: 1,
            }),
          },
          {
            name: 'loan',
            locking_bytecode: generateBytecodeWithLibauthCompiler(this._compiler_context.moria_compiler, { scriptId: 'loan' }),
            selector: new UTXOSelector({
              token_id: this._compiler_context.moria_token_id,
              capability: NonFungibleTokenCapability.none,
              min_commitment_size: 40,
            }),
          },
          {
            name: 'delphi',
            locking_bytecode: generateBytecodeWithLibauthCompiler(this._compiler_context.delphi_compiler, { scriptId: '__main__' }),
            selector: new DelphiUTXOSelector({
              token_id: this._compiler_context.delphi_token_id,
              capability: NonFungibleTokenCapability.mutable,
              min_commitment_size: 16,
            }),
          },
          {
            name: 'batonminter',
            locking_bytecode: generateBytecodeWithLibauthCompiler(this._compiler_context.batonminter_compiler, { scriptId: '__main__' }),
            selector: new UTXOSelector({
              token_id: this._compiler_context.batonminter_token_id,
              capability: NonFungibleTokenCapability.minting,
              min_commitment_size: 1,
            }),
          },
          {
            name: 'bporacle',
            locking_bytecode: generateBytecodeWithLibauthCompiler(this._compiler_context.bporacle_compiler, { scriptId: '__main__' }),
            selector: new UTXOSelector({
              token_id: this._compiler_context.bporacle_token_id,
              capability: NonFungibleTokenCapability.mutable,
              min_commitment_size: 10,
            }),
          },
          {
            name: 'delphi_gp_updater',
            locking_bytecode: generateBytecodeWithLibauthCompiler(this._compiler_context.delphi_gp_updater_compiler, { scriptId: '__main__' }),
            selector: new UTXOSelector({
              token_id: binToHex(new Uint8Array((this._compiler_context.delphi_compiler.wallet_data.update_token_category as Uint8Array)).reverse()),
              capability: NonFungibleTokenCapability.none,
            }),
          },
        ]) {
          promises.push((async () => {
            const tracker = await this._utxo_tracker.addTrackerByLockingBytecode(locking_bytecode);
            this._utxo_set_entries[name] = { tracker, locking_bytecode, selector };
          })());
        }
        await Promise.all(promises);
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

  getAgentLoans (agent_nfthash: Uint8Array): UTXOWithNFT[] {
    return this.getLoans()
      .filter((a) => uint8ArrayEqual(
        loanAgentNFTHashFromLoanCommitment(a.output.token.nft.commitment),
        agent_nfthash
      ));
  }
  getLoans (): UTXOWithNFT[] {
    const entry = this._utxo_set_entries['loan'];
    if (entry == null) {
      throw new ValueError(`The state is not initialized!`);
    }
    return entry.selector.select(entry.tracker.data||[]) as UTXOWithNFT[];
  }
  getLoanByOutpoint (loan_outpoint: Outpoint): UTXOWithNFT | undefined {
    const entry = this._utxo_set_entries['loan'];
    if (entry == null) {
      throw new ValueError(`The state is not initialized!`);
    }
    return entry.selector.select(entry.tracker.data||[])
      .find((utxo) => uint8ArrayEqual(loan_outpoint.txhash, utxo.outpoint.txhash) && loan_outpoint.index === utxo.outpoint.index) as ReturnType<typeof this.getLoanByOutpoint>;
  }
  getMoriaUTXO (): UTXOWithNFT {
    const entry = this._utxo_set_entries['moria'];
    if (entry == null) {
      throw new ValueError(`The state is not initialized!`);
    }
    const items = entry.selector.select(entry.tracker.data||[]);
    if (items.length > 1) {
      throw new ValueError(`The blockchain has more than one Moria minting UTXO!`);
    }
    if (items.length != 1) {
      throw new ValueError(`The blockchain does not contain the Moria minting UTXO!`);
    }
    return items[0] as UTXOWithNFT;
  }
  getDelphiUTXO (): UTXOWithNFT {
    const entry = this._utxo_set_entries['delphi'];
    if (entry == null) {
      throw new ValueError(`The state is not initialized!`);
    }
    const items = entry.selector.select(entry.tracker.data||[]);
    if (items.length == 0) {
      throw new ValueError(`The blockchain does not contain any delphi UTXO (compatible with Moria V1)!`);
    }
    return items[0] as UTXOWithNFT;
  }
  getBPOracleUTXO (): UTXOWithNFT {
    const entry = this._utxo_set_entries['bporacle'];
    if (entry == null) {
      throw new ValueError(`The state is not initialized!`);
    }
    const items = entry.selector.select(entry.tracker.data||[]);
    if (items.length == 0) {
      throw new ValueError(`The blockchain does not contain the moria's V1 bporacle utxo!`);
    }
    return items[0] as UTXOWithNFT;
  }
  getBatonMinterUTXO (): UTXOWithNFT {
    const entry = this._utxo_set_entries['batonminter'];
    if (entry == null) {
      throw new ValueError(`The state is not initialized!`);
    }
    const items = entry.selector.select(entry.tracker.data||[]);
    if (items.length == 0) {
      throw new ValueError(`The blockchain does not contain the moria's V1 batonminter utxo!`);
    }
    return items[0] as UTXOWithNFT;
  }
  getDelphiGPUpdaterUTXO (): UTXOWithNFT | undefined {
    const entry = this._utxo_set_entries['delphi_gp_updater'];
    if (entry == null) {
      throw new ValueError(`The state is not initialized!`);
    }
    return entry.selector.select(entry.tracker.data||[])[0] as ReturnType<typeof this.getDelphiGPUpdaterUTXO>;
  }

  getCompilerContext (): MoriaCompilerContext {
    return this._compiler_context;
  }

  createMoriaMutationContext ({ txfee_per_byte }: { txfee_per_byte: Fraction }): MoriaMutationContext {
    return {
      compiler_context: {
        ...this._compiler_context,
        txfee_per_byte
      },
      moria_utxo: this.getMoriaUTXO(),
      delphi_utxo: this.getDelphiUTXO(),
      bporacle_utxo: this.getBPOracleUTXO(),
      batonminter_utxo: this.getBatonMinterUTXO(),
      delphi_gp_updater_utxo: this.getDelphiGPUpdaterUTXO(),
      list: [],
    };
  }

  /* NOT USED
  async fetchPay2NFTUTXOList (nfthash: Uint8Array): Promise<UTXO[]> {
    const p2nfth_locking_bytecode = generateBytecodeWithLibauthCompiler(this._compiler_context.p2nfth_compiler, {
      scriptId: '__main__',
      data: { bytecode: { nfthash } },
    });
    const cashaddr = assertSuccess(lockingBytecodeToCashAddress({
      bytecode: p2nfth_locking_bytecode,
      prefix: 'bitcoincash',
      tokenSupport: false,
    })).address;
    if (this._electrum_client_manager == null) {
      throw new Error('electrum_client_manager is null!');
    }
    const client = this._electrum_client_manager.getClient();
    if (client == null) {
      throw new ValueError('electrum client is not available!');
    }
    const result = await client.request('blockchain.address.listunspent', cashaddr, 'include_tokens');
    if (!Array.isArray(result)) {
      throw new Error('Expecting response of blockchain.address.listunspent to be an array');
    }
    for (const item of result) {
      item.locking_bytecode = p2nfth_locking_bytecode;
    }
    return result.map(parseElectrumUTXO);
  }
  */
}

class WalletManager extends EventEmitter {
  _metadata: WalletMetadata;
  _wallet_data: WalletData
  _settings: Moria1WalletSettings;
  _state_manager: Moria1StateManager;
  _utxo_tracker: UTXOTracker;
  _cauldron_client_manager: ElectrumClientManager;
  _agent_nft_list: UTXOWithNFT[];
  _wallet_main_addr_tracker?: UTXOTrackerEntry;
  _baton_entries: Array<{ locking_bytecode: Uint8Array, nfthash: Uint8Array, tracker: UTXOTrackerEntry }>;
  _baton_nfts: UTXOWithNFT[];
  _updating_baton_nft_entries: boolean;
  _baton_nft_entries_pending_refetch_count: number;
  _baton_nft_entries_pending_refetch_triggered: boolean;
  _batonminter_token_id: TokenId;
  _console: Console;
  constructor ({ state_manager, utxo_tracker, console, cauldron_client_manager }: MoriaV1InputServices,
               { metadata, wallet_data }: { metadata: WalletMetadata, wallet_data: WalletData },
               moria_settings: Moria1WalletSettings) {
    super();
    this._console = console;
    this._utxo_tracker = utxo_tracker;
    this._metadata = metadata;
    this._wallet_data = wallet_data;
    this._settings = moria_settings;
    this._state_manager = state_manager;
    this._cauldron_client_manager = cauldron_client_manager;
    this._baton_entries = [];
    this._updating_baton_nft_entries = false;
    this._baton_nft_entries_pending_refetch_count = 0;
    this._baton_nft_entries_pending_refetch_triggered = false;
    this._baton_nfts = [];
    this._agent_nft_list = [];
    const compiler_context = this._state_manager.getCompilerContext();
    this._batonminter_token_id = compiler_context.batonminter_token_id;
  }

  getWalletName (): string {
    return this._metadata.name;
  }
  getMoriaSettings (): Moria1WalletSettings {
    return this._settings;
  }
  updateMoriaSettings (settings: Moria1WalletSettings): void {
    this._settings = settings;
    // update baton entry, in case auto withdraw has been enabled
    for (const entry of this._baton_entries) {
      this.onBatonEntryUpdate(entry);
    }
  }

  getBatonNFTs (): UTXOWithNFT[] {
    return this._baton_nfts;
  }

  getP2NFTHListForAgentNFT (nfthash: Uint8Array): UTXO[] {
    const entry = this._baton_entries.find((a) => uint8ArrayEqual(a.nfthash, nfthash));
    if (entry == null) {
      const match_baton = this._baton_nfts.find((a) => uint8ArrayEqual(outputNFTHash(a.output), nfthash));
      if (match_baton == null) {
        throw new ValueError(`Unknown nfthash: ${binToHex(nfthash)}`);
      }
      return [];
    }
    return entry.tracker.data||[];
  }

  getAgentNFTList (): UTXOWithNFT[] {
    return this._baton_nfts;
  }

  getAgentNFT (nfthash: Uint8Array): UTXOWithNFT | undefined {
    return this._baton_nfts.find((a) => uint8ArrayEqual(outputNFTHash(a.output), nfthash));
  }

  _filterBatonNFTs (items: UTXO[]): UTXOWithNFT[] {
    return items.filter((utxo) => utxo.output.token != null && utxo.output.token.nft != null &&
      utxo.output.token.token_id == this._batonminter_token_id &&
      utxo.output.token.nft.commitment.length > 0 &&
      utxo.output.token.nft.capability == NonFungibleTokenCapability.none) as UTXOWithNFT[];
  }

  async init () {
    const addr_info = genWalletAddressInfo(this._wallet_data);
    this._wallet_main_addr_tracker = await this._utxo_tracker.addTrackerByLockingBytecode(addr_info.locking_bytecode);
    this._baton_nfts = this._filterBatonNFTs(this._wallet_main_addr_tracker.data||[]);
    this.onUpdateMainAddrUTXO();
    (this as any)._onTrackerEntryUpdate = this.onTrackerEntryUpdate.bind(this);
    this._utxo_tracker.addListener('update', (this as any)._onTrackerEntryUpdate);
  }
  async destroy () {
    this._utxo_tracker.removeListener('update', (this as any)._onTrackerEntryUpdate);
    this._wallet_main_addr_tracker = undefined;
  }

  async onTrackerEntryUpdate (entry: UTXOTrackerEntry): Promise<void> {
      if (entry.type != 'locking_bytecode') {
        return;
      }
      try {
        const addr_info = genWalletAddressInfo(this._wallet_data);
        if (uint8ArrayEqual(entry.locking_bytecode, addr_info.locking_bytecode)) {
          // main addr
          this._wallet_main_addr_tracker = entry;
          this._baton_nfts = this._filterBatonNFTs(entry.data||[]);
          this.onUpdateMainAddrUTXO();
          this.emit('main-addr-utxo-change');
        } else {
          const target_baton_entry = this._baton_entries.find((a) => uint8ArrayEqual(a.locking_bytecode, entry.locking_bytecode));
          if (target_baton_entry != null) {
            target_baton_entry.tracker = entry;
            this.onBatonEntryUpdate(target_baton_entry);
            this.emit('baton-entry-update', target_baton_entry);
          }
        }
      } catch (err) {
        this._console.warn('onTrackerEntryUpdate fail, ', err);
      }
  }

  onUpdateMainAddrUTXO () {
    this.doTriggerBatonNFTEntriesUpdate();
  }

  async doTriggerBatonNFTEntriesUpdate () {
    const MAX_REFETCH_COUNT = 10;
    if (this._updating_baton_nft_entries) {
      this._baton_nft_entries_pending_refetch_triggered = true;
      return;
    }
    this._updating_baton_nft_entries = true;
    try {
      const compiler_context = this._state_manager.getCompilerContext();
      const current_entries = [ ...this._baton_entries ];
      const next_entries = [];
      for (const baton_nft of this._baton_nfts) {
        const nfthash = outputNFTHash(baton_nft.output);
        const idx = current_entries.findIndex((a) => uint8ArrayEqual(a.nfthash, nfthash));
        if (idx == -1) {
          const p2nfth_locking_bytecode = generateBytecodeWithLibauthCompiler(compiler_context.p2nfth_compiler, { scriptId: '__main__', data: { bytecode: { nfthash } } });
          const tracker = await this._utxo_tracker.addTrackerByLockingBytecode(p2nfth_locking_bytecode);
          const entry = { locking_bytecode: p2nfth_locking_bytecode, nfthash, tracker };
          next_entries.push(entry);
          this.onBatonEntryUpdate(entry);
          this.emit('baton-entry-update', entry);
        } else {
          next_entries.push(current_entries.splice(idx, 1)[0] as any);
        }
      }
      this._baton_entries = next_entries;
    } catch (err) {
      this._console.warn(`onUpdateMainAddrUTXO failed!`, err);
    } finally {
      this._updating_baton_nft_entries = false;
      if (this._baton_nft_entries_pending_refetch_triggered) {
        this._baton_nft_entries_pending_refetch_count += 1;
        if (this._baton_nft_entries_pending_refetch_count > MAX_REFETCH_COUNT) {
          this._baton_nft_entries_pending_refetch_count = 0;
          this._baton_nft_entries_pending_refetch_triggered = false;
        } else {
          this.doTriggerBatonNFTEntriesUpdate();
        }
      }
    }
  }

  createTxP2NFTHWithdrawWithP2PKH (agent_utxo: UTXOWithNFT, p2nfth_utxos: UTXO[], { txfee_per_byte }: { txfee_per_byte: Fraction }): TxResult {
    const addr_info = genWalletAddressInfo(this._wallet_data);
    if (addr_info.private_key == null) {
      throw new Error(`wallet's private_key is not available!`);
    }
    const compiler_context = {
      ...this._state_manager.getCompilerContext(),
      txfee_per_byte,
    };
    const payout_rules: PayoutRule[] = [
      {
        locking_bytecode: addr_info.locking_bytecode,
        type: PayoutAmountRuleType.CHANGE,
      },
    ];
    const agent_coin: SpendableCoin<OutputWithNFT> = {
      type: SpendableCoinType.P2PKH,
      output: agent_utxo.output,
      outpoint: agent_utxo.outpoint,
      key: addr_info.private_key,
    };
    const entries: Pay2NFTHWithdrawEntry[] = [];
    for (const utxo of p2nfth_utxos) {
      entries.push({ utxo });
    }
    if (entries.length == 0) {
      throw new ValueError(`Empty entries!, withdrawPay2NFTHCoins`);
    }
    const createNFTOutput = (nft_utxo: UTXOWithNFT): OutputWithNFT => {
      /* no burning for now
      if (burn_agent_nft === true &&
        uint8ArrayEqual(nft_utxo.outpoint.txhash, agent_utxo.outpoint.txhash) &&
        nft_utxo.outpoint.index === agent_utxo.outpoint.index) {
        throw new BurnNFTException();
      }
      */
      const output = structuredClone(nft_utxo.output);
      output.locking_bytecode = addr_info.locking_bytecode;
      return output;
    };
    return withdrawPay2NFTHCoins(compiler_context, agent_coin, entries, [], payout_rules, { createNFTOutput });
  }

  async onBatonEntryUpdate (entry: { locking_bytecode: Uint8Array, nfthash: Uint8Array, tracker: UTXOTrackerEntry }): Promise<void> {
    if (this._settings.auto_withdraw_from_agent_p2nfth?.enabled === true) {
      try {
        const p2nfth_utxos = entry.tracker.data || [];
        if (p2nfth_utxos.length == 0) {
          return;
        }
        const client = this._cauldron_client_manager.getClient();
        if (client == null) {
          throw new ValueError('client is not available!');
        }
        const agent_nft = this.getAgentNFT(entry.nfthash);
        if (agent_nft == null) {
          throw new ValueError(`onBatonEntryUpdate agent_nft not found!, nfthash: ${entry.nfthash}`);
        }
        const result = this.createTxP2NFTHWithdrawWithP2PKH(agent_nft, p2nfth_utxos, { txfee_per_byte: this._settings.auto_withdraw_from_agent_p2nfth.txfee_per_byte });
        verifyTxResult(result);
        await broadcastTransaction(client, result.txbin, false);
      } catch (err) {
        this._console.warn('onBatonEntryUpdate fail (auto_withdraw_from_agent_p2nfth), ', err);
      }
    }
  }
}

const active_wallet_managers: WalletManager[] = [];
const requireWalletManager = (wallet_name: string): WalletManager => {
  const manager = active_wallet_managers.find((b) => b.getWalletName() == wallet_name);
  if (manager == null) {
    throw new ValueError(`wallet is not active, wallet_name: ${wallet_name}`);
  }
  return manager;
};

type MoriaV1InputServices = {
  electrum_client_manager: ElectrumClientManager;
  cauldron_client_manager: ElectrumClientManager;
  utxo_tracker: UTXOTracker;
  vega_storage_provider: VegaFileStorageProvider;
  console: Console;
  state_manager: Moria1StateManager;
};

const methods_wrapper = initModuleMethodWrapper();

methods_wrapper.add('status', async ({ vega_storage_provider, state_manager, console }: MoriaV1InputServices): Promise<Moria1Status> => {
  const bporacle_commitment = state_manager.getBPOracleUTXO().output.token.nft.commitment;
  const delphi_commitment = state_manager.getDelphiUTXO().output.token.nft.commitment;
  const wallet_metadata_list = await vega_storage_provider.getAllWalletsMetadata();
  let bporacle = null;
  try {
    bporacle = {
      value: bpValueFromBPOracleCommitment(bporacle_commitment),
      timestamp: timestampFromBPOracleCommitment(bporacle_commitment),
      use_fee: useFeeFromBPOracleCommitment(bporacle_commitment),
    };
  } catch (err) {
    console.warn(`Invalid bporacle commitment, `, err);
  }
  let delphi = null;
  try {
    delphi = {
      price: priceFromDelphiCommitment(delphi_commitment),
      timestamp: timestampFromDelphiCommitment(delphi_commitment),
      sequence_number: dataSequenceFromDelphiCommitment(delphi_commitment),
      use_fee: useFeeFromDelphiCommitment(delphi_commitment),
    };
  } catch (err) {
    console.warn(`Invalid bporacle commitment, `, err);
  }
  return {
    bporacle, delphi,
    wallet_moria_settings_list: wallet_metadata_list
      .map((a) => {
        const active_manager = active_wallet_managers.find((b) => b.getWalletName() == a.name);
        return {
          wallet_name: a.name,
          settings: active_manager ? active_manager.getMoriaSettings() : (a.settings.moria1 ? deserializeMoriaWalletSettings(a.settings.moria1) : null),
        };
      })
      .filter((a) => a.settings != null),
    active_wallet_managers: active_wallet_managers.map((a) => {
      return {
        wallet_name: a.getWalletName(),
        agent_nft_list: a.getAgentNFTList()
          .map((agent: UTXOWithNFT) => {
            const nfthash = outputNFTHash(agent.output);
            return {
              agent, nfthash,
              p2nfth_list: a.getP2NFTHListForAgentNFT(nfthash),
              loan_list: state_manager.getAgentLoans(nfthash),
            };
          }),
      };
    }),
  };
});

async function onVegaStorageSettingsChange (settings: { [name: string]: any }) {
  if ('preferred-token-output-bch-amount' in settings && settings['preferred-token-output-bch-amount'] != '') {
    try {
      const value = BigInt(settings['preferred-token-output-bch-amount']);
      if (!(value > 0n)) {
        throw new Error('value is expected to be a positive integer');
      }
      preferred_token_output_bch_amount = value;
    } catch (err) {
      preferred_token_output_bch_amount = null;
    }
  } else {
    preferred_token_output_bch_amount = null;
  }
}

async function onMoriaWalletSettingsChange (metadata: WalletMetadata): Promise<void> {
  const wallet_name = metadata.name;
  const services: MoriaV1InputServices = methods_wrapper.getServices();
  if (services == null) {
    return; // no services!, pass
  }
  const { vega_storage_provider, console } = services;
  try {
    const moria_settings: Moria1WalletSettings | undefined = metadata.settings.moria1 ?
      deserializeMoriaWalletSettings(metadata.settings.moria1) : undefined;
    const manager_idx = active_wallet_managers.findIndex((a) => a.getWalletName() == wallet_name);
    if (moria_settings == null || !moria_settings.enabled) {
      if (manager_idx != -1) {
        const manager = active_wallet_managers.splice(manager_idx, 1)[0] as WalletManager;
        await manager.destroy();
      }
    } else {
      const existing_manager = manager_idx != -1 ? active_wallet_managers[manager_idx] : null;
      if (existing_manager != null) {
        existing_manager.updateMoriaSettings(moria_settings);
      } else {
        const wallet = await vega_storage_provider.getWalletDataWithMetadata(wallet_name);
        if (wallet == null) {
          throw new ValueError(`wallet not found, name: ${wallet_name}`);
        }
        const manager = new WalletManager(services, wallet, moria_settings)
        await manager.init();
        active_wallet_managers.push(manager);
      }
    }
  } catch (err) {
    console.warn(`moria1's wallet manager init/update failed, wallet_name: ${wallet_name}`, err);
  }
}

methods_wrapper.add('set-wallet-settings', async (services: MoriaV1InputServices, wallet_name: string, settings: Moria1WalletSettings) => {
  const { state_manager, vega_storage_provider } = services;
  const metadata = await vega_storage_provider.getWalletMetadata(wallet_name);
  if (metadata == null) {
    throw new ValueError(`wallet does not exists, name: ${wallet_name}`);
  }
  validateMoriaWalletSettings(settings);
  metadata.settings.moria1 = serializeMoriaWalletSettings(settings);
  await vega_storage_provider.updateWalletMetadata(metadata);
});
methods_wrapper.add('get-wallet-settings', async ({ vega_storage_provider }: MoriaV1InputServices, wallet_name: string) => {
  const active_manager = active_wallet_managers.find((a) => a.getWalletName() == wallet_name);
  if (active_manager != null) {
    return active_manager.getMoriaSettings();
  }
  const metadata = await vega_storage_provider.getWalletMetadata(wallet_name);
  if (metadata == null) {
    throw new ValueError(`wallet does not exists, name: ${wallet_name}`);
  }
  if (metadata.settings.moria1 == null) {
    return null;
  }
  return deserializeMoriaWalletSettings(metadata.settings.moria1);
});

// @ts-ignore
methods_wrapper.add('wallet-get-agent-nft-list', async (services: MoriaV1InputServices, wallet_name: string) => {
  const manager = active_wallet_managers.find((a) => a.getWalletName() == wallet_name);
  if (manager == null) {
    throw new ValueError(`wallet manager is not active!, wallet_name: ${wallet_name}`);
  }
  return manager.getAgentNFTList();
});

methods_wrapper.add('wallet-withdraw-from-agent-p2nfth', async ({ cauldron_client_manager }: MoriaV1InputServices, wallet_name: string, agent_nfthash: Uint8Array, options: /*{ burn_agent_nfth?: boolean } &*/MutationOptions) => {
  const manager = active_wallet_managers.find((a) => a.getWalletName() == wallet_name);
  if (manager == null) {
    throw new ValueError(`wallet manager is not active!, wallet_name: ${wallet_name}`);
  }
  const agent_nft = manager.getAgentNFT(agent_nfthash);
  if (agent_nft == null) {
    throw new ValueError(`agent_nft not found!, nfthash: ${agent_nfthash}`);
  }
  const p2nfth_utxos = manager.getP2NFTHListForAgentNFT(agent_nfthash);
  if (p2nfth_utxos.length == 0) {
    throw new ValueError(`Nothing to withdraw!`);
  }
  const result = manager.createTxP2NFTHWithdrawWithP2PKH(agent_nft, p2nfth_utxos, { /*burn_agent_nfth: options.burn_agent_nfth,*/ txfee_per_byte: options.txfee_per_byte });
  if (options.verify) {
    verifyTxResult(result);
  }
  if (options.broadcast) {
    const client = cauldron_client_manager.getClient();
    if (client == null) {
      throw new ValueError('client is not available!');
    }
    await broadcastTransaction(client, result.txbin, false);
  }
  return result;
});

methods_wrapper.add('get-loans', async ({ state_manager }: MoriaV1InputServices): Promise<UTXOWithNFT[]> => {
  return state_manager.getLoans();
});

methods_wrapper.add('get-agent-loans', async ({ state_manager }: MoriaV1InputServices, agent_nfthash: Uint8Array): Promise<UTXOWithNFT[]> => {
  return state_manager.getAgentLoans(agent_nfthash);
});

methods_wrapper.add('get-liquidable-loans', async ({ state_manager }: MoriaV1InputServices): Promise<UTXOWithNFT[]> => {
  const delphi_price: bigint = priceFromDelphiCommitment(state_manager.getDelphiUTXO().output.token.nft.commitment);
  const delphi_timestamp: bigint = timestampFromDelphiCommitment(state_manager.getDelphiUTXO().output.token.nft.commitment);
  return state_manager.getLoans()
    .filter((loan_utxo) => {
      const loan_principal: bigint = principalFromLoanCommitment(loan_utxo.output.token.nft.commitment);
      const interest_owed: bigint = calcInterestOwed(
        loan_principal,
        annualInterestBPFromLoanCommitment(loan_utxo.output.token.nft.commitment),
        delphi_timestamp,
         timestampFromLoanCommitment(loan_utxo.output.token.nft.commitment)
      );
      const total_owed = loan_principal + interest_owed;
      const max_borrow = ((loan_utxo.output.amount * 10n) / 12n) * delphi_price / 100000000n;
      return total_owed > max_borrow;
    });
});

methods_wrapper.add('get-redeemable-loans', async ({ state_manager }: MoriaV1InputServices): Promise<UTXOWithNFT[]> => {
  const bporacle_value = bpValueFromBPOracleCommitment(state_manager.getBPOracleUTXO().output.token.nft.commitment);
  return state_manager.getLoans()
    .filter((utxo) => annualInterestBPFromLoanCommitment(utxo.output.token.nft.commitment) <= bporacle_value);
});

const DEFAULT_TX_FEE_RESERVE = 5000n;

const prepareInputCoinsDataFromAWallet = async ({ vega_storage_provider, utxo_tracker }: { vega_storage_provider: VegaFileStorageProvider, utxo_tracker: UTXOTracker }, wallet_name: string): Promise<{ wallet_data: WalletData, addr_info: WalletAddressInfoWithPrivateKey, wallet_input_coins: SpendableCoin[] }> => {
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
  return { wallet_data, addr_info: addr_info as WalletAddressInfoWithPrivateKey, wallet_input_coins };
};

methods_wrapper.add('mint-loan', async ({ vega_storage_provider, utxo_tracker, cauldron_client_manager, state_manager }: MoriaV1InputServices, wallet_name: string, params: { loan_amount: bigint, collateral_amount: bigint, annual_interest_bp: bigint }, options: { should_mint_loan_agent?: boolean } & MutationOptions) => {
  const manager = requireWalletManager(wallet_name);
  const agent_nft_list = manager.getAgentNFTList();
  const mutation_context = state_manager.createMoriaMutationContext({ txfee_per_byte: options.txfee_per_byte });
  const moria_mutator = new MoriaMutator(mutation_context);
  const { addr_info, wallet_input_coins } = await prepareInputCoinsDataFromAWallet({ vega_storage_provider, utxo_tracker }, wallet_name);
  const existing_agent_coin: SpendableCoin<OutputWithNFT> | null =
    options.should_mint_loan_agent === true || agent_nft_list.length == 0 ? null : {
      type: SpendableCoinType.P2PKH,
      output: (agent_nft_list[0] as UTXOWithNFT).output,
      outpoint: (agent_nft_list[0] as UTXOWithNFT).outpoint,
      key: addr_info.private_key,
    };
  const fixed_fees: bigint = 
    (existing_agent_coin == null ? 1000n : 0n) + // batonminer fee
    useFeeFromDelphiCommitment(mutation_context.delphi_utxo.output.token.nft.commitment);
  const funding_coins: SpendableCoin[] = selectInputCoins(wallet_input_coins, [ { token_id: NATIVE_BCH_TOKEN_ID, amount: params.collateral_amount + DEFAULT_TX_FEE_RESERVE + fixed_fees } ], { allow_nft: false, select_pure_bch: true });
  const payout_rules: PayoutRule[] = [
    {
      locking_bytecode: addr_info.locking_bytecode,
      type: PayoutAmountRuleType.CHANGE,
    },
  ];
  let result;
  if (existing_agent_coin != null) {
    result = moria_mutator.mintLoanWithExistingLoanAgent(params, funding_coins, existing_agent_coin, addr_info.locking_bytecode, payout_rules);
  } else {
    result = moria_mutator.mintLoanWithBatonMinter(params, funding_coins, addr_info.locking_bytecode, payout_rules);
  }
  if (options.verify === true) {
    verifyTxResult(result);
  }
  if (options.broadcast === true) {
    const client = cauldron_client_manager.getClient();
    if (client == null) {
      throw new ValueError('client is not available!');
    }
    await broadcastTransaction(client, result.txbin, false);
  }
  return result;
});

methods_wrapper.add('refi-loan', async ({ vega_storage_provider, utxo_tracker, cauldron_client_manager, state_manager }: MoriaV1InputServices, wallet_name: string, loan_outpoint: Outpoint, refi_params: { loan_amount: bigint, collateral_amount: bigint, annual_interest_bp: bigint }, options: MutationOptions) => {
  const loan_utxo = state_manager.getLoanByOutpoint(loan_outpoint);
  if (loan_utxo == null) {
    throw new NotFoundError(`No loan with the input loan_outpoint found!`);
  }
  const agent_nfthash = loanAgentNFTHashFromLoanCommitment(loan_utxo.output.token.nft.commitment);
  const manager = requireWalletManager(wallet_name);
  const agent_nft = manager.getAgentNFT(agent_nfthash);
  if (agent_nft == null) {
    throw new ValueError(`Agent for this loan does not exist in the selected wallet, wallet_name: ${wallet_name}`);
  }
  const mutation_context = state_manager.createMoriaMutationContext({ txfee_per_byte: options.txfee_per_byte });
  const musd_token_id = mutation_context.compiler_context.moria_token_id;
  const moria_mutator = new MoriaMutator(mutation_context);
  const delphi_timestamp: bigint = timestampFromDelphiCommitment(mutation_context.delphi_utxo.output.token.nft.commitment);
  const loan_principal: bigint = principalFromLoanCommitment(loan_utxo.output.token.nft.commitment);
  const interest_owed: bigint = calcInterestOwed(
    loan_principal,
    annualInterestBPFromLoanCommitment(loan_utxo.output.token.nft.commitment),
    delphi_timestamp,
    timestampFromLoanCommitment(loan_utxo.output.token.nft.commitment)
  );
  const total_owed = loan_principal + interest_owed;

  const required_musd = bigIntMax(total_owed - refi_params.loan_amount, 0n)
  const fixed_fees: bigint =
    useFeeFromDelphiCommitment(mutation_context.delphi_utxo.output.token.nft.commitment);
  const required_bch = bigIntMax(refi_params.collateral_amount - loan_utxo.output.amount + DEFAULT_TX_FEE_RESERVE + fixed_fees, 0n);

  const { addr_info, wallet_input_coins } = await prepareInputCoinsDataFromAWallet({ vega_storage_provider, utxo_tracker }, wallet_name);
  const agent_coin: SpendableCoin<OutputWithNFT> = {
    type: SpendableCoinType.P2PKH,
    output: agent_nft.output,
    outpoint: agent_nft.outpoint,
    key: addr_info.private_key,
  };
  const funding_coins: SpendableCoin[] = selectInputCoins(wallet_input_coins, [
    { token_id: musd_token_id, amount: required_musd },
    { token_id: NATIVE_BCH_TOKEN_ID, amount: required_bch },
  ], { allow_nft: false, include_tokens: [ musd_token_id ] });
  const payout_rules: PayoutRule[] = [
    {
      locking_bytecode: addr_info.locking_bytecode,
      type: PayoutAmountRuleType.CHANGE,
    },
  ];
  const result = moria_mutator.refiLoan(loan_utxo, refi_params, agent_coin, funding_coins, addr_info.locking_bytecode, payout_rules);
  if (options.verify === true) {
    verifyTxResult(result);
  }
  if (options.broadcast === true) {
    const client = cauldron_client_manager.getClient();
    if (client == null) {
      throw new ValueError('client is not available!');
    }
    await broadcastTransaction(client, result.txbin, false);
  }
  return result;
});

methods_wrapper.add('repay-loan', async ({ vega_storage_provider, utxo_tracker, cauldron_client_manager, state_manager }: MoriaV1InputServices, wallet_name: string, loan_outpoint: Outpoint, options: /* { burn_agent_nft?: boolean } & */ MutationOptions) => {
  const loan_utxo = state_manager.getLoanByOutpoint(loan_outpoint);
  if (loan_utxo == null) {
    throw new NotFoundError(`No loan with the input loan_outpoint found!`);
  }
  const agent_nfthash = loanAgentNFTHashFromLoanCommitment(loan_utxo.output.token.nft.commitment);
  const manager = requireWalletManager(wallet_name);
  const agent_nft = manager.getAgentNFT(agent_nfthash);
  if (agent_nft == null) {
    throw new ValueError(`Agent for this loan does not exist in the selected wallet, wallet_name: ${wallet_name}`);
  }
  const mutation_context = state_manager.createMoriaMutationContext({ txfee_per_byte: options.txfee_per_byte });
  const musd_token_id = mutation_context.compiler_context.moria_token_id;
  const moria_mutator = new MoriaMutator(mutation_context);
  const delphi_timestamp: bigint = timestampFromDelphiCommitment(mutation_context.delphi_utxo.output.token.nft.commitment);
  const loan_principal: bigint = principalFromLoanCommitment(loan_utxo.output.token.nft.commitment);
  const interest_owed: bigint = calcInterestOwed(
    loan_principal,
    annualInterestBPFromLoanCommitment(loan_utxo.output.token.nft.commitment),
    delphi_timestamp,
    timestampFromLoanCommitment(loan_utxo.output.token.nft.commitment)
  );
  const total_owed = loan_principal + interest_owed;
  const { addr_info, wallet_input_coins } = await prepareInputCoinsDataFromAWallet({ vega_storage_provider, utxo_tracker }, wallet_name);
  const agent_coin: SpendableCoin<OutputWithNFT> = {
    type: SpendableCoinType.P2PKH,
    output: agent_nft.output,
    outpoint: agent_nft.outpoint,
    key: addr_info.private_key,
  };
  const funding_coins: SpendableCoin[] = selectInputCoins(wallet_input_coins, [ { token_id: musd_token_id, amount: total_owed } ], { allow_nft: false, select_pure_bch: false });
  const payout_rules: PayoutRule[] = [
    {
      locking_bytecode: addr_info.locking_bytecode,
      type: PayoutAmountRuleType.CHANGE,
    },
  ];
  let output_agent_locking_bytecode: Uint8Array/* | BurnNFTException */ = addr_info.locking_bytecode;
  /* no burning for now
  if (options.burn_agent_nft === true) {
    // verify the agent has no other pending loan or p2nfth
    const all_loans = state_manager.getAgentLoans(agent_nfthash);
    if (all_Loans.filter((a) => !(uint8ArrayEqual(a.outpoint.txhash, loan_utxo.outpoint.txhash) && a.outpoint.index === loan_utxo.outpoint.index)).length > 0) {
      throw new ValueError(`Should not burn the agent nft, One or more other active loans do exist!`);
    }
    if ((await manager.fetchPay2NFTUTXOList(agent_nfthash)).length > 0 ||
        manager.getP2NFTHListForAgentNFT(agent_nfthash).length > 0) {
      throw new ValueError(`Should not burn the agent nft, One or more pay2nfth d o exist!`);
    }
    output_agent_locking_bytecode = new BurnNFTException();
  }
  */
  const result = moria_mutator.repayLoan(loan_utxo, agent_coin, funding_coins, output_agent_locking_bytecode, payout_rules);
  if (options.verify === true) {
    verifyTxResult(result);
  }
  if (options.broadcast === true) {
    const client = cauldron_client_manager.getClient();
    if (client == null) {
      throw new ValueError('client is not available!');
    }
    await broadcastTransaction(client, result.txbin, false);
  }
  return result;
});

methods_wrapper.add('liquidate-loan', async ({ vega_storage_provider, utxo_tracker, cauldron_client_manager, state_manager }: MoriaV1InputServices, wallet_name: string, loan_outpoint: Outpoint, options: MutationOptions) => {
  const loan_utxo = state_manager.getLoanByOutpoint(loan_outpoint);
  if (loan_utxo == null) {
    throw new NotFoundError(`No loan with the input loan_outpoint found!`);
  }
  const mutation_context = state_manager.createMoriaMutationContext({ txfee_per_byte: options.txfee_per_byte });
  const musd_token_id = mutation_context.compiler_context.moria_token_id;
  const moria_mutator = new MoriaMutator(mutation_context);
  const delphi_timestamp: bigint = timestampFromDelphiCommitment(mutation_context.delphi_utxo.output.token.nft.commitment);
  const loan_principal: bigint = principalFromLoanCommitment(loan_utxo.output.token.nft.commitment);
  const interest_owed: bigint = calcInterestOwed(
    loan_principal,
    annualInterestBPFromLoanCommitment(loan_utxo.output.token.nft.commitment),
    delphi_timestamp,
    timestampFromLoanCommitment(loan_utxo.output.token.nft.commitment)
  );
  const total_owed = loan_principal + interest_owed;
  const { addr_info, wallet_input_coins } = await prepareInputCoinsDataFromAWallet({ vega_storage_provider, utxo_tracker }, wallet_name);
  const funding_coins: SpendableCoin[] = selectInputCoins(wallet_input_coins, [ { token_id: musd_token_id, amount: total_owed } ], { allow_nft: false, select_pure_bch: false });
  const payout_rules: PayoutRule[] = [
    {
      locking_bytecode: addr_info.locking_bytecode,
      type: PayoutAmountRuleType.CHANGE,
    },
  ];
  const result = moria_mutator.liquidateLoan(loan_utxo, funding_coins, payout_rules);
  if (options.verify === true) {
    verifyTxResult(result);
  }
  if (options.broadcast === true) {
    const client = cauldron_client_manager.getClient();
    if (client == null) {
      throw new ValueError('client is not available!');
    }
    await broadcastTransaction(client, result.txbin, false);
  }
  return result;
});

methods_wrapper.add('redeem-loan', async ({ vega_storage_provider, utxo_tracker, cauldron_client_manager, state_manager }: MoriaV1InputServices, wallet_name: string, loan_outpoint: Outpoint, options: { split_payout_tokens: boolean } & MutationOptions) => {
  const loan_utxo = state_manager.getLoanByOutpoint(loan_outpoint);
  if (loan_utxo == null) {
    throw new NotFoundError(`No loan with the input loan_outpoint found!`);
  }
  const mutation_context = state_manager.createMoriaMutationContext({ txfee_per_byte: options.txfee_per_byte });
  const musd_token_id = mutation_context.compiler_context.moria_token_id;
  const moria_mutator = new MoriaMutator(mutation_context);
  const delphi_timestamp: bigint = timestampFromDelphiCommitment(mutation_context.delphi_utxo.output.token.nft.commitment);
  const loan_principal: bigint = principalFromLoanCommitment(loan_utxo.output.token.nft.commitment);
  const interest_owed: bigint = calcInterestOwed(
    loan_principal,
    annualInterestBPFromLoanCommitment(loan_utxo.output.token.nft.commitment),
    delphi_timestamp,
    timestampFromLoanCommitment(loan_utxo.output.token.nft.commitment)
  );
  const total_owed = loan_principal + interest_owed;
  const { addr_info, wallet_input_coins } = await prepareInputCoinsDataFromAWallet({ vega_storage_provider, utxo_tracker }, wallet_name);
  const funding_coins: SpendableCoin[] = selectInputCoins(wallet_input_coins, [ { token_id: musd_token_id, amount: total_owed } ], { allow_nft: false, select_pure_bch: false });
  const payout_rules: PayoutRule[] = [
    {
      locking_bytecode: addr_info.locking_bytecode,
      type: PayoutAmountRuleType.CHANGE,
      allow_mixing_native_and_token: true,
    },
  ];
  const result = moria_mutator.redeemLoan(loan_utxo, funding_coins, payout_rules);
  if (options.verify === true) {
    verifyTxResult(result);
  }

  let split_tx_result = null;
  if (options.split_payout_tokens === true) {
    const split_threshold = 10000n;
    const split_input_coins: SpendableCoin[] = result.payouts
      .filter((a) => a.output.token != null && a.output.amount > split_threshold && a.output.token.nft == null)
      .map((utxo) => ({
        type: SpendableCoinType.P2PKH,
        output: utxo.output,
        outpoint: utxo.outpoint,
        key: addr_info.private_key as Uint8Array,
      }));
    const create_payout_tx_context: CreatePayoutTxContext = {
      getOutputMinAmount, getPreferredTokenOutputBCHAmount,
      txfee_per_byte: options.txfee_per_byte,
    };
    const split_payout_rules: PayoutRule[] = [
      {
        locking_bytecode: addr_info.locking_bytecode,
        type: PayoutAmountRuleType.CHANGE,
      },
    ];
    split_tx_result = createPayoutTx(create_payout_tx_context, split_input_coins, split_payout_rules);
  }

  if (options.broadcast === true) {
    const client = cauldron_client_manager.getClient();
    if (client == null) {
      throw new ValueError('client is not available!');
    }
    await broadcastTransaction(client, result.txbin, false);
    if (split_tx_result != null) {
      await broadcastTransaction(client, split_tx_result.txbin, false);
    }
  }

  return {
    redeem_result: result,
    txlist: [ result, split_tx_result ].filter((a) => !!a),
  };
});

methods_wrapper.add('loan-add-collateral', async ({ vega_storage_provider, utxo_tracker, cauldron_client_manager, state_manager }: MoriaV1InputServices, wallet_name: string, loan_outpoint: Outpoint, additional_amount: bigint, options: MutationOptions) => {
  const loan_utxo = state_manager.getLoanByOutpoint(loan_outpoint);
  if (loan_utxo == null) {
    throw new NotFoundError(`No loan with the input loan_outpoint found!`);
  }
  const agent_nfthash = loanAgentNFTHashFromLoanCommitment(loan_utxo.output.token.nft.commitment);
  const manager = requireWalletManager(wallet_name);
  const agent_nft = manager.getAgentNFT(agent_nfthash);
  if (agent_nft == null) {
    throw new ValueError(`Agent for this loan does not exist in the selected wallet, wallet_name: ${wallet_name}`);
  }
  const compiler_context = {
    ...state_manager.getCompilerContext(),
    txfee_per_byte: options.txfee_per_byte,
  };
  const { addr_info, wallet_input_coins } = await prepareInputCoinsDataFromAWallet({ vega_storage_provider, utxo_tracker }, wallet_name);
  const funding_coins: SpendableCoin[] = selectInputCoins(wallet_input_coins, [ { token_id: NATIVE_BCH_TOKEN_ID, amount: additional_amount + DEFAULT_TX_FEE_RESERVE } ], { allow_nft: false, select_pure_bch: false });
  const payout_rules: PayoutRule[] = [
    {
      locking_bytecode: addr_info.locking_bytecode,
      type: PayoutAmountRuleType.CHANGE,
    },
  ];
  const agent_coin: SpendableCoin<OutputWithNFT> = {
    type: SpendableCoinType.P2PKH,
    output: agent_nft.output,
    outpoint: agent_nft.outpoint,
    key: addr_info.private_key,
  };
  const result = loanAddCollateral(compiler_context, loan_utxo, agent_coin, funding_coins, additional_amount, addr_info.locking_bytecode, payout_rules);
  if (options.verify === true) {
    verifyTxResult(result);
  }
  if (options.broadcast === true) {
    const client = cauldron_client_manager.getClient();
    if (client == null) {
      throw new ValueError('client is not available!');
    }
    await broadcastTransaction(client, result.txbin, false);
  }
  return result;
});

export function getServices (): Array<{ name: string, service_constructor: ServiceConstructor }> {
  return [
    { name: 'state_manager', service_constructor: Moria1StateManager },
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


export async function init (services: MoriaV1InputServices): Promise<void> {
  methods_wrapper.defineServices(services);
  const { state_manager, vega_storage_provider, console } = services;
  { // apply vega settings
    const settings = await vega_storage_provider.getSettings();
    onVegaStorageSettingsChange(settings)
    vega_storage_provider.addListener('settings-change', onVegaStorageSettingsChange);
  }
  vega_storage_provider.addListener('wallet-metadata-change', onMoriaWalletSettingsChange);
  const promises = [];
  for (const { metadata, wallet_data } of (await vega_storage_provider.getAllWallets())) {
    promises.push((async () => {
      try {
        const moria_settings = metadata.settings.moria1 != null ? deserializeMoriaWalletSettings(metadata.settings.moria1) : null;
        if (moria_settings != null && moria_settings.enabled === true) {
          const manager = new WalletManager(services, { metadata, wallet_data }, moria_settings)
          await manager.init();
          active_wallet_managers.push(manager);
        }
      } catch (err) {
        console.warn(`(moria1) Caught error while trying to init a wallet manager, wallet_name: ${metadata.name}, `, err);
      }
    })());
  }
  await Promise.all(promises);
}

export async function destroy (): Promise<void> {
  const services = methods_wrapper.getServices();
  if (services != null) {
    services.vega_storage_provider.removeListener('settings-change', onVegaStorageSettingsChange);
    services.vega_storage_provider.removeListener('wallet-metadata-change', onMoriaWalletSettingsChange);
  }
  const promises = [];
  while (active_wallet_managers.length > 0) {
    const manager = active_wallet_managers.shift();
    if (manager != null) {
      promises.push((async () => {
        try {
          await manager.destroy()
        } catch (err) {
          console.warn(`(moria1) Caught error while trying to destroy a wallet manager, wallet_name: ${manager.getWalletName()}, `, err);
        }
      }));
    }
  }
  await Promise.all(promises);
}

export function getMethod (name: string): ModuleMethod | undefined {
  return methods_wrapper.methods[name];
}
