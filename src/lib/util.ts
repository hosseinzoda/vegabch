import type { Wallet, WalletTypeEnum, Network } from 'mainnet-js';
import { libauth, cauldron, Fraction } from 'cashlab';
const { hexToBin, binToHex } = libauth;
import type { Registry, IdentityHistory, IdentitySnapshot } from './schemas/bcmr-v2.schema.js';
import type {
  VegaWifWallet as VegaWifWalletClass, VegaTestNetWifWallet as VegaTestNetWifWalletClass,
  VegaRegTestWifWallet as VegaRegTestWifWalletClass, VegaWallet as VegaWalletClass,
  VegaTestNetWallet as VegaTestNetWalletClass, VegaRegTestWallet as VegaRegTestWalletClass
} from './vega-wallets.js';
import { NATIVE_BCH_TOKEN_ID, TokenId, common as cashlab_common } from 'cashlab';
const { convertFractionDenominator } = cashlab_common;

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

export const convertTradeResultToJSON = (data: cauldron.TradeResult): any => {
  return {
    entries: data.entries.map((a) => ({
      pool: {
        version: a.pool.version,
        parameters: {
          withdraw_pubkey_hash: binToHex(a.pool.parameters.withdraw_pubkey_hash),
        },
        outpoint: {
          index: a.pool.outpoint.index,
          txhash: binToHex(a.pool.outpoint.txhash),
        },
        output: {
          locking_bytecode: binToHex(a.pool.output.locking_bytecode),
          token: {
            amount: a.pool.output.token.amount+'',
            token_id: a.pool.output.token.token_id,
          },
          amount: a.pool.output.amount+'',
        },
      },
      supply_token_id: a.supply_token_id,
      demand_token_id: a.demand_token_id,
      supply: a.supply+'',
      demand: a.demand+'',
      trade_fee: a.trade_fee+'',
    })),
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
export const tradeResultFromJSON = (data: any): cauldron.TradeResult => {
  return {
    entries: data.entries.map((a: any) => ({
      pool: {
        version: a.pool.version,
        parameters: {
          withdraw_pubkey_hash: hexToBin(a.pool.parameters.withdraw_pubkey_hash),
        },
        outpoint: {
          index: a.pool.outpoint.index,
          txhash: hexToBin(a.pool.outpoint.txhash),
        },
        output: {
          locking_bytecode: hexToBin(a.pool.output.locking_bytecode),
          token: {
            amount: BigInt(a.pool.output.token.amount),
            token_id: a.pool.output.token.token_id,
          },
          amount: BigInt(a.pool.output.amount),
        },
      },
      supply_token_id: a.supply_token_id,
      demand_token_id: a.demand_token_id,
      supply: BigInt(a.supply),
      demand: BigInt(a.demand),
      trade_fee: BigInt(a.trade_fee),
    })),
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
  return digits + (dec.length > 0 ? '.' + '0'.repeat(decimals - dec.length) + dec :  '');
};

const decstring_parse_pttrn = /^([0-9]+)(\.[0-9]+)?$/;
export const bigIntFromDecString = (value: string, decimals: number): bigint => {
  const match = value.match(decstring_parse_pttrn);
  if (!match) {
    throw new Error('Expecting a number! got: ' + value);
  }
  if (match[2] != null && match[2].length - 1 > decimals) {
    throw new Error('Expecting a number with up to ' + decimals + ' decimal numbers');
  }
  return BigInt(match[1] as string) * (10n ** BigInt(decimals)) + BigInt((match[2] as string).slice(1));
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


