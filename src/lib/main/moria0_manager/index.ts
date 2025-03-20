import type { default as UTXOTracker, UTXOTrackerEntry } from '../utxo-tracker.js';
import type ElectrumClientManager from '../electrum-client-manager.js';
import VegaFileStorageProvider, { genWalletAddressInfo, WalletData, WalletAddressInfo } from '../vega-file-storage-provider.js';
import { Moria0StateManagerService, Moria0State } from '../moria0/types.js';
import type { ModuleSchema, ModuleDependency, ModuleMethod, Service, ServiceConstructor } from '../types.js';
import {
  moria as cashlab_moria, common as cashlab_common, libauth,
  InvalidProgramState,
  UTXO, UTXOWithNFT, Output, OutputWithFT, TokenId, Fraction, TxResult,
  NATIVE_BCH_TOKEN_ID, SpendableCoin, SpendableCoinType, PayoutRule, PayoutAmountRuleType, 
} from 'cashlab';
import type { OracleNFTParameters } from 'cashlab/build/moria/v0/types.js';
const { MoriaV0 } = cashlab_moria;
const { FIXED_PAYOUT_RULE_APPLY_MIN_AMOUNT, convertTokenIdToUint8Array } = cashlab_common;
import { serializeMessage } from '../../json-ipc-serializer.js';

const { uint8ArrayEqual, convertFractionDenominator, bigIntArraySortPolyfill, bigIntMax, bigIntMin } = cashlab_common;

import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import querystring from 'node:querystring';
import * as fs from 'node:fs/promises';
import {
  hexToBin, binToHex, deferredPromise, convertUTXOToJSON, InOrderSingleThreadedExecutionQueue,
  convertToJSONSerializable,
} from '../../util.js';
import { ValueError, Exception } from '../../exceptions.js';
import { initModuleMethodWrapper, selectInputCoins } from '../helpers.js';
import broadcastTransaction from '../network/broadcast-transaction.js';

import type {
  NotificationMessage, Moria0LoanManagerSettings, MoriaV0ManagerStorageData,
  Moria0LoanManagerStatus,
} from './types.js';
import {
  loanManagerSettingsFromStorageData, loanManagerSettingsDataForStorageData,
  validateNotificationHookData, validateSettings,
} from './helpers.js';

import * as nodemailer from 'nodemailer';

type TimeoutId = ReturnType<typeof setTimeout>;
type MoriaV0ManagerInputServices = {
  electrum_client_manager: ElectrumClientManager;
  cauldron_client_manager: ElectrumClientManager;
  utxo_tracker: UTXOTracker;
  vega_storage_provider: VegaFileStorageProvider;
  console: Console;
  config: { path: string, data: any };
  moria0_state_manager: Moria0StateManagerService;
};

const methods_wrapper = initModuleMethodWrapper();

async function requireWalletData (vega_storage_provider: VegaFileStorageProvider, wallet_name: string): Promise<WalletData> {
  const wallet_data = await vega_storage_provider.getWalletData(wallet_name);
  if (wallet_data == null) {
    throw new ValueError(`wallet not found, name: ${wallet_name}`);
  }
  return wallet_data;
}

methods_wrapper.add('status', async ({ vega_storage_provider }: MoriaV0ManagerInputServices, wallet_name: string) => {
  await requireWalletData(vega_storage_provider, wallet_name);
  const manager = managers.find((a) => a.getWalletName() == wallet_name);
  if (manager == null) {
    throw new ValueError('loan manager for the wallet is not running, wallet_name: ' + wallet_name);
  }
  return manager.getStatus();
});

methods_wrapper.add('get-settings', async ({ vega_storage_provider }: MoriaV0ManagerInputServices, wallet_name: string) => {
  await requireWalletData(vega_storage_provider, wallet_name);
  const storage_lock = await lockManagerStorage();
  try {
    const data = await readFromStorage();
    data.manager_entries = data.manager_entries || [];
    const entry = data.manager_entries.find((a) => a.wallet_name == wallet_name);
    if (entry?.settings == null) {
      return null;
    }
    return loanManagerSettingsFromStorageData(entry.settings, data);
  } finally {
    storage_lock.unlock();
  }
});

methods_wrapper.add('setup', async ({ vega_storage_provider }: MoriaV0ManagerInputServices, wallet_name: string, settings: Moria0LoanManagerSettings, options: { notification_hook_refs: string[] }) => {
  const wallet_data = await requireWalletData(vega_storage_provider, wallet_name);
  const storage_lock = await lockManagerStorage();
  try {
    const data = await readFromStorage();
    data.manager_entries = data.manager_entries || [];
    const entry = {
      wallet_name,
      settings: loanManagerSettingsDataForStorageData(settings, options, data),
    };
    const manager_entries_idx = data.manager_entries.findIndex((a) => a.wallet_name == wallet_name);
    if (manager_entries_idx == -1) {
      data.manager_entries.push(entry);
    } else {
      data.manager_entries.splice(manager_entries_idx, 1, entry);
    }
    await writeToStorage(data);

    const running_manager = managers.find((a) => a.getWalletName() == wallet_name);  
    if (running_manager != null) {
      running_manager.setSettings(loanManagerSettingsFromStorageData(entry.settings, data));
      running_manager.setNeedsToUpdate();
    }
  } finally {
    storage_lock.unlock();
  }
});

methods_wrapper.add('enable', async (services: MoriaV0ManagerInputServices, wallet_name: string) => {
  const storage_lock = await lockManagerStorage();
  try {
    // add the wallet to enabled_entries
    const storage_data = await readFromStorage();
    await startManager(storage_data, wallet_name, services);
    storage_data.enabled_entries = storage_data.enabled_entries || [];
    const enabled_enrty_idx = storage_data.enabled_entries.findIndex((a) => a.wallet_name == wallet_name);
    if (enabled_enrty_idx == -1) {
      storage_data.enabled_entries.push({ wallet_name });
    }
    await writeToStorage(storage_data);
  } finally {
    storage_lock.unlock();
  }
});

methods_wrapper.add('disable', async ({ vega_storage_provider }: MoriaV0ManagerInputServices, wallet_name: string) => {
  await requireWalletData(vega_storage_provider, wallet_name);
  const manager_idx = managers.findIndex((a) => a.getWalletName() == wallet_name);  
  if (manager_idx == -1) {
    throw new ValueError('manager is not enabled, wallet_name: ' + wallet_name);
  }
  const manager = managers.splice(manager_idx, 1)[0] as Moria0LoanManager;
  await manager.destroy();
  const storage_lock = await lockManagerStorage();
  try {
    // add the wallet to enabled_entries
    const data = await readFromStorage();
    data.enabled_entries = data.enabled_entries || [];
    const enabled_entry_idx = data.enabled_entries.findIndex((a) => a.wallet_name == wallet_name);
    if (enabled_entry_idx != -1) {
      data.enabled_entries.splice(enabled_entry_idx, 1);
    }
    await writeToStorage(data);
  } finally {
    storage_lock.unlock();
  }
});

methods_wrapper.add('trigger-test-notification', async ({ vega_storage_provider }: MoriaV0ManagerInputServices, wallet_name: string, notification_name: string) => {
  await requireWalletData(vega_storage_provider, wallet_name);
  const manager = managers.find((a) => a.getWalletName() == wallet_name);  
  if (manager == null) {
    throw new ValueError('manager is not running, wallet_name: ' + wallet_name);
  }
  await manager.triggerTestNotification(notification_name);
});

// @ts-ignore
methods_wrapper.add('get-notification-hook', async (services: MoriaV0ManagerInputServices, hook_name: string) => {
  const storage_lock = await lockManagerStorage();
  try {
    const data = await readFromStorage();
    const notification_hook = data.notification_hooks.find((a) => a.name == hook_name);
    if (notification_hook == null) {
      throw new ValueError(`No notification_hook with the given name found, name: ${hook_name}`);
    }
    return notification_hook;
  } finally {
    storage_lock.unlock();
  }
});

