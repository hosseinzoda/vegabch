import type { Registry, IdentityHistory, IdentitySnapshot } from './schemas/bcmr-v2.schema.js';
import type { cauldron, Fraction, TokenId, UTXO } from 'cashlab';
import { hexToBin, binToHex, convertFractionDenominator } from 'cashlab/build/common/util.js';
import { NATIVE_BCH_TOKEN_ID } from 'cashlab/build/common/constants.js';
import type { PoolV0Parameters, PoolV0, TradeResult, PoolTrade } from 'cashlab/build/cauldron/types.js';
import type { TokensIdentity } from './main/vega-file-storage-provider.js';

export { hexToBin, binToHex } from 'cashlab/build/common/util.js';

export const moriaTxResultSummaryJSON = (data: any): any => {
  return {
    txbin: binToHex(data.txbin),
    txhash: binToHex(data.txhash),
    txfee: data.txfee+'',
    payouts: data.payouts.map(convertUTXOToJSON),
  };
};

export const convertCauldronPoolTradeEntryToJSON = (data: PoolTrade): any => {
  return {
    pool: {
      version: data.pool.version,
      parameters: {
        withdraw_pubkey_hash: binToHex(data.pool.parameters.withdraw_pubkey_hash),
      },
      outpoint: {
        index: data.pool.outpoint.index,
        txhash: binToHex(data.pool.outpoint.txhash),
      },
      output: {
        locking_bytecode: binToHex(data.pool.output.locking_bytecode),
        token: {
          amount: data.pool.output.token.amount+'',
          token_id: data.pool.output.token.token_id,
        },
        amount: data.pool.output.amount+'',
      },
    },
    supply_token_id: data.supply_token_id,
    demand_token_id: data.demand_token_id,
    supply: data.supply+'',
    demand: data.demand+'',
    trade_fee: data.trade_fee+'',
  };
};

export const cauldronPoolTradeFromJSON = (data: any): PoolTrade => {
  return {
    pool: {
      version: data.pool.version,
      parameters: {
        withdraw_pubkey_hash: hexToBin(data.pool.parameters.withdraw_pubkey_hash),
      },
      outpoint: {
        index: data.pool.outpoint.index,
        txhash: hexToBin(data.pool.outpoint.txhash),
      },
      output: {
        locking_bytecode: hexToBin(data.pool.output.locking_bytecode),
        token: {
          amount: BigInt(data.pool.output.token.amount),
          token_id: data.pool.output.token.token_id,
        },
        amount: BigInt(data.pool.output.amount),
      },
    },
    supply_token_id: data.supply_token_id,
    demand_token_id: data.demand_token_id,
    supply: BigInt(data.supply),
    demand: BigInt(data.demand),
    trade_fee: BigInt(data.trade_fee),
  };
};

export const convertTradeResultToJSON = (data: TradeResult): any => {
  return {
    entries: data.entries.map((a) => convertCauldronPoolTradeEntryToJSON(a)),
    summary: {
      supply: data.summary.supply+'',
      demand: data.summary.demand+'',
      trade_fee: data.summary.trade_fee+'',
      rate: {
        numerator: data.summary.rate.numerator+'',
        denominator: data.summary.rate.denominator+'',
      },
    },
  };
};
export const tradeResultFromJSON = (data: any): TradeResult => {
  return {
    entries: data.entries.map((a: any) => cauldronPoolTradeFromJSON(a)),
    summary: {
      supply: BigInt(data.summary.supply),
      demand: BigInt(data.summary.demand),
      trade_fee: BigInt(data.summary.trade_fee),
      rate: {
        numerator: BigInt(data.summary.rate.numerator),
        denominator: BigInt(data.summary.rate.denominator),
      },
    },
  };
};

export const convertUTXOToJSON = (utxo: UTXO): any => {
  return {
    block_height: utxo.block_height,
    outpoint: {
      index: utxo.outpoint.index,
      txhash: binToHex(utxo.outpoint.txhash),
    },
    output: {
      locking_bytecode: binToHex(utxo.output.locking_bytecode),
      token: utxo.output.token != null ? {
        amount: utxo.output.token.amount+'',
        token_id: utxo.output.token.token_id,
        nft: utxo.output.token.nft != null ? {
          capability: utxo.output.token.nft.capability,
          commitment: binToHex(utxo.output.token.nft.commitment),
        } : undefined,
      } : undefined,
      amount: utxo.output.amount+'',
    },
  };
};

