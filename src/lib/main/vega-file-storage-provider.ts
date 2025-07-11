import INITIAL_BCMR from '../vega-initial-bcmr.json' with { type: 'json' };
import type { Registry, IdentityHistory, IdentitySnapshot } from '../schemas/bcmr-v2.schema.js';
import { isAValidNonNativeTokenId } from '../util.js';
import {
  deriveHdPath, secp256k1, decodePrivateKeyWif, assertSuccess, hash160,
  publicKeyToP2pkhLockingBytecode, lockingBytecodeToCashAddress, encodePrivateKeyWif,
  deriveHdPrivateNodeFromBip39Mnemonic,
} from '@cashlab/common/libauth.js';
import { EventEmitter } from 'node:events';
import type { Service } from './types.js';
import { access, constants as fs_constants, readFile, writeFile } from 'node:fs/promises';

export type WalletDataNetwork = 'mainnet' | 'testnet' | 'chipnet';
export type WalletDataType = 'single-address-seed' | 'wif';

export type SingleAddressHDWalletData = {
  type: 'single-address-seed';
  network: WalletDataNetwork;
  seed_phrase: string;
  derivation_path: string;
};

export type WifWalletData = {
  type: 'wif';
  network: WalletDataNetwork;
  private_key: Uint8Array;
};

export type WalletData = |
  SingleAddressHDWalletData |
  WifWalletData;

export type InternalWalletEntry = {
  name: string;
  wallet: string; // serlialized wallet data
  settings: { [name: string]: any };
};

export type WalletMetadata = {
  name: string;
  settings: { [name: string]: any };
};

export const parseWalletData = (str: string): WalletData => {
  let [ wallet_type, wallet_network, value1, value2 ] = str.split(':');
  if (['mainnet','testnet','chipnet'].indexOf(wallet_network as string) == -1) {
    throw new Error('wallet_network is not valid, value: ' + wallet_network);
  }
  if (wallet_type == 'seed') {
    if (value1 == null || value2 == null) {
      throw new Error('seed_phrase or derivation_path are not defined');
    }
    return {
      type: 'single-address-seed',
      network: wallet_network as any,
      seed_phrase: value1,
      derivation_path: value2,
    };
  } else if (wallet_type == 'wif') {
    if (value1 == null) {
      throw new Error('private_key is not defined');
    }
    return {
      type: 'wif',
      network: wallet_network as any,
      private_key: assertSuccess(decodePrivateKeyWif(value1)).privateKey,
    };
  } else {
    throw new Error('Unknown wallet type, value: ' + wallet_type);
  }
};

export const stringifyWalletData = (data: WalletData): string => {
  if (data.type == 'single-address-seed') {
    return `seed:${data.network}:${data.seed_phrase}:${data.derivation_path}`;
  } else if (data.type == 'wif') {
    const wif_key = encodePrivateKeyWif(data.private_key, data.network == 'mainnet' ? 'mainnet' : 'testnet');
    return `wif:${data.network}:${wif_key}`;
  }
  throw new Error('unknown wallet_type: ' + (data as any).type);
};

export type WalletAddressInfo = {
  wallet_type: 'single-address-seed' | 'wif';
  locking_type: 'p2pkh';
  cashaddr: string;
  locking_bytecode: Uint8Array;
  public_key_uncompressed: Uint8Array;
  public_key: Uint8Array;
  public_key_hash: Uint8Array;
  private_key?: Uint8Array;
};

export type WalletAddressInfoWithPrivateKey = WalletAddressInfo & {
  private_key: Uint8Array;
};

