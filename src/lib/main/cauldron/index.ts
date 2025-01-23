import type UTXOTracker from '../utxo-tracker.js';
import type ElectrumClientManager from '../electrum-client-manager.js';
import type { ModuleSchema, ModuleDependency, ModuleMethod } from '../types.js';
import VegaFileStorageProvider, { genWalletAddressInfo, WalletData } from '../vega-file-storage-provider.js';
import {
  cauldron, TokenId, NATIVE_BCH_TOKEN_ID, SpendableCoin, SpendableCoinType,
  PayoutRule, PayoutAmountRuleType, BurnTokenException,
} from 'cashlab';
import type { TradeResult } from 'cashlab/build/cauldron/types.js';

import { initModuleMethodWrapper } from '../helpers.js';
import broadcastTransaction from '../network/broadcast-transaction.js';

import PoolTracker from './pool-tracker.js';
import fundTrade, { TradeSumEntry, calcTradeSumList, validateTrade } from './fund-trade.js';
import { applySettingsToExchangeLab } from './helpers.js';

const methods_wrapper = initModuleMethodWrapper();

type CauldronInputServices = {
  cauldron_client_manager: ElectrumClientManager;
  utxo_tracker: UTXOTracker;
  vega_storage_provider: VegaFileStorageProvider;
  console: Console;
};
let exlab: cauldron.ExchangeLab, pool_tracker: PoolTracker;

methods_wrapper.add('construct-trade', async ({ vega_storage_provider }: CauldronInputServices, supply_token_id: TokenId, demand_token_id: TokenId, target: 'demand' | 'supply', amount: bigint, txfee_per_byte: bigint): Promise<{ result: TradeResult, build_duration: number }> => {
  if (supply_token_id == demand_token_id) {
    throw new Error('supply_token should not be equal to demand_token');
  }
  if (supply_token_id != NATIVE_BCH_TOKEN_ID && demand_token_id != NATIVE_BCH_TOKEN_ID) {
    throw new Error('Can only perform trades with native BCH as one side of the trade.');
  }
  if (amount <= 0n) {
    throw new Error('Expecting amount to be greater than zero, got: ' + amount);
  }
  const non_native_token_id = supply_token_id == NATIVE_BCH_TOKEN_ID ? demand_token_id : supply_token_id;
  const input_pools = await pool_tracker.getTokenPools(non_native_token_id);
  const t0 = performance.now();
  let result: TradeResult;
  applySettingsToExchangeLab(exlab, await vega_storage_provider.getSettings());
  if (target == 'demand') {
    result = exlab.constructTradeBestRateForTargetDemand(supply_token_id, demand_token_id, amount, input_pools, txfee_per_byte);
  } else {
    result = exlab.constructTradeBestRateForTargetSupply(supply_token_id, demand_token_id, amount, input_pools, txfee_per_byte);
  }
  const t1 = performance.now();
  return { result, build_duration: t1 - t0 };
});