// @ts-ignore
methods_wrapper.add('set-notification-hook', async (services: MoriaV0ManagerInputServices, notification_hook: NotificationHook) => {
  validateNotificationHookData(notification_hook);
  for (const manager of managers) {
    const settings = structuredClone(manager.getSettings());
    for (let i = 0; i < settings.notification_hooks.length; i++) {
      const hook = settings.notification_hooks[i];
      if (hook?.name == notification_hook.name) {
        settings.notification_hooks.splice(i, 1, notification_hook);
      }
    }
    manager.setSettings(settings);
  }
  const storage_lock = await lockManagerStorage();
  try {
    const data = await readFromStorage();
    const existing_hook_idx = data.notification_hooks.findIndex((a) => a.name == notification_hook.name);
    if (existing_hook_idx == -1) {
      data.notification_hooks.push(notification_hook);
    } else {
      data.notification_hooks.splice(existing_hook_idx, 1, notification_hook);
    }
    await writeToStorage(data);
  } finally {
    storage_lock.unlock();
  }
});

// @ts-ignore
methods_wrapper.add('delete-notification-hook', async (services: MoriaV0ManagerInputServices, hook_name: string) => {
  for (const manager of managers) {
    const settings = structuredClone(manager.getSettings());
    for (let i = 0; i < settings.notification_hooks.length; ) {
      const hook = settings.notification_hooks[i];
      if (hook?.name == hook_name) {
        settings.notification_hooks.splice(i, 1);
      } else {
        i++;
      }
    }
    manager.setSettings(settings);
  }
  const storage_lock = await lockManagerStorage();
  try {
    const data = await readFromStorage();
    const existing_hook_idx = data.notification_hooks.findIndex((a) => a.name == hook_name);
    if (existing_hook_idx == -1) {
      throw new ValueError(`No notification_hook with the given name found, name: ${hook_name}`);
    }
    for (const entry of data.manager_entries||[]) {
      const settings = entry.settings;
      for (let i = 0; i < settings.notification_hook_refs.length; ) {
        const item_hook_name = settings.notification_hook_refs[i];
        if (item_hook_name == hook_name) {
          settings.notification_hook_refs.splice(i, 1); 
        } else {
          i++;
        }
      }
    }
    data.notification_hooks.splice(existing_hook_idx, 1);
    await writeToStorage(data);
  } finally {
    storage_lock.unlock();
  }
});

type ILoanEntry = {
  utxo: UTXOWithNFT;
  loan_amount: bigint;
  collateral_amount: bigint;
  collateral_rate: Fraction;
  collateral_rate_wcd: bigint;
  is_above_target_collateral_refi_threshold: boolean;
  is_below_target_collateral_refi_threshold: boolean;
};

type IUpdateState = {
  moria_utxo: UTXOWithNFT;
  oracle_utxo: UTXOWithNFT;
  oracle_message: OracleNFTParameters;
  input_coins: SpendableCoin[];
  input_musd_amount: bigint;
  input_pure_bch_amount: bigint;
  loan_entries: ILoanEntry[];
  loan_amount: bigint;
  collateral_amount: bigint;
  transaction_chain: Array<{
    action: string;
    metadata?: any;
    tx_result: TxResult;
  }>;
  oracle_use_fee: bigint;
  actions_pending_deposit: Array<{ name: string, comment: string, amount: bigint, token_id: TokenId }>;
  settings: Moria0LoanManagerSettings;
  wallet_data: WalletData;
  wallet_addr_info: WalletAddressInfo;
};

const COLLATERAL_COMMON_DENOMINATOR = 100000000n;
const makeLoanEntry = (utxo: UTXOWithNFT, oracle_price: bigint, settings: Moria0LoanManagerSettings): ILoanEntry => {
  const loan_params = MoriaV0.parseParametersFromLoanNFTCommitment(utxo.output.token.nft.commitment);
  const collateral_rate = {
    numerator: utxo.output.amount * oracle_price,
    denominator: loan_params.amount * ONE_BITCOIN,
  };
  let is_above_target_collateral_refi_threshold = false;
  if (settings.above_target_collateral_refi_threshold != null) {
    is_above_target_collateral_refi_threshold = convertFractionDenominator(collateral_rate, settings.above_target_collateral_refi_threshold.denominator).numerator > settings.above_target_collateral_refi_threshold.numerator;
  }
  let is_below_target_collateral_refi_threshold = false;
  if (settings.below_target_collateral_refi_threshold != null) {
    is_below_target_collateral_refi_threshold = convertFractionDenominator(collateral_rate, settings.below_target_collateral_refi_threshold.denominator).numerator < settings.below_target_collateral_refi_threshold.numerator;
  }
  return {
    utxo,
    loan_amount: loan_params.amount,
    collateral_amount: utxo.output.amount,
    collateral_rate,
    collateral_rate_wcd: convertFractionDenominator(collateral_rate, COLLATERAL_COMMON_DENOMINATOR).numerator,
    is_above_target_collateral_refi_threshold,
    is_below_target_collateral_refi_threshold,
  };
};

const ONE_BITCOIN = 100000000n;
const MORIA_TX_MAX_INPUTS = 25;
const ADD_COLLATERAL_TX_MAX_INPUTS = 45;

