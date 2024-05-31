import type { WalletDbEntryI, StorageProvider } from "mainnet-js";
import { access, constants as fs_constants, readFile, writeFile } from 'node:fs/promises';

export type Data = {
  wallets: WalletDbEntryI[];
};

export default class FileStorageProvider implements StorageProvider {
  protected _filename: string;
  protected _file_data: Data | null;
  public constructor (filename: string) {
    this._filename = filename;
    this._file_data = null;
  }

  protected async _save (): Promise<void> {
    if (!this._file_data) {
      throw new Error('The file storage is not initialized!');
    }
    await writeFile(this._filename, JSON.stringify(this._file_data, null, '  '));
  }

  async initData (): Promise<Data> {
    return {
      wallets: [],
    };
  }

  /**
   * Ensure the database exists and is open
   * @throws {Error} If the wallet could not be opened.
   * @returns the storage provider
   */
  async init (): Promise<StorageProvider> {
    if (!this._file_data) {
      try {
        await access(this._filename, fs_constants.R_OK | fs_constants.W_OK);
      } catch (err) {
        // initialize
        this._file_data = await this.initData();
        await this._save();
      }
      this._file_data = JSON.parse((await readFile(this._filename)).toString('utf8'));
    }
    return this;
  }

  /**
   * Manually close the database
   * @throws {Error} If the wallet could not be opened.
   * @returns the storage provider
   */
  async close (): Promise<StorageProvider> {
    this._file_data = null;
    return this;
  }

  /**
   * Returns information about the storage provider
   * @throws {Error} If there is no info
   * @returns string
   */
  getInfo (): string {
    return 'file storage provider, version: 0';
  }

  /**
   * Add a wallet to the database
   * @param name A user defined name for the wallet, and the walletId.
   * @param walletId String used to reconstruct the wallet.
   * @throws {Error} If the wallet could not be saved.
   * @returns if the operation was successful.
   */
  async addWallet (name: string, wallet: string): Promise<boolean> {
    if (!this._file_data) {
      throw new Error('The file storage is not initialized!');
    }
    let entry = this._file_data.wallets.find((a) => a.name == name);
    if (!entry) {
      entry = { name, wallet };
      this._file_data.wallets.push(entry);
      await this._save();
      return true
    } else {
      return false;
    }
  }

  /**
   * @returns All saved wallets.
   */
  async getWallets (): Promise<Array<WalletDbEntryI>> {
    if (!this._file_data) {
      throw new Error('The file storage is not initialized!');
    }
    return structuredClone(this._file_data.wallets)
  }

  /**
   * Get a named wallet from the database
   * @param name A user defined name for the wallet.
   * @throws {Error} If the wallet could not be saved.
   * @returns The requested wallet.
   */
  async getWallet (name: string): Promise<WalletDbEntryI | undefined> {
    if (!this._file_data) {
      throw new Error('The file storage is not initialized!');
    }
    const entry = this._file_data.wallets.find((a) => a.name == name);
    if (!entry) {
      return undefined;
    }
    return structuredClone(entry);
  }

  /**
   * Update named wallet in the database
   * @param name A user defined name for the wallet, and the walletId.
   * @param walletId String used to reconstruct the wallet.
   * @throws {Error} If the wallet could not be saved.
   */
  async updateWallet (name: string, wallet: string): Promise<void> {
    if (!this._file_data) {
      throw new Error('The file storage is not initialized!');
    }
    const entry = this._file_data.wallets.find((a) => a.name == name);
    if (!entry) {
      throw new Error('Failed to update, Wallet does not exists: ' + name);
    }
    entry.wallet = wallet;
    await this._save();
  }

  /**
   * Check if wallet exists in the database
   * @param name A user defined name for the wallet, and the walletId.
   */
  async walletExists (name: string): Promise<boolean> {
    if (!this._file_data) {
      throw new Error('The file storage is not initialized!');
    }
    const entry = this._file_data.wallets.find((a) => a.name == name);
    return !!entry;
  }
}