export const genWalletAddressInfo = (data: WalletData): WalletAddressInfo => {
  let private_key: Uint8Array;
  if (data.type == 'single-address-seed') {
    const node = deriveHdPrivateNodeFromBip39Mnemonic(data.seed_phrase);
    private_key = assertSuccess(deriveHdPath(node, data.derivation_path)).privateKey;
  } else {
    private_key = data.private_key;
  }
  const network_prefix = data.network === 'mainnet' ? 'bitcoincash' : 'bchtest';
  const public_key_uncompressed = assertSuccess(secp256k1.derivePublicKeyUncompressed(private_key));
  const public_key = assertSuccess(secp256k1.derivePublicKeyCompressed(private_key));
  const public_key_hash = hash160(public_key);
  const locking_bytecode = assertSuccess(publicKeyToP2pkhLockingBytecode({ publicKey: public_key }))
  return {
    wallet_type: data.type,
    locking_type: 'p2pkh',
    public_key_uncompressed,
    public_key,
    public_key_hash,
    locking_bytecode,
    cashaddr: assertSuccess(lockingBytecodeToCashAddress({
      bytecode: locking_bytecode,
      prefix: network_prefix,
      tokenSupport: false,
    })).address,
    private_key,
  };
};

export type TokensIdentity = {
  [token_id: string]: {
    authbase: string;
    history: IdentityHistory;
  };
};
export type Settings = {
  [setting_name: string]: string;
};
export type VegaFileStorageData = {
  wallets: InternalWalletEntry[];
  tokens_identity: TokensIdentity
  pinned_wallet_name?: string;
  settings: Settings;
};

export const initWalletsFileDataTokenIdentities = (): { [token_id: string]: { authbase: string, history: IdentityHistory } } => {
  const current_date = new Date();
  const result: { [token_id: string]: { authbase: string, history: IdentityHistory } } = {};
  const registry: Registry = INITIAL_BCMR as Registry;
  for (const [ authbase, history ] of Object.entries(registry.identities||{})) {
    for (const identity of Object.values(history)) {
      if (identity?.token && identity.token.category != authbase) {
        throw new Error(`The retrived identity has one or more defined token with its token.category not matching authbase, To register a token it's required to have the authbase match the token category`);
      }
    }
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
    if (result[current_identity?.token?.category]) {
      throw new Error('A duplicate vega-initial-bcmr entry found, token_id: ' + current_identity?.token?.category);
    }
    result[current_identity?.token?.category] = {
      authbase, history,
    };
  }
  return result;
};

export default class VegaFileStorageProvider extends EventEmitter implements Service {
  _filename: string;
  constructor (filename: string) {
    super();
    this._filename = filename;
  }
  async init (): Promise<void> {
    // pass
  }
  async destroy (): Promise<void> {
    // pass
  }
  static initialData (): VegaFileStorageData {
    return {
      wallets: [],
      tokens_identity: initWalletsFileDataTokenIdentities(),
      settings: {},
    };
  }
  async _readData (): Promise<VegaFileStorageData> {
    try {
      await access(this._filename, fs_constants.R_OK | fs_constants.W_OK);
    } catch (err) {
      if ((err as any).code == 'ENOENT') {
        // initialize
        return VegaFileStorageProvider.initialData();
      } else {
        throw err;
      }
    }
    return JSON.parse((await readFile(this._filename)).toString('utf8'));
  }
  async _writeData (data: VegaFileStorageData): Promise<void> {
    await writeFile(this._filename, JSON.stringify(data, null, '  '));
  }
  _validateWalletMetadata (metadata: WalletMetadata): void {
    if (typeof metadata.name != 'string' || metadata.name == '') {
      throw new Error(`Invalid name, value: ${metadata.name}(${typeof metadata.name})`);
    }
    if (typeof metadata.settings != 'object' || metadata.settings == null) {
      throw new Error(`Invalid settings, Expecting an object, type: ${typeof metadata.settings}`);
    }
  }
  _createInternalWalletEntry (metadata: WalletMetadata, wallet_data: WalletData): InternalWalletEntry {
    this._validateWalletMetadata(metadata);
    return {
      name: metadata.name,
      wallet: stringifyWalletData(wallet_data),
      settings: metadata.settings,
    };
  }
  _parseInternalWalletEntry (entry: InternalWalletEntry): { metadata: WalletMetadata, wallet_data: WalletData } {
    if (typeof entry.name != 'string' || entry.name == '') {
      throw new Error(`A wallet entry with an invalid name, value: ${entry.name}(${typeof entry.name})`);
    }
    if (typeof entry.wallet != 'string' || entry.wallet == '') {
      throw new Error(`A wallet entry with an invalid wallet data, value type: ${typeof entry.wallet}`);
    }
    const metadata = { name: entry.name, settings: entry.settings || {} };
    this._validateWalletMetadata(metadata);
    const wallet_data = parseWalletData(entry.wallet);
    return { metadata, wallet_data };
  }
  async storeTokensIdentity (tokens_identity: TokensIdentity): Promise<void> {
    const data = await this._readData();
    data.tokens_identity = tokens_identity;
    await this._writeData(data);
  }
  async getTokensIdentity (): Promise<TokensIdentity> {
    return (await this._readData()).tokens_identity;
  }
  async storeSettings (settings: Settings) {
    const data = await this._readData();
    data.settings = settings;
    await this._writeData(data);
    this.emit('settings-change', data.settings);
  }
  async getSettings (): Promise<Settings> {
    return (await this._readData()).settings || {};
  }
  async pinWallet (name: string | undefined): Promise<void> {
    const data = await this._readData();
    if (name !== undefined) {
      const wallet_entry = data.wallets.find((a) => a.name == name);
      if (wallet_entry == null) {
        throw new Error('Wallet is not defined, name: ' + name);
      }
    }
    data.pinned_wallet_name = name;
    await this._writeData(data);
  }
  async getPinnedWalletName (): Promise<string | undefined> {
    return (await this._readData()).pinned_wallet_name;
  }