class Moria0LoanManager {
  _wallet_name: string;
  _wallet_pkh: Uint8Array;
  _settings: Moria0LoanManagerSettings;
  _wallet_utxo_tracker_entry?: UTXOTrackerEntry;
  _state_manager: Moria0StateManagerService;
  _utxo_tracker: UTXOTracker;
  _vega_storage_provider: VegaFileStorageProvider;
  _cauldron_client_manager: ElectrumClientManager;
  _console: Console;
  _last_update_timestamp: number | null;
  _last_update_actions_pending_deposit: Array<{ name: string, comment: string, amount: bigint, token_id: TokenId }> | null;
  _last_update_transaction_chain: Array<{
    action: string;
    metadata?: any;
    tx_result: TxResult;
  }> | null;
  _last_update_error: Exception | Error | null;
  _pending_update: Promise<void> | null;
  _needs_to_update_timeout_id: TimeoutId | null;
  _last_updated_serialized_wallet_loans: string | null;
  _mempool_error_count: number;
  constructor (wallet_name: string, settings: Moria0LoanManagerSettings) {
    this._wallet_pkh = null as any;
    this._utxo_tracker = null as any;
    this._vega_storage_provider = null as any;
    this._cauldron_client_manager = null as any;
    this._state_manager = null as any;
    this._console = null as any;
    this._wallet_name = wallet_name;
    this._settings = settings;
    this._last_update_timestamp = null;
    this._last_update_actions_pending_deposit = null;
    this._last_update_transaction_chain = null;
    this._last_update_error = null;
    this._pending_update = null;
    this._needs_to_update_timeout_id = null;
    this._last_updated_serialized_wallet_loans = null;
    this._mempool_error_count = 0;
  }
  async setPermanentState (pstate: any): Promise<void> {
    const storage_lock = await lockManagerStorage();
    try {
      const data = await readFromStorage();
      data.manager_state = data.manager_state || {};
      data.manager_state[this._wallet_name] = pstate;
      await writeToStorage(data);
    } finally {
      storage_lock.unlock();
    }
  }
  async getPermanentState (): Promise<any> {
    const storage_lock = await lockManagerStorage();
    try {
      const data = await readFromStorage();
      data.manager_state = data.manager_state || {};
      return data.manager_state[this._wallet_name] || {};
    } finally {
      storage_lock.unlock();
    }
  }
  getWalletName (): string {
    return this._wallet_name;
  }
  getSettings (): Moria0LoanManagerSettings {
    return this._settings;
  }
  setSettings (settings: Moria0LoanManagerSettings): void {
    this._settings = settings;
  }
  async init ({ vega_storage_provider, utxo_tracker, moria0_state_manager, console, cauldron_client_manager }: MoriaV0ManagerInputServices): Promise<void> {
    this._state_manager = moria0_state_manager;
    this._utxo_tracker = utxo_tracker;
    this._vega_storage_provider = vega_storage_provider;
    this._cauldron_client_manager = cauldron_client_manager;
    this._console = console;
    const wallet_data = await requireWalletData(vega_storage_provider, this._wallet_name);
    const addr_info = genWalletAddressInfo(wallet_data);
    this._wallet_pkh = addr_info.public_key_hash;
    this._wallet_utxo_tracker_entry = await this._utxo_tracker.addTrackerByLockingBytecode(addr_info.locking_bytecode);
    (this as any)._onTrackerEntryUpdate = this.onTrackerEntryUpdate.bind(this);
    this._utxo_tracker.addListener('update', (this as any)._onTrackerEntryUpdate);
    (this as any)._onOracleMessageChange = this.onOracleMessageChange.bind(this);
    this._state_manager.addListener('oracle-message-change', (this as any)._onOracleMessageChange);
    (this as any)._onLoansUpdate = this.onLoansUpdate.bind(this);
    this._state_manager.addListener('loans-update', (this as any)._onLoansUpdate);
    await this.setNeedsToUpdate();
  }
  async destroy (): Promise<void> {
    this._utxo_tracker.removeListener('update', (this as any)._onTrackerEntryUpdate);
    this._state_manager.removeListener('oracle-message-change', (this as any)._onOracleMessageChange);
    this._state_manager.removeListener('loans-update', (this as any)._onLoansUpdate);
    this._wallet_utxo_tracker_entry = undefined;
  }
  updateStateChangeInputCoins (update_state: IUpdateState, input_coins: SpendableCoin[]): void {
    const { musd_token_id } = MoriaV0.getConstants();
    update_state.input_coins = input_coins;
    update_state.input_musd_amount = input_coins.reduce((a, b) => a + (b.output.token?.token_id == musd_token_id ? b.output.token.amount : 0n), 0n);
    update_state.input_pure_bch_amount = input_coins.reduce((a, b) => a + (b.output.token == null ? b.output.amount : 0n), 0n);
  }
  prepareInputs (addr_info: WalletAddressInfo, update_state: IUpdateState, requirements: Array<{ token_id: TokenId, amount: bigint, fixed_amount?: boolean }>, { max_input_count }: { max_input_count: number }) {
    let remint_coins = false;
    let selected_inputs = selectInputCoins(update_state.input_coins, requirements, { allow_nft: false, select_pure_bch: true });
    let other_inputs = update_state.input_coins.filter((a) => selected_inputs.indexOf(a) == -1);
    if (selected_inputs.length > max_input_count) {
      remint_coins = true;
    }
    for (const requirement of requirements) {
      if (requirement.fixed_amount) {
        let sum;
        if (requirement.token_id == NATIVE_BCH_TOKEN_ID) {
          sum = selected_inputs.reduce((a, b) => a + (b.output.token == null ? b.output.amount : 0n), 0n);
        } else {
          sum = selected_inputs.reduce((a, b) => a + (b.output.token?.token_id == requirement.token_id ? b.output.token.amount : 0n), 0n);
        }
        if (sum != requirement.amount) {
          remint_coins = true;
        }
      }
    }
    if (remint_coins) {
      const remint_payout_rules: PayoutRule[] = [
        {
          locking_bytecode: addr_info.locking_bytecode,
          type: PayoutAmountRuleType.CHANGE,
          spending_parameters: {
            type: SpendableCoinType.P2PKH,
            key: addr_info.private_key as Uint8Array,
          },
        },
      ];
      for (const requirement of requirements) {
        if (requirement.fixed_amount) {
          remint_payout_rules.push({
            locking_bytecode: addr_info.locking_bytecode,
            type: PayoutAmountRuleType.FIXED,
            ...(requirement.token_id == NATIVE_BCH_TOKEN_ID ? {
              amount: requirement.amount,
            } : {
              token: {
                amount: requirement.amount,
                token_id: requirement.token_id,
              },
              amount: FIXED_PAYOUT_RULE_APPLY_MIN_AMOUNT,
            }),
            spending_parameters: {
              type: SpendableCoinType.P2PKH,
              key: addr_info.private_key as Uint8Array,
            },
          });
        }
      }
      const create_payout_tx_context: cashlab_common.CreatePayoutTxContext = {
        getOutputMinAmount (output: Output): bigint {
          const lauth_output: libauth.Output = {
            lockingBytecode: output.locking_bytecode,
            valueSatoshis: output.amount,
            token: output.token != null ? {
              amount: output.token.amount as bigint,
              category: convertTokenIdToUint8Array(output.token.token_id),
              nft: output.token.nft != null ? {
                capability: output.token.nft.capability,
                commitment: output.token.nft.commitment,
              } : undefined,
            } : undefined,
          };
          return libauth.getDustThreshold(lauth_output);
        },
        // @ts-ignore
        getPreferredTokenOutputBCHAmount (output: Output): bigint | null {
          return null;
        },
        txfee_per_byte: update_state.settings.txfee_per_byte,
      };
      const result = cashlab_common.createPayoutChainedTx(create_payout_tx_context, selected_inputs, remint_payout_rules);
      for (const tx_result of result.chain) {
        update_state.transaction_chain.push({
          action: 'remint-coins',
          metadata: {
            inputs_sum: requirements.map(({ token_id }) => ({
              token_id,
              amount: selected_inputs.reduce((a, b) => a + (token_id == NATIVE_BCH_TOKEN_ID ?
                (b.output.token == null ? b.output.amount : 0n) :
                (b.output.token?.token_id == token_id ? b.output.token.amount : 0n)), 0n),
            })),
            requirements,
          },
          tx_result,
        });
      }
      const payout_coins = result.payouts.map((utxo) => ({
        type: SpendableCoinType.P2PKH,
        output: utxo.output,
        outpoint: utxo.outpoint,
        key: addr_info.private_key as Uint8Array,
      }));
      selected_inputs = [];
      for (const requirement of requirements) {
        if (requirement.fixed_amount) {
          const payout_coin = payout_coins.find((a) => (
            (requirement.token_id == NATIVE_BCH_TOKEN_ID ?
              (a.output.token == null ? a.output.amount == requirement.amount : false) :
              a.output.token?.token_id == requirement.token_id && a.output.token.amount == requirement.amount)
          ));
          if (payout_coin == null) {
            throw new InvalidProgramState(`Expecting createPayoutChainedTx to payout a fixed amount, token_id: ${requirement.token_id}, amount: ${requirement.amount}`);
          }
          selected_inputs.push(payout_coin);
        } else {
          const sub_payout_coins = payout_coins.filter((a) => selected_inputs.indexOf(a) == -1);
          for (const coin of selectInputCoins(sub_payout_coins, [requirement], { allow_nft: false, select_pure_bch: true })) {
            selected_inputs.push(coin);
          }
        }
      }
      other_inputs = update_state.input_coins.filter((a) => selected_inputs.indexOf(a) == -1);
      this.updateStateChangeInputCoins(update_state, [ ...other_inputs, ...payout_coins ]);
    }
    return { selected_inputs, other_inputs };
  }
  _updateSubReduceLoanSize (update_state: IUpdateState): void {
    const { musd_token_id } = MoriaV0.getConstants();
    const { moria } = this._state_manager.getMoriaState() as Moria0State;
    const { settings, wallet_addr_info, oracle_message } = update_state;
    const { target_loan_amount, target_collateral_rate, retarget_min_musd_amount,
            tx_reserve_for_change_and_txfee } = settings;
    const loanWeight = (a: ILoanEntry) => a.collateral_rate_wcd;
    const sorted_entries = bigIntArraySortPolyfill([ ...update_state.loan_entries ], (a, b) => loanWeight(b) - loanWeight(a));
    const payout_rules: PayoutRule[] = [
      {
        locking_bytecode: wallet_addr_info.locking_bytecode,
        type: PayoutAmountRuleType.CHANGE,
      },
    ];
    const min_musd_required = 100n;
    while (update_state.input_musd_amount >= retarget_min_musd_amount &&
           update_state.loan_amount - target_loan_amount >= retarget_min_musd_amount) {
      const entry = sorted_entries.shift();
      if (entry == null) {
        break;
      }
      const repay_musd_amount = bigIntMin(update_state.loan_amount - target_loan_amount, update_state.input_musd_amount);
      if (entry.loan_amount > repay_musd_amount) {
        // reduce
        const next_loan_amount = bigIntMax(min_musd_required, entry.loan_amount - repay_musd_amount);
        if (!(entry.loan_amount - next_loan_amount >= retarget_min_musd_amount)) {
          continue; // does not meet the requirement to perform a moria_tx
        }
        const required_bch = MoriaV0.calculateCollateralAmountForTargetRate(next_loan_amount, target_collateral_rate, oracle_message.price);
        if (update_state.input_pure_bch_amount < required_bch + tx_reserve_for_change_and_txfee) {
          update_state.actions_pending_deposit.push({
            name: 'reduce-loan',
            comment: `Extra bch is required to perform reduce-loan action.`,
            amount: required_bch + tx_reserve_for_change_and_txfee,
            token_id: NATIVE_BCH_TOKEN_ID,
          });
          break;
        }
        const requirements = [
          { token_id: musd_token_id, amount: repay_musd_amount },
          { token_id: NATIVE_BCH_TOKEN_ID, amount: required_bch + tx_reserve_for_change_and_txfee, min_amount_per_utxo: 5000n },
        ];
        const { selected_inputs, other_inputs } = this.prepareInputs(wallet_addr_info, update_state, requirements, { max_input_count: MORIA_TX_MAX_INPUTS });
        const reduce_result = moria.refiLoan(update_state.moria_utxo, update_state.oracle_utxo, next_loan_amount, required_bch, entry.utxo, wallet_addr_info.private_key as Uint8Array, wallet_addr_info.public_key_hash, selected_inputs, payout_rules);
        for (const tx_result of reduce_result.tx_result_chain) {
          moria.verifyTxResult(tx_result);
          update_state.transaction_chain.push({
            action: 'reduce-loan',
            tx_result,
          });
        }
        update_state.moria_utxo = reduce_result.moria_utxo;
        update_state.oracle_utxo = reduce_result.oracle_utxo;
        { // replace loan
          const idx = update_state.loan_entries.indexOf(entry);
          if (idx == -1) {
            throw new Error('subject entry is not in the loan_entries list!')
          }
          update_state.loan_entries.splice(idx, 1);
          update_state.loan_entries.push(makeLoanEntry(reduce_result.loan_utxo, oracle_message.price, settings));
          update_state.loan_amount += next_loan_amount - entry.loan_amount;
        }
        update_state.oracle_use_fee += reduce_result.oracle_use_fee;
        this.updateStateChangeInputCoins(update_state, [
          ...other_inputs,
          ...(reduce_result.payouts.map((utxo) => ({
            type: SpendableCoinType.P2PKH,
            output: utxo.output,
            outpoint: utxo.outpoint,
            key: wallet_addr_info.private_key as Uint8Array,
          }))),
        ]);
        break; // end reduce loan
      }
      if (entry.loan_amount > update_state.input_musd_amount) {
        continue;
      }
      // repay
      const { selected_inputs, other_inputs } = this.prepareInputs(wallet_addr_info, update_state, [ { token_id: musd_token_id, amount: entry.loan_amount } ], { max_input_count: MORIA_TX_MAX_INPUTS });
      const result = moria.repayLoan(update_state.moria_utxo, update_state.oracle_utxo, entry.utxo, wallet_addr_info.private_key as Uint8Array, selected_inputs, payout_rules);
      moria.verifyTxResult(result);
      update_state.transaction_chain.push({
        action: 'repay-loan',
        tx_result: result,
      });
      update_state.moria_utxo = result.moria_utxo;
      update_state.oracle_utxo = result.oracle_utxo;
      { // remove loan
        const idx = update_state.loan_entries.indexOf(entry);
        if (idx == -1) {
          throw new Error('subject entry is not in the loan_entries list!')
        }
        update_state.loan_entries.splice(idx, 1);
      }
      update_state.oracle_use_fee += result.oracle_use_fee;
      this.updateStateChangeInputCoins(update_state, [
        ...other_inputs,
        ...(result.payouts.map((utxo) => ({
          type: SpendableCoinType.P2PKH,
          output: utxo.output,
          outpoint: utxo.outpoint,
          key: wallet_addr_info.private_key as Uint8Array,
        }))),
      ]);
    }
    if (target_loan_amount < update_state.loan_amount - update_state.input_musd_amount) {
      update_state.actions_pending_deposit.push({
        name: 'reduce-loan',
        comment: `Not enough MUSD in the wallet to reduce the loan amount to the target loan amount.`,
        amount: update_state.loan_amount - target_loan_amount - update_state.input_musd_amount,
        token_id: musd_token_id,
      });
    }
  }
  _updateSubReduceCollateral (update_state: IUpdateState): void {
    const { musd_token_id } = MoriaV0.getConstants();
    const { moria } = this._state_manager.getMoriaState() as Moria0State;
    const { settings, wallet_addr_info, oracle_message } = update_state;
    const { target_collateral_rate, tx_reserve_for_change_and_txfee } = settings;
    const payout_rules: PayoutRule[] = [
      {
        locking_bytecode: wallet_addr_info.locking_bytecode,
        type: PayoutAmountRuleType.CHANGE,
      },
    ];
    const loanWeight = (a: ILoanEntry) => a.collateral_rate_wcd;
    const sub_entries = bigIntArraySortPolyfill(
      update_state.loan_entries.filter((a) => a.is_above_target_collateral_refi_threshold),
      (a, b) => loanWeight(b) - loanWeight(a)
    );
    while (true) {
      const entry = sub_entries.shift();
      if (entry == null) {
        break;
      }
      // reduce collateral rate
      const required_bch = MoriaV0.calculateCollateralAmountForTargetRate(entry.loan_amount, target_collateral_rate, oracle_message.price);
      if (update_state.input_pure_bch_amount < required_bch + tx_reserve_for_change_and_txfee) {
        update_state.actions_pending_deposit.push({
          name: 'reduce-loan-collateral',
          comment: `Extra bch is required to perform reduce-loan-collateral action.`,
          amount: required_bch + tx_reserve_for_change_and_txfee,
          token_id: NATIVE_BCH_TOKEN_ID,
        });
        break;
      }
      const requirements = [
        { token_id: NATIVE_BCH_TOKEN_ID, amount: required_bch + tx_reserve_for_change_and_txfee, min_amount_per_utxo: 5000n },
      ];
      const { selected_inputs, other_inputs } = this.prepareInputs(wallet_addr_info, update_state, requirements, { max_input_count: MORIA_TX_MAX_INPUTS });
      const result = moria.refiLoan(update_state.moria_utxo, update_state.oracle_utxo, entry.loan_amount, required_bch, entry.utxo, wallet_addr_info.private_key as Uint8Array, wallet_addr_info.public_key_hash, selected_inputs, payout_rules);
      for (const tx_result of result.tx_result_chain) {
        moria.verifyTxResult(tx_result);
        update_state.transaction_chain.push({
          action: 'reduce-loan-collateral',
          tx_result,
        });
      }
      update_state.moria_utxo = result.moria_utxo;
      update_state.oracle_utxo = result.oracle_utxo;
      { // replace loan
        const idx = update_state.loan_entries.indexOf(entry);
        if (idx == -1) {
          throw new Error('subject entry is not in the loan_entries list!')
        }
        update_state.loan_entries.splice(idx, 1);
        update_state.loan_entries.push(makeLoanEntry(result.loan_utxo, oracle_message.price, settings));
      }
      update_state.oracle_use_fee += result.oracle_use_fee;
      this.updateStateChangeInputCoins(update_state, [
        ...other_inputs,
        ...(result.payouts.map((utxo) => ({
          type: SpendableCoinType.P2PKH,
          output: utxo.output,
          outpoint: utxo.outpoint,
          key: wallet_addr_info.private_key as Uint8Array,
        }))),
      ]);
    }
  }
  _updateSubIncreaseCollateral (update_state: IUpdateState): void {
    const { musd_token_id } = MoriaV0.getConstants();
    const { moria } = this._state_manager.getMoriaState() as Moria0State;
    const { settings, wallet_addr_info, oracle_message } = update_state;
    const { target_collateral_rate, tx_reserve_for_change_and_txfee } = settings;
    const payout_rules: PayoutRule[] = [
      {
        locking_bytecode: wallet_addr_info.locking_bytecode,
        type: PayoutAmountRuleType.CHANGE,
      },
    ];
    const min_add_collateral_amount = 100000n;
    const loanWeight = (a: ILoanEntry) => a.collateral_rate_wcd;
    const sub_entries = bigIntArraySortPolyfill(
      update_state.loan_entries.filter((a) => a.is_below_target_collateral_refi_threshold),
      (a, b) => loanWeight(a) - loanWeight(b)
    );
    while (true) {
      const entry = sub_entries.shift();
      if (entry == null) {
        break;
      }
      // increase collateral rate
      let required_bch = MoriaV0.calculateCollateralAmountForTargetRate(entry.loan_amount, target_collateral_rate, oracle_message.price) - entry.collateral_amount;
      if (required_bch <= 0) {
        throw new Error('required collateral amount of a loan below_target_collateral_refi_threshold is not greater than zero!');
      }
      required_bch = bigIntMax(required_bch, min_add_collateral_amount);
      if (update_state.input_pure_bch_amount < required_bch + tx_reserve_for_change_and_txfee) {
        // calculate additional bch required to add collateral to all loans under threshold
        const sub_loan_entries = update_state.loan_entries.filter((a) => a.is_below_target_collateral_refi_threshold);
        const sub_loan_amount = sub_loan_entries.reduce((a, b) => a + b.loan_amount, 0n);
        const sub_collateral_amount = sub_loan_entries.reduce((a, b) => a + b.collateral_amount, 0n);
        const refi_required_bch = MoriaV0.calculateCollateralAmountForTargetRate(sub_loan_amount, target_collateral_rate, oracle_message.price) - sub_collateral_amount;
        update_state.actions_pending_deposit.push({
          name: 'add-loan-collateral',
          comment: `bch is required to perform add-loan-collateral action.`,
          amount: refi_required_bch + tx_reserve_for_change_and_txfee,
          token_id: NATIVE_BCH_TOKEN_ID,
        });
        break;
      }
      const requirements = [
        { token_id: NATIVE_BCH_TOKEN_ID, amount: required_bch + tx_reserve_for_change_and_txfee, min_amount_per_utxo: 5000n },
      ];
      const { selected_inputs, other_inputs } = this.prepareInputs(wallet_addr_info, update_state, requirements, { max_input_count: ADD_COLLATERAL_TX_MAX_INPUTS });
      const result = moria.addCollateral(entry.utxo, required_bch, wallet_addr_info.private_key as Uint8Array, selected_inputs, payout_rules);
      moria.verifyTxResult(result);
      update_state.transaction_chain.push({
        action: 'add-collateral',
        tx_result: result,
      });
      { // replace loan
        const idx = update_state.loan_entries.indexOf(entry);
        if (idx == -1) {
          throw new Error('subject entry is not in the loan_entries list!')
        }
        update_state.loan_entries.splice(idx, 1);
        update_state.loan_entries.push(makeLoanEntry(result.loan_utxo, oracle_message.price, settings));
      }
      this.updateStateChangeInputCoins(update_state, [
        ...other_inputs,
        ...(result.payouts.map((utxo) => ({
          type: SpendableCoinType.P2PKH,
          output: utxo.output,
          outpoint: utxo.outpoint,
          key: wallet_addr_info.private_key as Uint8Array,
        }))),
      ]);
    }
  }
  _updateSubIncreaseLoanSize (update_state: IUpdateState): void {
    const { musd_token_id } = MoriaV0.getConstants();
    const { moria } = this._state_manager.getMoriaState() as Moria0State;
    const { settings, wallet_addr_info, oracle_message } = update_state;
    const { target_loan_amount, target_collateral_rate, retarget_min_musd_amount,
            max_loan_amount_per_utxo, tx_reserve_for_change_and_txfee } = settings;
    const loanWeight = (a: ILoanEntry) => a.loan_amount;
    const sorted_entries = bigIntArraySortPolyfill(
      [ ...update_state.loan_entries ],
      (a, b) => loanWeight(a) - loanWeight(b)
    );
    const merge_candidate = sorted_entries.shift();
    const payout_rules: PayoutRule[] = [
      {
        locking_bytecode: wallet_addr_info.locking_bytecode,
        type: PayoutAmountRuleType.CHANGE,
      },
    ];
    const min_musd_mint = bigIntMax(100n, retarget_min_musd_amount);
    while (target_loan_amount - update_state.loan_amount >= min_musd_mint) {
      const max_borrow = MoriaV0.calculateLoanAmountWithAvailableCollateralForTargetRate(update_state.input_pure_bch_amount - tx_reserve_for_change_and_txfee, target_collateral_rate, oracle_message.price);
      const additional_amount = bigIntMin(max_loan_amount_per_utxo, target_loan_amount - update_state.loan_amount);
      if (max_borrow < additional_amount || merge_candidate == null || merge_candidate.loan_amount + additional_amount > max_loan_amount_per_utxo) {
        // mint-loan
        let loan_amount = additional_amount;
        if (max_borrow > retarget_min_musd_amount && max_borrow < loan_amount) {
          loan_amount = max_borrow;
        }
        const required_bch = MoriaV0.calculateCollateralAmountForTargetRate(loan_amount, target_collateral_rate, oracle_message.price);
        if (update_state.input_pure_bch_amount < required_bch + tx_reserve_for_change_and_txfee) {
          const expand_required_bch = MoriaV0.calculateCollateralAmountForTargetRate(target_loan_amount - update_state.loan_amount, target_collateral_rate, oracle_message.price);
          update_state.actions_pending_deposit.push({
            name: 'mint-loan',
            comment: `bch is required to perform mint-loan action.`,
            amount: expand_required_bch + tx_reserve_for_change_and_txfee,
            token_id: NATIVE_BCH_TOKEN_ID,
          });
          break;
        }
        const requirements = [
          { token_id: NATIVE_BCH_TOKEN_ID, amount: required_bch + tx_reserve_for_change_and_txfee, min_amount_per_utxo: 5000n },
        ];
        const { selected_inputs, other_inputs } = this.prepareInputs(wallet_addr_info, update_state, requirements, { max_input_count: MORIA_TX_MAX_INPUTS });
        const result = moria.mintLoan(update_state.moria_utxo, update_state.oracle_utxo, selected_inputs, loan_amount, required_bch, wallet_addr_info.public_key_hash, wallet_addr_info.locking_bytecode, payout_rules);
        moria.verifyTxResult(result);
        update_state.transaction_chain.push({
          action: 'mint-loan',
          tx_result: result,
        });
        update_state.moria_utxo = result.moria_utxo;
        update_state.oracle_utxo = result.oracle_utxo;
        update_state.loan_entries.push(makeLoanEntry(result.loan_utxo, oracle_message.price, settings));
        update_state.loan_amount += loan_amount;
        update_state.oracle_use_fee += result.oracle_use_fee;
        this.updateStateChangeInputCoins(update_state, [
          ...other_inputs,
          ...(result.payouts.map((utxo) => ({
            type: SpendableCoinType.P2PKH,
            output: utxo.output,
            outpoint: utxo.outpoint,
            key: wallet_addr_info.private_key as Uint8Array,
          }))),
        ]);
      } else {
        // increase loan
        const next_loan_amount = merge_candidate.loan_amount + additional_amount;
        const required_bch = MoriaV0.calculateCollateralAmountForTargetRate(next_loan_amount, target_collateral_rate, oracle_message.price);
        if (update_state.input_pure_bch_amount < required_bch + tx_reserve_for_change_and_txfee) {
          update_state.actions_pending_deposit.push({
            name: 'increase-loan-amount',
            comment: `bch is required to perform increase-loan-amount action.`,
            amount: required_bch + tx_reserve_for_change_and_txfee,
            token_id: NATIVE_BCH_TOKEN_ID,
          });
          break;
        }
        const requirements = [
          { token_id: NATIVE_BCH_TOKEN_ID, amount: required_bch + tx_reserve_for_change_and_txfee, min_amount_per_utxo: 5000n },
        ];
        const { selected_inputs, other_inputs } = this.prepareInputs(wallet_addr_info, update_state, requirements, { max_input_count: MORIA_TX_MAX_INPUTS });
        const refi_result = moria.refiLoan(update_state.moria_utxo, update_state.oracle_utxo, next_loan_amount, required_bch, merge_candidate.utxo, wallet_addr_info.private_key as Uint8Array, wallet_addr_info.public_key_hash, selected_inputs, payout_rules);
        for (const tx_result of refi_result.tx_result_chain) {
          moria.verifyTxResult(tx_result);
          update_state.transaction_chain.push({
            action: 'increase-loan-amount',
            tx_result,
          });
        }
        update_state.moria_utxo = refi_result.moria_utxo;
        update_state.oracle_utxo = refi_result.oracle_utxo;
        { // replace loan
          const idx = update_state.loan_entries.indexOf(merge_candidate);
          if (idx == -1) {
            throw new Error('subject entry is not in the loan_entries list!')
          }
          update_state.loan_entries.splice(idx, 1);
          update_state.loan_entries.push(makeLoanEntry(refi_result.loan_utxo, oracle_message.price, settings));
          update_state.loan_amount += next_loan_amount - merge_candidate.loan_amount;
        }
        update_state.oracle_use_fee += refi_result.oracle_use_fee;
        this.updateStateChangeInputCoins(update_state, [
          ...other_inputs,
          ...(refi_result.payouts.map((utxo) => ({
            type: SpendableCoinType.P2PKH,
            output: utxo.output,
            outpoint: utxo.outpoint,
            key: wallet_addr_info.private_key as Uint8Array,
          }))),
        ]);
      }
    }
  }