export const utxoFromJSON = (data: any): UTXO => {
  return {
    block_height: data.block_height,
    outpoint: {
      index: data.outpoint.index,
      txhash: hexToBin(data.outpoint.txhash),
    },
    output: {
      locking_bytecode: hexToBin(data.output.locking_bytecode),
      token: data.output.token != null ? {
        amount: BigInt(data.output.token.amount),
        token_id: data.output.token.token_id,
        nft: data.output.token.nft != null ? {
          capability: data.output.token.nft.capability,
          commitment: hexToBin(data.output.token.nft.commitment),
        } : undefined,
      } : undefined,
      amount: BigInt(data.output.amount),
    },
  };
};

export const bigIntToDecString = (value: bigint, decimals: number): string => {
  const denominator = 10n ** BigInt(decimals);
  const digits = value / denominator;
  const dec = (value % denominator)+'';
  return digits + (dec.length > 0 && decimals > 0 ? '.' + '0'.repeat(decimals - dec.length) + dec :  '');
};

const decstring_parse_pttrn = /^([0-9]*)(\.[0-9]+)?$/;
export const bigIntFromDecString = (value: string, decimals: number): bigint => {
  const match = value.match(decstring_parse_pttrn);
  if (!match) {
    throw new Error('Expecting a number! got: ' + value);
  }
  if (match[2] != null && match[2].length - 1 > decimals) {
    throw new Error('Expecting a number with up to ' + decimals + ' decimal numbers');
  }
  return BigInt((match[1] == '' ? '0' : match[1]) as string) * (10n ** BigInt(decimals)) + (match[2] != null ? BigInt(match[2].slice(1) + ('0'.repeat(decimals - (match[2].length - 1)))) : 0n);
};

export const fractionToDecString = (value: Fraction, decimals: number): string => {
  return bigIntToDecString(convertFractionDenominator(value, 10n ** BigInt(decimals)).numerator, decimals)
};

const hexstring_token_id_pttrn = /^[0-9a-f]{64}$/;
export const isAValidNonNativeTokenId = (token_id: string): boolean => {
  return typeof token_id == 'string' && hexstring_token_id_pttrn.test(token_id);
};

export const getNativeBCHTokenInfo = (): { symbol: string, decimals: number } => {
  return { symbol: 'BCH', decimals: 8 };
};

export class BCMRIndexer {
  _registry: Registry;
  _tokens_identity: { [token_id: string]: { authbase: string, current: IdentitySnapshot, history: IdentityHistory } };
  constructor (registry: Registry) {
    this._registry = registry;
    this._tokens_identity = {};
    const current_date = new Date();
    for (const [ authbase, history ] of Object.entries(registry.identities||{})) {
      const history_entries: Array<{ key: string, date: Date, snapshot: IdentitySnapshot }> = Object.keys(history).map((key) => ({ key, date: new Date(key), snapshot: history[key] as IdentitySnapshot }))
        .filter((a) => a.snapshot != null)
        .sort((a, b) => b.date.getTime() - a.date.getTime());
      const current_entry = history_entries.filter((a) => a.date <= current_date)[0];
      if (!current_entry) {
        continue; // skip
      }
      const current_identity = current_entry.snapshot;
      if (!current_identity?.token?.category) {
        continue; // not a token?
      }
      if (!isAValidNonNativeTokenId(current_identity?.token?.category)) {
        throw new Error('An entry in vega-initial-bcmr has an invalid token_id: ' + current_identity?.token?.category);
      }
      if (this._tokens_identity[current_identity?.token?.category]) {
        throw new Error('A duplicate vega-initial-bcmr entry found, token_id: ' + current_identity?.token?.category);
      }
      this._tokens_identity[current_identity?.token?.category] = {
        authbase, history, current: current_identity,
      };
    }
  }
  getTokenCurrentIdentity (token_id: string): IdentitySnapshot | undefined {
    const entry = this._tokens_identity[token_id];
    if (entry == null) {
      return undefined;
    }
    return entry.current;
  }
  resolveTokenCategory (ref: string): string | undefined {
    const ref_lc = ref.toLowerCase();
    const targets = Object.entries(this._tokens_identity).filter((a) => typeof a[1]?.current?.token?.symbol == 'string' ? a[1].current.token.symbol.toLowerCase() == ref_lc : false);
    if (targets.length > 1) {
      throw new Error(`Multiple registered tokens with the following symbol: ${ref}`);
    } else if (targets.length == 1) {
      return (targets[0] as any)[0];
    }
    return undefined;
  }
};

