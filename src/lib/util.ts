import type { Registry, IdentityHistory, IdentitySnapshot } from './schemas/bcmr-v2.schema.js';
import type { Fraction, TokenId, UTXO, TxResult, Outpoint } from '@cashlab/common';
import { ValueError } from './exceptions.js';
import { hexToBin, binToHex, convertFractionDenominator } from '@cashlab/common/util.js';
import { NATIVE_BCH_TOKEN_ID } from '@cashlab/common/constants.js';
import type { ExchangeLab, PoolV0Parameters, PoolV0, TradeResult, PoolTrade } from '@cashlab/cauldron';
import type { TokensIdentity } from './main/vega-file-storage-provider.js';
import type {
  ElectrumClient, ElectrumClientEvents,
  RPCParameter as ElectrumRPCParameter, RequestResponse as ElectrumRequestResponse,
} from '@electrum-cash/network';
import http from 'http';
import https from 'https';

export { hexToBin, binToHex } from '@cashlab/common/util.js';

export const cashlabTxResultSummaryJSON = (data: TxResult): any => {
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

export const readableTokenBalance = (token_id: TokenId, amount: bigint, bcmr_indexer: BCMRIndexer): { symbol: string, amount: string } => {
  const token_identity = token_id != NATIVE_BCH_TOKEN_ID ? bcmr_indexer.getTokenCurrentIdentity(token_id) : null;
  const token_info = token_id == NATIVE_BCH_TOKEN_ID  ? getNativeBCHTokenInfo() : token_identity?.token;
  const symbol = token_info?.symbol ? token_info.symbol : token_id;
  const decimals = token_info?.decimals != null && token_info?.decimals > 0 ? token_info.decimals : 0;
  const amount_dec = bigIntToDecString(amount, decimals);
  return { symbol, amount: amount_dec };
};

export const parsePoolFromRostrumNodeData  = (exlab: ExchangeLab, rn_pool: any): PoolV0 | null => {
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

export const convertToJSONSerializable = (v: any): any => {
  if (typeof v == 'bigint') {
    return v+'';
  }
  if (v instanceof Error) {
    v = {
      message: v.message, name: v.name,
      ...Object.fromEntries(['code'].filter((a) => v[a] != null).map((a) => [ a, v[a] ])),
    };
  } else if (Array.isArray(v)) {
    v = Array.from(v).map(convertToJSONSerializable);
  } else if (v && typeof v == 'object') {
    if (v instanceof Uint8Array) {
      v = binToHex(v);
    } else {
      v = Object.fromEntries(
        Object.entries(v)
          .map((a) => [ a[0], convertToJSONSerializable(a[1]) ])
      )
    }
  }
  return v;
}

export const fractionAsReadableText = (a: Fraction, decimals: number): string => {
  const dec_frac: Fraction = convertFractionDenominator(a, 10n ** BigInt(decimals));
  return `${bigIntToDecString(dec_frac.numerator, decimals)}   (${a.numerator} / ${a.denominator})`;
};

export const parseFractionFromString = (a: string, unsigned: boolean): Fraction => {
  const ia = a;
  const slash_idx = a.indexOf('/');
  if (slash_idx != -1) {
    const parts = a.split('/');
    const dot_idx = a.indexOf('.');
    if (dot_idx != -1 || parts.length != 2) {
      throw new ValueError(`Expecting a fraction with two integers, got: ${ia}`);
    }
    const pttrn = /^\s*(\-?[0-9]+)\s*$/;
    const parts_match: any = parts.map((a) => a.match(pttrn));
    if (parts_match[0] == null) {
      throw new ValueError(`The numerator of a fraction should be an integer, got: ${ia}`);
    }
    if (parts_match[1] == null) {
      throw new ValueError(`The denominator of a fraction should be an integer, got: ${ia}`);
    }
    if (parts_match.filter((a: any) => a[1][0] == '-').length > 0) {
      if (unsigned) {
        throw new ValueError(`The value should be a non-negative fraction, got: ${ia}`);
      }
    }
    if (BigInt(parts_match[1][1]) == 0n) {
      throw new ValueError(`Fraction denominator should not be zero!`)
    }
    return {
      numerator: BigInt(parts_match[0][1]),
      denominator: BigInt(parts_match[1][1]),
    };
  } else {
    a = a.trim();
    const sign = a[0] == '-';
    if (sign) {
      if (unsigned) {
        throw new ValueError(`should be a non-negative fraction, got: ${ia}`);
      }
      a = a.slice(1);
    }
    const parts = a.split('.');
    if (parts.length > 2) {
      throw new ValueError(`A fraction represented as a decimal number should not contain more than one dot (.) , value: ${ia}`);
    }
    const pttrn = /^[0-9]+$/;
    const parts_match = parts.map((a) => a.match(pttrn));
    if (parts_match.filter((a) => !a).length > 0) {
      throw new ValueError(`Invalid value, Expecting a fraction, got: ${ia}`);
    }
    let decimals;
    let i, d;
    if (parts.length == 2) {
      i = BigInt(parts[0] as string);
      d = BigInt(parts[1] as string);
      decimals = BigInt((parts[1] as string).length);;
    } else {
      i = BigInt(parts[0] as string);
      d = 0n;
      decimals = 0n;
    }
    return {
      numerator: i * (10n ** decimals) + d,
      denominator: 10n ** decimals,
    };
  }
};


export function parseOutpointFromInputArgument (arg: string, name: string): Outpoint {
  const [ outpoint_txid, outpoint_index ] = arg.split(':');
  if (typeof outpoint_index != 'string' || isNaN(parseInt(outpoint_index)) && parseInt(outpoint_index) > 0) {
    throw new ValueError(`${name} index is not a positive number!`);
  }
  const outpoint_txhash = hexToBin(outpoint_txid as string);
  if (outpoint_txhash.length != 32) {
    throw new ValueError(`${name} txhash should be a 32 bytes represented in hexstring!`);
  }
  return { txhash: outpoint_txhash, index: parseInt(outpoint_index) };
}

export async function electrumClientSendRequest (client: ElectrumClient<ElectrumClientEvents>, method: string, ...args: ElectrumRPCParameter[]): Promise<ElectrumRequestResponse> {
  const output = await client.request(method, ...args);
  if (output instanceof Error) {
    throw output;
  }
  return output;
}

export function fetchBlobWithHttpRequest ({ url, agents, headers }: {
  url: string;
  agents?: { http: http.Agent, https: https.Agent },
  headers?: { [name: string]: string };
}): Promise<{ body: any, response: http.IncomingMessage }> {
  return new Promise((resolve, reject) => {
    try {
      const is_https = url.toLowerCase().startsWith('https://');
      const req = (is_https ? https : http).request(url, {
        agent: agents != null ? (is_https ? agents.https : agents.http) : undefined,
        method: 'GET',
        headers,
      }, (resp) => {
        const MAX_RESPONSE_SIZE = 1024 * 1024 * 2; // 2MB
        let post_size = 0;
        let chunks: Buffer[] = [];
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
          try {
            resolve({ body: Buffer.concat(chunks), response: resp });
          } catch (err) {
            reject(new Error('Failed to parse the response body, content: ' + Buffer.concat(chunks).toString()));
          }
        });
      });
      req.on('error', (error) => {
        reject(error);
      });
      req.end();
    } catch (err) {
      console.error("ERRR", err);
      reject(err);
    }
  });
}