  async doUpdate (): Promise<void> {
    const settings = this._settings;
    try {
      if (this._wallet_utxo_tracker_entry == null) {
        throw new Error('Moria0Manager update, wallet_utxo_tracker_entry is null!!')
      }
      const { musd_token_id } = MoriaV0.getConstants();
      const state: Moria0State | undefined = this._state_manager.getMoriaState();
      if (state == null) {
        throw new Error('Moria0Manager update, moria state is null!!')
      }
      const wallet_data = await requireWalletData(this._vega_storage_provider, this._wallet_name);
      const wallet_addr_info = genWalletAddressInfo(wallet_data);
      const { moria } = state;
      const {
        target_loan_amount, target_collateral_rate,
        above_target_collateral_refi_threshold,
        below_target_collateral_refi_threshold,
        txfee_per_byte,
        max_loan_amount_per_utxo, retarget_min_musd_amount,
      } = settings;
      validateSettings(settings);
      moria.setTxFeePerByte(txfee_per_byte);
      const oracle_message = MoriaV0.parseOracleMessageFromNFTCommitment(state.oracle_utxo.output.token.nft.commitment);
      const loan_entries = [];
      const invalid_loan_entries = [];
      for (const utxo of (this._state_manager.getWalletLoans(this._wallet_pkh) as UTXOWithNFT[])) {
        try {
          loan_entries.push(makeLoanEntry(utxo, oracle_message.price, settings));
        } catch (err) {
          invalid_loan_entries.push({ utxo, error: err })
        }
      }
      const initial_loan_entries = structuredClone(loan_entries);
      const update_state: IUpdateState = {
        moria_utxo: state.moria_utxo,
        oracle_utxo: state.oracle_utxo,
        oracle_message,
        input_coins: [],
        input_musd_amount: 0n,
        input_pure_bch_amount: 0n,
        loan_entries,
        loan_amount: loan_entries.reduce((a, b) => a + b.loan_amount, 0n),
        collateral_amount: loan_entries.reduce((a, b) => a + b.collateral_amount, 0n),
        transaction_chain: [],
        oracle_use_fee: 0n,
        actions_pending_deposit: [],
        wallet_data, wallet_addr_info, settings,
      };
      this.updateStateChangeInputCoins(
        update_state,
        (this._wallet_utxo_tracker_entry.data||[])
          .filter((a) => a.output.token == null || a.output.token?.token_id == musd_token_id)
          .map((utxo) => ({
            type: SpendableCoinType.P2PKH,
            output: utxo.output,
            outpoint: utxo.outpoint,
            key: wallet_addr_info.private_key as Uint8Array,
          }))
      );
      // 1. reduce loan size (if needed)
      if (update_state.loan_amount - target_loan_amount >= retarget_min_musd_amount) { 
        this._updateSubReduceLoanSize(update_state);
      }
      // 2. refi, reduce collateral
      this._updateSubReduceCollateral(update_state);
      // 3. add collateral
      this._updateSubIncreaseCollateral(update_state);
      // 4. increase loan size (if needed)
      if (target_loan_amount - update_state.loan_amount >= retarget_min_musd_amount) {
        this._updateSubIncreaseLoanSize(update_state);
      }
      if (settings.debug) {
        if (JSON.stringify(serializeMessage(update_state.actions_pending_deposit.length)) == JSON.stringify(serializeMessage(this._last_update_actions_pending_deposit)) &&
          update_state.transaction_chain.length == 0) {
          this._console.debug(`Moria0Manger update, wallet_name: ${this._wallet_name} -------- NO CHANGE -------`);
        } else {
          this._console.debug(`Moria0Manger update, wallet_name: ${this._wallet_name} --------`);
          this._console.debug(`============ settings ============`);
          this._console.debug(JSON.stringify(convertToJSONSerializable(settings), null, '  '));
          this._console.debug(`============ loans ============`);
          for (const entry of loan_entries) {
            this._console.debug(JSON.stringify(convertToJSONSerializable(entry), null, '  '));
            this._console.debug('....        ..........      ....');
          }
          if (invalid_loan_entries.length > 0) {
            this._console.debug(`============ invalid_loans ============`);
            for (const entry of invalid_loan_entries) {
              this._console.debug('utxo: ' + JSON.stringify(convertToJSONSerializable(entry.utxo), null, '  '));
              this._console.debug('Error: ', entry.error);
            }
          }
          this._console.debug(`============ actions_pending_deposit ============`);
          this._console.debug(JSON.stringify(convertToJSONSerializable(update_state.actions_pending_deposit
                                                                      ), null, '  '));
          this._console.debug(`============ transaction_chain ============`);
          this._console.debug(JSON.stringify(convertToJSONSerializable(update_state.transaction_chain), null, '  '));
          this._console.debug(`---------------------------------------------------------------`);
        }
      }
      let broadcast_error = null;
      if (!settings.dryrun) {
        const client = this._cauldron_client_manager.getClient();
        if (client == null) {
          throw new Exception('cauldron electrum client is not connected!')
        }
        // submit the chain of transactions
        try {
          for (const item of update_state.transaction_chain) {
            await broadcastTransaction(client, item.tx_result.txbin, false);
          }
        } catch (err) {
          broadcast_error = err;
        }
      }
      ;(async () => {
        // broadcast notifications
        const ctime = Math.floor(new Date().getTime() / 1000);
        const pstate = await this.getPermanentState();
        const loan_entires = settings.dryrun || broadcast_error ? initial_loan_entries : update_state.loan_entries;

        const mgcall_rate = settings.margin_call_warning_collateral_rate;
        let loans_reached_margin_call = 0;
        for (const entry of loan_entires) {
          if (convertFractionDenominator(entry.collateral_rate, mgcall_rate.denominator).numerator < mgcall_rate.numerator) {
            loans_reached_margin_call++;
          }
        }

        const send_margin_call = loans_reached_margin_call > 0;
        if (send_margin_call) {
          if (pstate.last_margin_call_warning_notification_timestamp == null ||
            ctime > pstate.last_margin_call_warning_notification_timestamp + settings.warning_notification_frequency * 3600) {
            const message = {
              name: 'margincall',
              subject: `(${this._wallet_name}), MoriaV0 Margin Call Notification`,
              body: `
To avoid liquidations deposit BCH or MUSD to ${this._wallet_name}'s wallet address.
`,
              data: {},
            };
            if (await this.sendNotification(message)) {
              const pstate = await this.getPermanentState();
              pstate.last_margin_call_warning_notification_timestamp = ctime;
              await this.setPermanentState(pstate);
            }
          }
        }
      })();
      if (broadcast_error != null) {
        throw broadcast_error;
      }
      this._last_update_actions_pending_deposit = update_state.actions_pending_deposit;
      this._last_update_transaction_chain = update_state.transaction_chain;
      this._last_update_error = null;
      this._mempool_error_count = 0;
      this._last_update_timestamp = new Date().getTime();
    } catch (err) {
      const is_mempool_conflict_error = (err as any).message.indexOf('txn-mempool-conflict') != -1;
      this._console.warn(`Moria0Manger update failed, wallet_name: ${this._wallet_name}, is_mempool_conflict_error: ${is_mempool_conflict_error}--------`);
      this._console.warn(err);
      this._console.warn(`---------------------------------------------------------------`);
      ;(async () => {
        // broadcast notifications
        if (is_mempool_conflict_error && this._mempool_error_count <= 3) {
          this._console.warn(`sending error notification has been skip, is_mempool_conflict_error, count: ${this._mempool_error_count}`);
          return;
        }
        const ctime = Math.floor(new Date().getTime() / 1000);
        const pstate = await this.getPermanentState();
        if (pstate.last_error_notification_timestamp == null ||
          ctime > pstate.last_error_notification_timestamp + settings.warning_notification_frequency * 3600) {
          const message = {
            name: 'error',
            subject: `(${this._wallet_name}), MoriaV0 manager failed to perform an update.`,
            body: `Update failed, ${(err as any).name||'Error'}: ${(err as any).message}`,
            data: {
              error: serializeMessage(err),
            },
          };
          if (await this.sendNotification(message)) {
            const pstate = await this.getPermanentState();
            pstate.last_error_notification_timestamp = ctime;
            await this.setPermanentState(pstate);
          }
        }
      })();
      if (is_mempool_conflict_error) {
        this._mempool_error_count++;
      }
      this._last_update_actions_pending_deposit = null;
      this._last_update_transaction_chain = null;
      this._last_update_error = err as any;
      this._last_update_timestamp = new Date().getTime();
    }
  }