export const resolveArgRefTokenAToken = (ref: string, bcmr_indexer: BCMRIndexer): TokenId => {
  if (ref == 'BCH') {
    return NATIVE_BCH_TOKEN_ID;
  }
  if (isAValidNonNativeTokenId(ref)) {
    return ref as TokenId;
  }
  const token_category = bcmr_indexer.resolveTokenCategory(ref);
  if (token_category != null) {
    return token_category as TokenId;
  }
  throw new Error(`Unknown token: ${ref}`);
};

export class TimeoutAndIntevalController {
  _timeout_set: Set<any>;
  _interval_set: Set<any>;
  _orig_functions: any;
  constructor () {
    this._timeout_set = new Set();
    this._interval_set = new Set();
    this._orig_functions = {};
  }
  start () {
    this._orig_functions.setTimeout = global.setTimeout;
    global.setTimeout = ((callable: () => void, timeval: number): any => {
      const id = this._orig_functions.setTimeout((): void => {
        this._timeout_set.delete(id);
        callable();
      }, timeval);
      this._timeout_set.add(id);
      return id;
    }) as any;
    this._orig_functions.setInterval = global.setInterval;
    global.setInterval = ((callable: () => void, timeval: number): any => {
      const id = this._orig_functions.setInterval((): void => {
        this._interval_set.delete(id);
        callable()
      }, timeval);
      this._interval_set.add(id);
      return id;
    }) as any;
    this._orig_functions.clearTimeout = global.clearTimeout;
    global.clearTimeout = ((id: any) => {
      this._timeout_set.delete(id);
      return this._orig_functions.clearTimeout(id);
    }) as any;
    this._orig_functions.clearInterval = global.clearInterval;
    global.clearInterval = ((id: any) => {
      this._interval_set.delete(id);
      return this._orig_functions.clearInterval(id);
    }) as any;
  }
  stop () {
    for (const [ name, func ] of Object.entries(this._orig_functions)) {
      (global as any)[name] = func;
    }
    this._orig_functions = {};
  }
  clearAll () {
    for (const id of this._timeout_set.values()) {
      ;(this._orig_functions.clearTimeout || clearTimeout)(id);
    }
    for (const id of this._interval_set.values()) {
      ;(this._orig_functions.clearInterval || clearInterval)(id);
    }
    this._timeout_set = new Set();
    this._interval_set = new Set();
  }
};

export const parseElectrumUTXO = (eutxo: any): UTXO => {
  if (eutxo.has_token && !eutxo.token_data) {
    throw new Error('eutxo has_token = true and token_data is null');
  }
  return {
    outpoint: { txhash: hexToBin(eutxo.tx_hash), index: eutxo.tx_pos },
    output: {
      locking_bytecode: typeof eutxo.locking_bytecode == 'string' ? binToHex(eutxo.locking_bytecode) : eutxo.locking_bytecode,
      amount: BigInt(eutxo.value),
      token: eutxo.token_data ? {
        amount: BigInt(eutxo.token_data.amount),
        token_id: eutxo.token_data.category,
        nft: eutxo.token_data.nft ? {
          capability: eutxo.token_data.nft.capability,
          commitment: hexToBin(eutxo.token_data.nft.commitment),
        } : undefined,
      } : undefined,
    },
    block_height: eutxo.height > 0 ? eutxo.height : undefined,
  };
};

