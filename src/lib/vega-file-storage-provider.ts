import FileStorageProvider, { Data as FileStorageData } from './mainnet-storage-providers/file-storage-provider.js';
import INITIAL_BCMR from './vega-initial-bcmr.json' assert { type: 'json' };
import type { Registry, IdentityHistory, IdentitySnapshot } from './schemas/bcmr-v2.schema.js';
import { isAValidNonNativeTokenId } from './util.js';

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

export type TokensIdentity = {
  [token_id: string]: {
    authbase: string;
    history: IdentityHistory;
  };
};
export type WalletSettings = {
  [setting_name: string]: string;
};
export type VegaFileStorageData = FileStorageData & {
  tokens_identity: TokensIdentity;
  pinned_wallet_name?: string;
  settings: WalletSettings;
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

export default class VegaFileStorageProvider extends FileStorageProvider {
  _file_data: VegaFileStorageData | null;
  constructor (filename: string) {
    super(filename);
    this._file_data = null;
  }
  async initData (): Promise<VegaFileStorageData> {
    return {
      wallets: [],
      tokens_identity: initWalletsFileDataTokenIdentities(),
      settings: {},
    };
  }
  async setTokensIdentity (tokens_identity: TokensIdentity): Promise<void> {
    if (!this._file_data) {
      throw new Error('The file storage is not initialized!');
    }
    this._file_data.tokens_identity = tokens_identity;
    this._save();
  }
  async getTokensIdentity (): Promise<TokensIdentity> {
    if (!this._file_data) {
      throw new Error('The file storage is not initialized!');
    }
    return this._file_data.tokens_identity;
  }
  async setWalletSettings (wallet_settings: WalletSettings) {
    if (!this._file_data) {
      throw new Error('The file storage is not initialized!');
    }
    this._file_data.settings = wallet_settings;
    await this._save();
  }
  async getWalletSettings (): Promise<WalletSettings> {
    if (!this._file_data) {
      throw new Error('The file storage is not initialized!');
    }
    return this._file_data.settings || {};
  }
  async pinWallet (name: string | undefined): Promise<void> {
    if (!this._file_data) {
      throw new Error('The file storage is not initialized!');
    }
    if (name != null && (await this.getWallet(name)) == null) {
      throw new Error('Wallet is not defined, name: ' + name);
    }
    this._file_data.pinned_wallet_name = name;
    this._save();
  }
  async getPinnedWalletName (): Promise<string | undefined> {
    if (!this._file_data) {
      throw new Error('The file storage is not initialized!');
    }
    return this._file_data.pinned_wallet_name;
  }
}