  async update (): Promise<void> {
    const { promise, resolve } = await deferredPromise<void>();
    if (this._pending_update) {
      this._pending_update.then(resolve, resolve);
      return promise;
    }
    this._pending_update = promise;
    try {
      let maxtry = 100;
      while (this.hasPendingTrackerUpdate()) {
        this._console.info(`MoriaV0 loan manger (${this._wallet_name}), Waiting for pending tracker updates tick.`);
        await this.waitUntilPendingTrackersUpdate();
        if (maxtry-- <= 0) {
          this._console.info(`MoriaV0 loan manger (${this._wallet_name}), Wait has reached maxtry, try to update anyways.`);
          break;
        }
      }
    } catch (err) {
      this._console.info(`MoriaV0 loan manger (${this._wallet_name}), Pending updates failed, skipped updating!`);
      resolve();
      return;
    }
    try {
      await this.doUpdate()
    } finally {
      this._pending_update = null;
      resolve();
    }
    return promise;
  }
  getStatus (): Moria0LoanManagerStatus | null {
    const state: Moria0State | undefined = this._state_manager.getMoriaState();
    if (state == null) {
      return null;
    }
    let loans: UTXOWithNFT[];
    let oracle_message: OracleNFTParameters;
    try {
      loans = this._state_manager.getWalletLoans(this._wallet_pkh);
      oracle_message = MoriaV0.parseOracleMessageFromNFTCommitment(state.oracle_utxo.output.token.nft.commitment);
    } catch (err) {
      return null;
    }
    const loan_entries = [];
    const invalid_loan_entries = [];
    for (const utxo of loans) {
      try {
        loan_entries.push(makeLoanEntry(utxo, oracle_message.price, this._settings));
      } catch (err) {
        invalid_loan_entries.push({ utxo, error: err })
      }
    }
    let lowest_collateral_entry = loan_entries[0];
    let highest_collateral_entry = loan_entries[0];
    for (let i = 1; i < loan_entries.length; i++) {
      const entry = loan_entries[i];
      if (entry == null) {
        continue;
      }
      if (convertFractionDenominator(entry.collateral_rate, (lowest_collateral_entry as ILoanEntry).collateral_rate.denominator).numerator < (lowest_collateral_entry as ILoanEntry).collateral_rate.numerator) {
        lowest_collateral_entry = entry;
      }
      if (convertFractionDenominator(entry.collateral_rate, (highest_collateral_entry as ILoanEntry).collateral_rate.denominator).numerator > (highest_collateral_entry as ILoanEntry).collateral_rate.numerator) {
        highest_collateral_entry = entry;
      }
    }
    const loan_amount = loan_entries.reduce((a, b) => a + b.loan_amount, 0n);
    const collateral_amount = loan_entries.reduce((a, b) => a + b.collateral_amount, 0n);
    return {
      loan_amount, collateral_amount,
      lowest_collateral_rate: lowest_collateral_entry ? lowest_collateral_entry.collateral_rate : null,
      highest_collateral_rate: highest_collateral_entry ? highest_collateral_entry.collateral_rate : null,
      average_collateral_rate: loan_amount > 0n && collateral_amount > 0n ? {
        numerator: collateral_amount * oracle_message.price,
        denominator: loan_amount * ONE_BITCOIN,
      } : null,
      number_of_loans: loan_entries.length,
      number_of_invalid_loans: invalid_loan_entries.length,
      notification_hooks: (this._settings.notification_hooks||[]).map((a) => ({ name: a.name })),
      last_update_timestamp: this._last_update_timestamp,
      last_update_actions_pending_deposit: this._last_update_actions_pending_deposit,
      last_update_transaction_chain: this._last_update_transaction_chain,
      last_update_error: this._last_update_error,
    };
  }
  setNeedsToUpdate (): void {
    if (this._needs_to_update_timeout_id != null) {
      return;
    }
    this._needs_to_update_timeout_id = setTimeout(async () => {
      try {
        let maxtry = 100;
        while (this.hasPendingTrackerUpdate()) {
          this._console.info(`MoriaV0 loan manger (${this._wallet_name}), Waiting for pending tracker updates tick.`);
          await this.waitUntilPendingTrackersUpdate();
          if (maxtry-- <= 0) {
            this._console.info(`MoriaV0 loan manger (${this._wallet_name}), Wait has reached maxtry, try to update anyways.`);
            break;
          }
        }
        this._needs_to_update_timeout_id = null;
        this.update();
      } catch (err) {
        this._console.info(`MoriaV0 loan manger (${this._wallet_name}), Pending updates failed, skipped updating!`);
      }
    }, 1000);
  }

