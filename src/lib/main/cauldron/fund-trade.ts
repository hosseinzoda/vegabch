import {
  libauth, common as cashlab_common, cauldron,
  PayoutRule, SpendableCoin, TokenId, Fraction, NATIVE_BCH_TOKEN_ID, OutputWithFT,
  PayoutAmountRuleType, SpendableCoinType, BurnTokenException,
  InsufficientFunds,
} from 'cashlab';
import type { PoolV0Parameters, PoolV0, TradeResult, TradeTxResult } from 'cashlab/build/cauldron/types.js';
const { binToHex, hashTransactionUiOrder } = libauth;

export type FundTradeResult = {
  pools_count: number;
  input_coins: Array<{
    outpoint: { txhash: string; index: number };
    output: {
      locking_bytecode: string;
      token?: {
        token_id: string;
        amount: string;
      };
      amount: string;
    };
  }>;
  transactions: Array<{
    txhex: string;
    txbin_size: number;
    txhash: string;
    txfee: string;
    input_count: number;
    output_count: number;
    token_burns: Array<{ token_id: string, amount: string }>
    payouts_info: Array<{
      index: number;
      output: {
        locking_bytecode: string;
        token?: {
          token_id: string;
          amount: string;
        };
        amount: string;
      };
    }>;
    trade_tx: TradeTxResult;
  }>;
};

export type TradeSumEntry = {
  supply_token_id: TokenId, demand_token_id: TokenId,
  supply: bigint, demand: bigint
};

export const calcTradeSumList = (trade: TradeResult): TradeSumEntry[] => {
  const trade_sum_list: Array<{
    supply_token_id: TokenId, demand_token_id: TokenId,
    supply: bigint, demand: bigint
  }> = [];
  for (const entry of trade.entries) {
    let trade_sum_entry = trade_sum_list.find((a) => a.supply_token_id == entry.supply_token_id && a.demand_token_id == entry.demand_token_id);
    if (trade_sum_entry == null) {
      trade_sum_entry = {
        supply_token_id: entry.supply_token_id, demand_token_id: entry.demand_token_id,
        supply: 0n, demand: 0n,
      };
      trade_sum_list.push(trade_sum_entry);
    }
    trade_sum_entry.supply += entry.supply;
    trade_sum_entry.demand += entry.demand;
  }
  return trade_sum_list;
};

export const validateTrade = (trade: TradeResult, trade_sum_list: TradeSumEntry[]): void => {
  for (const entry of trade.entries) {
    { // verify entries there's no other opposite trade
      let other_trade_sum_entry = trade_sum_list.find((a) => a.supply_token_id == entry.demand_token_id);
      if (other_trade_sum_entry == null) {
        other_trade_sum_entry = trade_sum_list.find((a) => a.demand_token_id == entry.supply_token_id);
      }
      if (other_trade_sum_entry != null) {
        throw new Error(`The trade may not contain opposed entries!`);
      }
    }
  }
};

export default async function fundTrade (exlab: cauldron.ExchangeLab, trade: TradeResult, input_coins: SpendableCoin[], payout_rules: PayoutRule[], txfee_per_byte: bigint, options: { verify_transactions?: boolean } = {}): Promise<FundTradeResult> {
  const tokens_balance: Array<{ token_id: TokenId, value: bigint }> = [
    { token_id: NATIVE_BCH_TOKEN_ID, value: 0n }
  ];
  for (const entry of trade.entries) {
    { // add demand from balance as surplus
      let token_balance = tokens_balance.find((a) => a.token_id == entry.demand_token_id);
      if (token_balance == null) {
        token_balance = { token_id: entry.demand_token_id, value: 0n };
        tokens_balance.push(token_balance);
      }
      token_balance.value += entry.demand;
    }
    { // deduct supply from balance as deficit
      let token_balance = tokens_balance.find((a) => a.token_id == entry.supply_token_id);
      if (token_balance == null) {
        token_balance = { token_id: entry.supply_token_id, value: 0n };
        tokens_balance.push(token_balance);
      }
      token_balance.value -= entry.supply;
    }
  }

  const selected_input_coins = [];
  { // select input_coins
    const mixed_utxo_min_bch_amount = 5000n;
    const estimated_txfee = BigInt(trade.entries.length) * 197n * txfee_per_byte + 500n;
    const should_include_bch_utxos = (tokens_balance.find((a) => a.token_id == NATIVE_BCH_TOKEN_ID) as { value: bigint }).value < estimated_txfee;
    const negative_balance_tokens = tokens_balance.filter((a) => a.value < 0n).map((a) => a.token_id);
    for (const input_coin of input_coins) {
      if (input_coin.output?.token?.nft != null) {
        continue; // do not include nfts
      }
      let should_include = false;
      if ((should_include_bch_utxos && (input_coin.output.token == null || input_coin.output.amount > mixed_utxo_min_bch_amount)) ||
        negative_balance_tokens.indexOf(input_coin.output.token?.token_id as any) != -1) {
        selected_input_coins.push(input_coin);
      }
    }
  }

  let used_input_coins: SpendableCoin[] = [];
  const write_tx_controller = {
    // @ts-ignore
    async generateMiddleware (result: GenerateChainedTradeTxResult, grouped_entries: Array<{ supply_token_id: TokenId, demand_token_id: TokenId, list: PoolTrade[] }>, input_coins: SpendableCoin[]): Promise<GenerateChainedTradeTxResult> {
      used_input_coins = [ ...used_input_coins, ...result.input_coins ];
      return result;
    },
  };
  const trade_tx_list: TradeTxResult[] = await exlab.createChainedTradeTx(trade.entries, selected_input_coins, payout_rules, null, txfee_per_byte, write_tx_controller);
  for (const trade_tx of trade_tx_list) {
    if (options.verify_transactions) {
      exlab.verifyTradeTx(trade_tx);
    }
  }

  return {
    pools_count: trade.entries.length,
    input_coins: used_input_coins.map((a) => ({
      outpoint: {
        txhash: binToHex(a.outpoint.txhash),
        index: a.outpoint.index,
      },
      output: {
        locking_bytecode: binToHex(a.output.locking_bytecode),
        token: a.output.token ? {
          token_id: a.output.token.token_id,
          amount: a.output.token.amount+'',
        } : undefined,
        amount: a.output.amount+'',
      },
    })),
    transactions: trade_tx_list.map((trade_tx) => {
      return {
        txhex: binToHex(trade_tx.txbin),
        txbin_size: trade_tx.txbin.length,
        txhash: binToHex(hashTransactionUiOrder(trade_tx.txbin)),
        txfee: trade_tx.txfee+'',
        input_count: trade_tx.libauth_generated_transaction.inputs.length,
        output_count: trade_tx.libauth_generated_transaction.outputs.length,
        token_burns: trade_tx.token_burns.map((a) => ({ token_id: a.token_id, amount: a.amount+'' })),
        payouts_info: trade_tx.payouts_info.map((a) => ({
          index: a.index,
          output: {
            locking_bytecode: binToHex(a.output.locking_bytecode),
            token: a.output.token ? {
              token_id: a.output.token.token_id,
              amount: a.output.token.amount+'',
            } : undefined,
            amount: a.output.amount+'',
          },
        })),
        trade_tx,
      };
    }),
  };
}
