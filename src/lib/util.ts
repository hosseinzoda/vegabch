import type { Wallet, WalletTypeEnum, Network } from 'mainnet-js';
const { hexToBin, binToHex } = libauth;
import type { Registry, IdentityHistory, IdentitySnapshot } from './schemas/bcmr-v2.schema.js';
import type {
  VegaWifWallet as VegaWifWalletClass, VegaTestNetWifWallet as VegaTestNetWifWalletClass,
  VegaRegTestWifWallet as VegaRegTestWifWalletClass, VegaWallet as VegaWalletClass,
  VegaTestNetWallet as VegaTestNetWalletClass, VegaRegTestWallet as VegaRegTestWalletClass
} from './vega-wallets.js';
import {
  libauth, cauldron, Fraction, NATIVE_BCH_TOKEN_ID, TokenId,
  SpendableCoin, SpendableCoinType, common as cashlab_common,
} from 'cashlab';
import type { PoolV0Parameters, PoolV0, TradeResult } from 'cashlab/build/cauldron/types.js';
const { convertFractionDenominator } = cashlab_common;
import type { ActivePoolEntry } from './cauldron-indexer-rpc-client.js';
import type { UtxoI, TokenI } from 'mainnet-js';

let VegaWifWallet: typeof VegaWifWalletClass, VegaTestNetWifWallet: typeof VegaTestNetWifWalletClass, VegaRegTestWifWallet: typeof VegaRegTestWifWalletClass, VegaWallet: typeof VegaWalletClass, VegaTestNetWallet: typeof VegaTestNetWalletClass, VegaRegTestWallet: typeof VegaRegTestWalletClass;
const requireVegaWallets = async () => {
  if (VegaWifWallet == null) {
    ({ VegaWifWallet, VegaTestNetWifWallet, VegaRegTestWifWallet, VegaWallet, VegaTestNetWallet, VegaRegTestWallet } = await import('./vega-wallets.js'));
  }
};

const wallet_class_map: { [type: string]: { [network: string]: () => typeof Wallet } } = {
  wif: {
    mainnet: () => {
      return VegaWifWallet;
    },
    testnet: () => {
      return VegaTestNetWifWallet;
    },
    regtest: () => {
      return VegaRegTestWifWallet;
    },
  },
  seed: {
    mainnet: () => {
      return VegaWallet;
    },
    testnet: () => {
      return VegaTestNetWallet;
    },
    regtest: () => {
      return VegaRegTestWallet;
    },
  },
}

export const getWalletClassByTypeAndNetwork = async (wallet_type: WalletTypeEnum | string, network: Network | string): Promise<typeof Wallet> => {
  await requireVegaWallets()
  const wallet_class_map_by_network = wallet_class_map[wallet_type];
  if (!wallet_class_map_by_network) {
    throw new Error(`unkown wallet type: ${wallet_type}`);
  }
  const get_wallet_class = wallet_class_map_by_network[network];
  if (!get_wallet_class) {
    throw new Error(`unkown network: ${network}`);
  }
  return get_wallet_class();
};

export const convertCauldronPoolTradeEntryToJSON = (data: cauldron.PoolTrade): any => {
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

export const cauldronPoolTradeFromJSON = (data: any): cauldron.PoolTrade => {
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

export const convertElectrumUtxosToMainnetUtxos = (eutxo_list: any[]): UtxoI[] => {
  return eutxo_list
    .filter((a) => !a.has_token || !!a.token_data)
    .map((eutxo) => ({
      txid: eutxo.tx_hash,
      vout: eutxo.tx_pos,
      satoshis: eutxo.value,
      height: eutxo.height,
      token: eutxo.token_data
        ? {
          amount: BigInt(eutxo.token_data.amount),
          tokenId: eutxo.token_data.category,
          capability: eutxo.token_data.nft?.capability,
          commitment: eutxo.token_data.nft?.commitment,
        }
        : undefined,
    }));
};

export type TokensBalanceDetail = {
  [ token_id: TokenId ]: {
    confirmed_balance: bigint;
    unconfirmed_balance: bigint;
  };
};
export const tokensBalanceDetailFromUtxoList = (utxo_list: UtxoI[]): TokensBalanceDetail => {
  const result: TokensBalanceDetail = {};
  const bch_result = result[NATIVE_BCH_TOKEN_ID] = result[NATIVE_BCH_TOKEN_ID] || { confirmed_balance: 0n, unconfirmed_balance: 0n };
  for (const utxo of utxo_list) {
    const token: TokenI | undefined = utxo.token;
    if (token != null) {
      const token_result = result[token.tokenId as TokenId] = result[token.tokenId as TokenId] || { confirmed_balance: 0n, unconfirmed_balance: 0n };
      if (utxo.height != null && utxo.height > 0) {
        token_result.confirmed_balance += token.amount;
      } else {
        token_result.unconfirmed_balance += token.amount;
      }
    }
    if (utxo.height != null && utxo.height > 0) {
      bch_result.confirmed_balance += BigInt(utxo.satoshis);
    } else {
      bch_result.unconfirmed_balance += BigInt(utxo.satoshis);
    }
  }
  return result;
};

export const parsePoolsFromRiftenLabCauldronIndexer = (exlab: cauldron.ExchangeLab, rl_pools: ActivePoolEntry[]): PoolV0[] => {
  const pools: PoolV0[] = [];
  for (const rl_pool of rl_pools) {
    const pool_params: PoolV0Parameters = {
      withdraw_pubkey_hash: hexToBin(rl_pool.owner_pkh),
    };
    // reconstruct pool's locking bytecode
    const locking_bytecode = exlab.generatePoolV0LockingBytecode(pool_params);
    const pool: PoolV0 = {
      version: '0',
      parameters: pool_params,
      outpoint: {
        index: rl_pool.tx_pos,
        txhash: hexToBin(rl_pool.txid),
      },
      output: {
        locking_bytecode,
        token: {
          amount: BigInt(rl_pool.tokens),
          token_id: rl_pool.token_id,
        },
        amount: BigInt(rl_pool.sats),
      },
    };
    pools.push(pool);
  }
  return pools;
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

export const walletP2pkhUtxosToSpendableCoins = (utxo_list: UtxoI[], wallet_locking_bytecode: Uint8Array, wallet_private_key: Uint8Array): SpendableCoin[] => {
  return utxo_list.map((utxo) => ({
    type: SpendableCoinType.P2PKH,
    output: {
      locking_bytecode: wallet_locking_bytecode,
      token: utxo.token != null ? {
        amount: utxo.token.amount,
        token_id: utxo.token.tokenId,
        nft: utxo.token.capability != null ? {
          capability: utxo.token.capability,
          commitment: utxo.token.commitment == null ? new Uint8Array(0) : hexToBin(utxo.token.commitment),
        } : undefined,
      } : undefined,
      amount: BigInt(utxo.satoshis),
    },
    outpoint: {
      index: utxo.vout,
      txhash: hexToBin(utxo.txid),
    },
    key: wallet_private_key,
  }));
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