  waitUntilPendingTrackersUpdate (): Promise<void> {
    return Promise.all([
      !!this._wallet_utxo_tracker_entry && !!this._wallet_utxo_tracker_entry.pending_request ?
        this._wallet_utxo_tracker_entry.pending_request : Promise.resolve(),
      this._state_manager.waitUntilPendingTrackersUpdate(),
    ])
      .then(() => undefined) as Promise<void>;
  }
  hasPendingTrackerUpdate (): boolean {
    if (!!this._wallet_utxo_tracker_entry && !!this._wallet_utxo_tracker_entry.pending_request) {
      return true;
    }
    return this._state_manager.hasPendingTrackerUpdate();
  }
  onOracleMessageChange (): void {
    this.setNeedsToUpdate();
  }
  onLoansUpdate (): void {
    try {
      const wallet_loans = this._state_manager.getWalletLoans(this._wallet_pkh);
      const serialized_wallet_loans = JSON.stringify(serializeMessage(wallet_loans));
      if (this._last_updated_serialized_wallet_loans == null || serialized_wallet_loans != this._last_updated_serialized_wallet_loans) {
        this._last_updated_serialized_wallet_loans = serialized_wallet_loans;
        this.setNeedsToUpdate();
      }
    } catch (err) {
      this._console.warn('onLoansUpdate fail, ', err);
    }
  }
  onWalletUTXOUpdate (): void {
    try {
      this.setNeedsToUpdate();
    } catch (err) {
      this._console.warn('onWalletUTXOUpdate fail, ', err);
    }
  }
  onTrackerEntryUpdate (entry: UTXOTrackerEntry) {
    if (entry.type != 'locking_bytecode') {
      return;
    }
    if (this._wallet_utxo_tracker_entry != null && uint8ArrayEqual(entry.locking_bytecode, this._wallet_utxo_tracker_entry.locking_bytecode)) {
      this._wallet_utxo_tracker_entry = entry;
      this.onWalletUTXOUpdate();
    }
  }
  async triggerTestNotification (name: string): Promise<boolean> {
    return await this.sendNotification({
      name,
      subject: `(${this._wallet_name}), Test notification, name: ${name}`,
      body: `This is a test notification.`,
      data: { test: true },
    });
  }