methods_wrapper.add('fund-trade', async ({ cauldron_client_manager, utxo_tracker, vega_storage_provider }: CauldronInputServices, wallet_name: string, trade: TradeResult, txfee_per_byte, options: { allow_mixed_payout: boolean, broadcast: boolean, burn_dust_tokens: boolean }): Promise<any> => {
  const { allow_mixed_payout, broadcast, burn_dust_tokens } = options;
  if (txfee_per_byte < 0n) {
    throw new Error('txfee-per-byte should be a positive integer');
  }
  const wallet_data = await vega_storage_provider.getWalletData(wallet_name);
  if (wallet_data == null) {
    throw new Error('Wallet does not exist, wallet_name: ' + wallet_name);
  }
  const addr_info = genWalletAddressInfo(wallet_data);
  if (addr_info.locking_type != 'p2pkh') {
    throw new Error('Unsupported wallet locking code: ' + addr_info.locking_type);
  }
  if (addr_info.private_key == null) {
    throw new Error('Wallet private key is not available, wallet_name: ' + wallet_name);
  }
  const input_coins: SpendableCoin[] = (await utxo_tracker.getUTXOListForLockingBytecode(addr_info.locking_bytecode)).map((utxo) => ({
    type: SpendableCoinType.P2PKH,
    output: utxo.output,
    outpoint: utxo.outpoint,
    key: addr_info.private_key as Uint8Array,
  }));

  const trade_sum_list: TradeSumEntry[] = calcTradeSumList(trade);
  validateTrade(trade, trade_sum_list);

  const DEFAULT_DUST_TOKEN_MIN_IN_BCH = 100n;
  const mkPrepareShouldBurnCall = (callable: (token_id: TokenId, amount: bigint, value_in_bch: bigint) => void): ((token_id: TokenId, amount: bigint) => void)  => {
    const rate_cache: { [token_id: string]: bigint }  = {};
    const rate_denominator = exlab.getRateDenominator();
    const _getRate = (token_id: TokenId): bigint => {
      if (token_id == NATIVE_BCH_TOKEN_ID) {
        throw new Error(`should never occur!`);
      }
      if (typeof rate_cache[token_id] == 'bigint') {
        return rate_cache[token_id] as bigint;
      }
      let rate: bigint | undefined;
      { // when it supplies the token_id
        const trade_sum_entry = trade_sum_list.find((a) => a.supply_token_id == token_id);
        if (trade_sum_entry != null) {
          rate = trade_sum_entry.demand * rate_denominator / trade_sum_entry.supply;
        }
      }
      { // when it demands the token_id
        const trade_sum_entry = trade_sum_list.find((a) => a.demand_token_id == token_id);
        if (trade_sum_entry != null) {
          rate = trade_sum_entry.supply * rate_denominator / trade_sum_entry.demand;
        }
      }
      if (typeof rate == 'bigint') {
        return rate_cache[token_id] = rate;
      }
      throw new Error('Unknown token!!, token_id: ' + token_id);
    };
    return (token_id: TokenId, amount: bigint): void => {
      if (token_id == NATIVE_BCH_TOKEN_ID) {
        callable(token_id, amount, amount);
      } else {
        const rate = _getRate(token_id)
        callable(token_id, amount, amount * rate / rate_denominator);
      }
    };
  };
  const payout_rules: PayoutRule[] = [
    {
      type: PayoutAmountRuleType.CHANGE,
      allow_mixing_native_and_token: allow_mixed_payout,
      locking_bytecode: addr_info.locking_bytecode,
      spending_parameters: {
        type: SpendableCoinType.P2PKH,
        key: addr_info.private_key,
      },
      // @ts-ignore
      shouldBurn: mkPrepareShouldBurnCall((token_id: TokenId, amount: bigint, value_in_bch: bigint): void => {
        if (token_id != NATIVE_BCH_TOKEN_ID && !!burn_dust_tokens && value_in_bch < DEFAULT_DUST_TOKEN_MIN_IN_BCH) {
          throw new BurnTokenException();
        }
      }),
    },
  ];
  applySettingsToExchangeLab(exlab, await vega_storage_provider.getSettings());
  const result = await fundTrade(exlab, trade, input_coins, payout_rules, txfee_per_byte, { verify_transactions: true });

  const broadcast_result: any = { error: null, items: [] };
  if (broadcast) {
    try {
      const client = cauldron_client_manager.getClient();
      if (client == null) {
        throw new Error('cauldron client is not active!');
      }
      for (const { trade_tx } of result.transactions) {
        broadcast_result.items.push(await broadcastTransaction(client, trade_tx.txbin, false));
      }
    } catch (err) {
      broadcast_result.error = err;
    }
  }
  // exclude trade_tx from the result that will be returned as json data
  for (const item of result.transactions) {
    delete (item as any).trade_tx;
  }
  return { result, broadcast_result };
});

export function getSchema (): ModuleSchema {
  return {
    methods: Object.keys(methods_wrapper.methods).map((name) => ({ name })),
  };
}

export function getDependencies (): ModuleDependency[] {
  return [
    { name: 'utxo_tracker' },
    { name: 'cauldron_client_manager' },
    { name: 'vega_storage_provider' },
    { name: 'console' },
  ];
};

export async function init (services: CauldronInputServices): Promise<void> {
  exlab = new cauldron.ExchangeLab();
  applySettingsToExchangeLab(exlab, await services.vega_storage_provider.getSettings());
  pool_tracker = new PoolTracker(exlab);
  await pool_tracker.init({ cauldron_client_manager: services.cauldron_client_manager, console: services.console });
  methods_wrapper.defineServices(services);
}

export async function destroy (): Promise<void> {
  if (pool_tracker) {
    await pool_tracker.destroy();
  }
  // allow unsetting essential objects with (... as any)
  (pool_tracker as any) = null;
  (exlab as any) = null;
}

export function getMethod (name: string): ModuleMethod | undefined {
  return methods_wrapper.methods[name];
}
