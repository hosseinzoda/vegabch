import type { ModuleMethod } from './types.js';
import {
  common as cashlab_common,
  OutputWithFT, SpendableCoin, TokenId,
  InsufficientFunds,
  NATIVE_BCH_TOKEN_ID
} from 'cashlab';
const { bigIntArraySortPolyfill } = cashlab_common;

export const initModuleMethodWrapper = () => {
  const methods: { [name: string]: ModuleMethod } = {};
  let services: any = null;
  return {
    methods,
    defineServices: (_services: any) => {
      services = _services;
    },
    add: (name: string, method: ModuleMethod) => {
      methods[name] = (...args): any => method.call(null, services, ...args);
    },
  };
};

export const selectInputCoins = (input_coins: SpendableCoin[], requirements: Array<{ token_id: TokenId, amount: bigint, min_amount_per_utxo?: bigint, min_token_amount_per_utxo?: bigint }>, { allow_nft, select_pure_bch }: { allow_nft?: boolean, select_pure_bch?: boolean  }): SpendableCoin[] => {
  input_coins = allow_nft ? input_coins : input_coins.filter((a) => a.output.token?.nft?.commitment == null);
  const output: SpendableCoin[] = [];
  requirements = structuredClone(requirements);
  const bch_requirement: { token_id: TokenId, amount: bigint } | undefined = requirements.find((a) => a.token_id == NATIVE_BCH_TOKEN_ID);
  for (const requirement of requirements) {
    let sub_input_coins = input_coins.filter((a) => output.indexOf(a) == -1);
    if (requirement.token_id == NATIVE_BCH_TOKEN_ID) {
      sub_input_coins = [
        // first-in-line coins without tokens
        ...bigIntArraySortPolyfill(sub_input_coins.filter((a) => a.output.token == null), (a, b) => b.output.amount - a.output.amount),
        // second-in-line coins with tokens
        ...(select_pure_bch ? [] : bigIntArraySortPolyfill(sub_input_coins.filter((a) => a.output.token != null), (a, b) => b.output.amount - a.output.amount)),
      ];
    } else {
      sub_input_coins = sub_input_coins.filter((a) => a.output?.token?.token_id == requirement.token_id && a.output.token.amount > 0n);
      bigIntArraySortPolyfill(sub_input_coins, (a, b) => (b.output as OutputWithFT).token.amount - (a.output as OutputWithFT).token.amount);
    }
    for (const input_coin of sub_input_coins) {
      if (requirement.amount <= 0n) {
        break // cleared
      }
      if (requirement.min_token_amount_per_utxo != null && input_coin.output.token != null && input_coin.output.token.amount < requirement.min_token_amount_per_utxo) {
        continue;
      }
      if (requirement.min_amount_per_utxo != null && input_coin.output.amount < requirement.min_amount_per_utxo) {
        continue;
      }
      if (input_coin.output.token != null) {
        const token_id = input_coin.output.token.token_id;
        const token_requirement: { token_id: TokenId, amount: bigint } | undefined = requirements.find((a) => a.token_id == token_id);
        if (token_requirement != null) {
          token_requirement.amount -= input_coin.output.token.amount;
        }
      }
      if (bch_requirement != null) {
        if (input_coin.output.token == null || !select_pure_bch) {
          bch_requirement.amount -= input_coin.output.amount;
        }
      }
      output.push(input_coin);
    }
  }
  if (requirements.filter((a) => a.amount > 0n).length > 0) {
    throw new InsufficientFunds(`Not enough input coins to satisfy the requirements!`);
  }
  return output;
};