  async sendNotification (message: NotificationMessage): Promise<boolean> {
    const promises = [];
    for (const hook of this._settings.notification_hooks) {
      if (hook.target_events != null && hook.target_events.indexOf(hook.name) == -1) {
        continue; // skip
      }
      promises.push((async () => {
        try {
          if (hook.type == 'webhook') {
            // send an http request
            ;await new Promise<void>((resolve, reject) => {
              try {
                const req = (hook.link.toLowerCase().startsWith('https://') ? https : http).request(hook.link, {
                  method: hook.method,
                  headers: {
                    ...Object.fromEntries((hook.headers||[]).map((a) => [ a.name, a.value ])),
                    ...Object.fromEntries([
                      (['json','form-urlencoded'].indexOf(hook.post_content_type) == -1 ? null :
                        [ 'Content-Type', (hook.post_content_type == 'json' ? 'application/json' : 'application/x-www-form-urlencoded') ]),
                    ].filter((a) => !!a) as any),
                  },
                }, (resp) => {
                  const MAX_RESPONSE_SIZE = 1024 * 1024 * 2; // 2MB
                  let post_size = 0;
                  let chunks: Buffer[] = []
                  if (resp.statusCode == null) {
                    reject(new Error(`Unexpected response of a webhook notification request, status_code: undefined`));
                    resp.destroy();
                    return;
                  }

                  const status_code: number = resp.statusCode;
                  resp.on('data', (chunk) => {
                    if (post_size > MAX_RESPONSE_SIZE) {
                      reject(new Error('Response body is too big!'));
                      resp.destroy();
                      chunks = [];
                      return;
                    }
                    chunks.push(chunk);
                    post_size += chunk.length;
                  });
                  resp.on('end', () => {
                    if (status_code >= 200 && status_code < 300) {
                      resolve();
                    } else {
                      const content = Buffer.concat(chunks).toString('utf8');
                      reject(new Error(`Unexpected response of a webhook notification request, status_code: ${status_code}, body: ${content.slice(0, 500)}`));
                    }
                  });
                });
                req.on('error', (error) => {
                  reject(error);
                });
                if (hook.post_content_type == 'json') {
                  req.end(JSON.stringify(message));
                } else {
                  const formdata: any = {
                    name: message.name,
                    subject: message.subject,
                    body: message.body,
                  };
                  if (typeof message.data == 'object') {
                    for (const [ name, value ] of Object.entries(message||{})) {
                      formdata['data.' + name] = typeof value == 'object' ? JSON.stringify(value) : value+'';
                    }
                  }
                  req.end(querystring.stringify(formdata));
                }
              } catch (err) {
                reject(err);
              }
            });
          } else if (hook.type == 'email') {
            if ((hook.protocol+'').toUpperCase() != 'SMTP') {
              throw new ValueError(`Unknown email_hook.protocol, value: ${hook.protocol}`);
            }
            // send an email
            const slayer = hook.secure_layer === undefined ? (hook.port == 25 ? 'STARTTLS' : 'TLS') : hook.secure_layer.toUpperCase();
            const mailer_transport = nodemailer.createTransport({
              host: hook.host,
              port: hook.port,
              secure: slayer == 'TLS',
              requireTLS: ['STARTTLS','TLS'].indexOf(slayer) != -1, 
              auth: {
                user: hook.username,
                pass: hook.password,
              },
              // logger: true,
            });
            await mailer_transport.sendMail({
              from: hook.sender,
              to: hook.recipient,
              subject: message.subject,
              text: message.body,
            });
          } else {
            throw new ValueError(`Unknown hook, name: ${(hook as any)?.name}, type: ${(hook as any)?.type}`);
          }
          return true;
        } catch (err) {
          this._console.warn(`Failed to send notification to (${hook.name}, error: `, err);
          return false;
        }
      })());
    }
    return (await Promise.all(promises)).filter((a) => !!a).length > 0 || promises.length == 0;
  }
}