  async updateWalletMetadata (metadata: WalletMetadata): Promise<void> {
    this._validateWalletMetadata(metadata);
    const data = await this._readData();
    const entry = data.wallets.find((a) => a.name == metadata.name);
    if (entry == null) {
      throw new Error('Wallet does not exists!, name: ' + name);
    }
    entry.settings = metadata.settings;
    await this._writeData(data);
    this.emit('wallet-metadata-change', metadata);
  }
  async insertWallet (metadata: WalletMetadata, wallet_data: WalletData): Promise<void> {
    const entry = this._createInternalWalletEntry(metadata, wallet_data);
    const data = await this._readData();
    const existing_entry = data.wallets.find((a) => a.name == entry.name);
    if (existing_entry != null) {
      throw new Error('Wallet is already defined!, name: ' + name);
    }
    data.wallets.push(entry);
    await this._writeData(data);
  }

  async getAllWallets (): Promise<Array<{ metadata: WalletMetadata, wallet_data: WalletData }>> {
    const data = await this._readData();
    return data.wallets.map((entry) => this._parseInternalWalletEntry(entry));
  }
  async getAllWalletsMetadata (): Promise<WalletMetadata[]> {
    const data = await this._readData();
    return data.wallets.map((entry) => this._parseInternalWalletEntry(entry).metadata);
  }
  async getWalletMetadata (name: string): Promise<WalletMetadata | undefined> {
    const data = await this._readData();
    const entry = data.wallets.find((a) => a.name == name);
    if (entry == null) {
      return;
    }
    return this._parseInternalWalletEntry(entry).metadata;
  }
  async getWalletData (name: string): Promise<WalletData | undefined> {
    const data = await this._readData();
    const entry = data.wallets.find((a) => a.name == name);
    if (entry == null) {
      return;
    }
    return this._parseInternalWalletEntry(entry).wallet_data;
  }
  async getWalletDataWithMetadata (name: string): Promise<{ metadata: WalletMetadata, wallet_data: WalletData } | undefined> {
    const data = await this._readData();
    const entry = data.wallets.find((a) => a.name == name);
    if (entry == null) {
      return;
    }
    return this._parseInternalWalletEntry(entry);
  }
}