export type TokenBalanceDetail = {
  token_id: TokenId;
  confirmed_balance: bigint;
  unconfirmed_balance: bigint;
};
export const tokensBalanceDetailFromUTXOList = (utxo_list: UTXO[]): TokenBalanceDetail[] => {
  const bch_result = {
    token_id: NATIVE_BCH_TOKEN_ID,
    confirmed_balance: 0n,
    unconfirmed_balance: 0n,
  };
  const result: TokenBalanceDetail[] = [ bch_result ];
  for (const utxo of utxo_list) {
    if (utxo.output.token != null) {
      let token_result = result.find((a) => a.token_id == utxo.output.token?.token_id);
      if (token_result == null) {
        result.push(token_result = {
          token_id: utxo.output.token.token_id,
          confirmed_balance: 0n,
          unconfirmed_balance: 0n,
        });
      }
      if (utxo.block_height != null && utxo.block_height > 0) {
        token_result.confirmed_balance += utxo.output.token.amount;
      } else {
        token_result.unconfirmed_balance += utxo.output.token.amount;
      }
    }
    if (utxo.block_height != null && utxo.block_height > 0) {
      bch_result.confirmed_balance += BigInt(utxo.output.amount);
    } else {
      bch_result.unconfirmed_balance += BigInt(utxo.output.amount);
    }
  }
  return result;
};


export const parsePoolFromRostrumNodeData  = (exlab: cauldron.ExchangeLab, rn_pool: any): PoolV0 | null => {
  if (rn_pool.is_withdrawn) {
    return null
  }
  const pool_params: PoolV0Parameters = {
    withdraw_pubkey_hash: hexToBin(rn_pool.pkh),
  };
  // reconstruct pool's locking bytecode
  const locking_bytecode = exlab.generatePoolV0LockingBytecode(pool_params);
  return {
    version: '0',
    parameters: pool_params,
    outpoint: {
      index: rn_pool.new_utxo_n,
      txhash: hexToBin(rn_pool.new_utxo_txid),
    },
    output: {
      locking_bytecode,
      token: {
        amount: BigInt(rn_pool.token_amount),
        token_id: rn_pool.token_id,
      },
      amount: BigInt(rn_pool.sats),
    },
  };
};

export class InOrderSingleThreadedExecutionQueue {
  private _queue: Array<{
    resolve: (result: any) => void,
    reject: (error: any) => void,
    entrypoint: () => Promise<any>,
  }>;
  private _running: boolean;
  constructor () {
    this._queue = []
    this._running = false
  }
  async _dequeue (): Promise<void> {
    // lock the entrypoint to execute one at a time
    if (this._running) {
      return;
    }
    let item = this._queue.shift()
    if (item) {
      const { resolve, reject, entrypoint } = item
      try {
        this._running = true
        resolve(await entrypoint())
      } catch (err) {
        reject(err)
      } finally {
        this._running = false
        this._dequeue()
      }
    }
  }
  add (entrypoint: () => Promise<any>): Promise<any> {
    return new Promise((resolve, reject) => {
      this._queue.push({ resolve, reject, entrypoint })
      this._dequeue()
    })
  }
}

export function deferredPromise<T> (): Promise<{ promise: Promise<T>, resolve: (result: T) => void, reject: (error: any) => void }> {
  return new Promise(function (onready) {
    let promise: Promise<T> | null = null, resolve: ((result: T) => void) | null = null, reject: ((error: any) => void) | null = null, did_call_ready: boolean = false;
    promise = new Promise((_resolve, _reject) => {
      resolve = _resolve;
      reject = _reject;
      if (promise && !did_call_ready) {
        did_call_ready = true;
        onready({promise,resolve,reject});
      }
    });
    if (resolve && reject && !did_call_ready) {
      did_call_ready = true;
      onready({promise,resolve,reject});
    }
  });
}

export const buildTokensBCMRFromTokensIdentity = (tokens_identity: TokensIdentity): Registry => {
  const identities: { [authbase: string]: IdentityHistory } = {};
  for (const [ token_id, entry ] of Object.entries(tokens_identity)) {
    identities[entry.authbase] = entry.history;
  }
  return {
    "$schema": "https://cashtokens.org/bcmr-v2.schema.json",
    "version": { "major": 1, "minor": 1, "patch": 2 },
    "latestRevision": "2024-05-29T00:00:00.000Z",
    "registryIdentity": {
      "name": "vega token registry",
      "description": "Tokens BCMR.",
    },
    identities,
  };
};