async function startManager (data: MoriaV0ManagerStorageData, wallet_name: string, services: MoriaV0ManagerInputServices): Promise<Moria0LoanManager> {
  if (!wallet_name) {
    throw new Error('moria0_manager: An enabled_entry with undefined wallet_name!');
  }
  const manager_entry = data.manager_entries.find((a) => a.wallet_name == wallet_name);
  if (!manager_entry) {
    throw new Error(`moria0_manager: enabled_entry's definition not found, wallet_name: ${wallet_name}`);
  }
  const wallet_data = await requireWalletData(services.vega_storage_provider, wallet_name);
  const existing_manager = managers.find((a) => a.getWalletName() == wallet_name);  
  if (existing_manager != null) {
    throw new Error(`moria0_manager: An attempt to start an already running moria loan manager!`);
  }
  const settings = loanManagerSettingsFromStorageData(manager_entry.settings, data);
  const manager = new Moria0LoanManager(wallet_name, settings);
  await manager.init(services);
  managers.push(manager);
  return manager;
}

let storage_file_path: string | null;
let storage_exec_thread: InOrderSingleThreadedExecutionQueue = new InOrderSingleThreadedExecutionQueue();
let managers: Moria0LoanManager[] = [];

const lockManagerStorage = (): Promise<{ unlock: () => void }> => {
  return new Promise((resolve) => {
    storage_exec_thread.add(async () => {
      const { promise: next_promise, resolve: next_resolve } = await deferredPromise<void>();
      resolve({ unlock: next_resolve });
      return await next_promise;
    });
  });
};

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
    { name: 'config' },
    { name: 'moria0.state_manager', argument_name: 'moria0_state_manager' }, // moria0 state_manager service
  ];
};

export async function init (services: MoriaV0ManagerInputServices): Promise<void> {
  const { console, config, vega_storage_provider } = services;
  if (config.data.moria0_manager_storage == null) {
    return; // do nothing
  }
  const _storage_file_path = path.resolve(path.dirname(config.path), config.data.moria0_manager_storage);
  try {
    await fs.access(_storage_file_path, fs.constants.R_OK | fs.constants.W_OK);
  } catch (err) {
    if ((err as any).code != 'ENOENT') {
      throw err;
    }
  }
  storage_file_path = _storage_file_path;
  const storage_data = await readFromStorage();
  for (const { wallet_name } of storage_data.enabled_entries) {
    await startManager(storage_data, wallet_name, services);
  }
  methods_wrapper.defineServices(services);
}

export async function destroy (): Promise<void> {
  for (const manager of managers) {
    await manager.destroy();
  }
  managers = [];
}

export function getMethod (name: string): ModuleMethod | undefined {
  return methods_wrapper.methods[name];
}

function initialStorageContent (): MoriaV0ManagerStorageData {
  return {
    manager_entries: [],
    enabled_entries: [],
    manager_state: {},
    notification_hooks: [],
  };
}

async function readFromStorage (): Promise<MoriaV0ManagerStorageData> {
  if (storage_file_path == null) {
    throw new ValueError('config.moria0_manager_storage is not defined!');
  }
  try {
    await fs.access(storage_file_path, fs.constants.R_OK | fs.constants.W_OK);
  } catch (err) {
    if ((err as any).code == 'ENOENT') {
      return initialStorageContent();
    } else {
      throw err;
    }
  }
  return JSON.parse((await fs.readFile(storage_file_path)).toString('utf8'));
}

async function writeToStorage (data: any): Promise<void> {
  if (storage_file_path == null) {
    throw new ValueError('config.moria0_manager_storage is not defined!');
  }
  await fs.writeFile(storage_file_path, JSON.stringify(data, null, '  '));
}

