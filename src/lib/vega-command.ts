import { Command, Flags, Interfaces, Config } from '@oclif/core';
import type {
  Wallet, Network, NetworkProvider, WalletTypeEnum,
  getNetworkProvider as getNetworkProviderFunction, BaseWallet as BaseWalletClass,
  disconnectProviders as disconnectProvidersFunction,
} from 'mainnet-js';
import VegaFileStorageProvider, { TokensIdentity } from './vega-file-storage-provider.js';
import { getWalletClassByTypeAndNetwork, TimeoutAndIntevalController } from './util.js';
import DummyNetworkProvide from './dummy-network-provider.js';
import type {
  setHandlerForGetNetworkProvider as setHandlerForGetNetworkProviderFunction
} from './vega-wallets.js';

let setHandlerForGetNetworkProvider: typeof setHandlerForGetNetworkProviderFunction;
const requireVegaWallets = async () => {
  if (setHandlerForGetNetworkProvider == null) {
    ({ setHandlerForGetNetworkProvider } = await import('./vega-wallets.js'));
  }
};

let getNetworkProvider: typeof getNetworkProviderFunction, BaseWallet: typeof BaseWalletClass, disconnectProviders: typeof disconnectProvidersFunction;
const requireMainnet = async () => {
  if (getNetworkProvider == null) {
    ({ getNetworkProvider, BaseWallet, disconnectProviders } = await import('mainnet-js'));
    BaseWallet.StorageProvider = VegaFileStorageProvider;
  }
};

export type Flags<T extends typeof Command> = Interfaces.InferredFlags<typeof VegaCommand['baseFlags'] & T['flags']>
export type Args<T extends typeof Command> = Interfaces.InferredArgs<T['args']>

export type VegaCommandOptions = {
  require_mainnet?: boolean;
  require_wallet_selection?: boolean;
  require_network_provider?: boolean;
};

export const selectWalletFlags = (): { [name: string]: any } => {
  return {
    wallet: Flags.string({
      char: 'w',
      summary: 'Select a wallet.',
      description: 'The name of wallet to use when it performs the command.',
      env: 'WALLET',
      default: undefined,
      defaultHelp: 'By default the pinned wallet will be used.',
      required: false,
      helpValue: '<wallet_name>',
    }),
  };
}

export default abstract class VegaCommand<T extends typeof Command> extends Command {
  _timeout_and_interval_controller: TimeoutAndIntevalController;
  _network_provider_fetched: boolean;
  // add the --json flag
  static enableJsonFlag = true
  static baseFlags = {
    'vega-storage-file': Flags.string({
      char: 'c',
      description: 'path to storage wallet file, VEGA_STORAGE_FILE environment variable can be used to set the flag.',
      env: 'VEGA_STORAGE_FILE',
      default: 'vega-storage.json',
      defaultHelp: 'vega-storage.json at the working directory',
      required: false,
    }),
  };
  
  static vega_options: VegaCommandOptions = {
    require_wallet_selection: false,
    require_network_provider: false,
  };


  protected get ctor(): typeof VegaCommand {
    return this.constructor as typeof VegaCommand
  }

  _selected_wallet: Wallet | undefined;

  async getPinnedWalletName (): Promise<string | undefined> {
    let db = new VegaFileStorageProvider(this._vega_storage_filename);
    await db.init();
    const pinned_wallet_name: string | undefined = await db.getPinnedWalletName();
    await db.close();
    return pinned_wallet_name;
  }
  async pinWallet (name: string | undefined): Promise<void> {
    const db = new VegaFileStorageProvider(this._vega_storage_filename);
    await db.init();
    await db.pinWallet(name);
    await db.close();
  }
  async getTokensIdentity (): Promise<TokensIdentity> {
    let db = new VegaFileStorageProvider(this._vega_storage_filename);
    await db.init();
    const tokens_identity = db.getTokensIdentity();
    await db.close();
    return tokens_identity;
  }
  async storeTokensIdentity (tokens_identity: TokensIdentity): Promise<void> {
    let db = new VegaFileStorageProvider(this._vega_storage_filename);
    await db.init();
    db.setTokensIdentity(tokens_identity);
    await db.close();
  }
  
  getSelectedWallet (): Wallet {
    if (!this._selected_wallet) {
      throw new Error('To use wallet selection, vega_options.require_wallet_selection should be set to true');
    }
    return this._selected_wallet;
  }

  protected flags!: Flags<T>
  protected args!: Args<T>
  _vega_storage_filename: string;
  constructor (argv: string[], config: Config) {
    super(argv, config);
    this._vega_storage_filename = '';
    this._timeout_and_interval_controller = new TimeoutAndIntevalController();
    this._network_provider_fetched = false;
  }
  
  protected async init (): Promise<void> {
    await super.init()
    this._timeout_and_interval_controller.start();
    const { args, flags } = await this.parse({
      flags: this.ctor.flags,
      baseFlags: (super.ctor as typeof VegaCommand).baseFlags,
      enableJsonFlag: this.ctor.enableJsonFlag,
      args: this.ctor.args,
      strict: this.ctor.strict,
    });
    this.flags = flags as Flags<T>
    this.args = args as Args<T>
    this._vega_storage_filename = flags['vega-storage-file'];
    const require_mainnet = this.ctor.vega_options.require_mainnet ||
      this.ctor.vega_options.require_network_provider ||
      this.ctor.vega_options.require_wallet_selection;
    if (require_mainnet) {
      await requireMainnet();
      await requireVegaWallets()
      if (this.ctor.vega_options.require_network_provider) {
        setHandlerForGetNetworkProvider(getNetworkProvider as any);
      } else {
        setHandlerForGetNetworkProvider((network: Network): NetworkProvider => new DummyNetworkProvide(network));
      }
    }
    if (this.ctor.vega_options.require_wallet_selection) {
      let wallet_name = flags['wallet'];
      if (!wallet_name) {
        wallet_name = await this.getPinnedWalletName()
      }
      if (!wallet_name) {
        throw new Error('This command requires a wallet, To select a wallet either use wallet:pin to pin a wallet or use -w option to set the wallet name')
      }
      this._selected_wallet = await this.getWallet(wallet_name);
      if (!this._selected_wallet) {
        throw new Error('Selected wallet does not exists, name: ' + wallet_name);
      }
    }
  }
  protected async catch(err: Error & {exitCode?: number}): Promise<any> {
    return super.catch(err)
  }
  protected async finally(_: Error | undefined): Promise<any> {
    if (this.ctor.vega_options.require_network_provider || this._network_provider_fetched) {
      await requireMainnet();
      await disconnectProviders()
    }
    this._timeout_and_interval_controller.clearAll();
    this._timeout_and_interval_controller.stop();

    return super.finally(_)
  }

  protected logJson (json: unknown): void {
    const prepareJson = (v: any): any => {
      if (typeof v == 'bigint') {
        return v+'';
      }
      if (v instanceof Error) {
        v = {
          message: v.message, name: v.name,
          ...Object.fromEntries(['code'].filter((a) => v[a] != null).map((a) => [ a, v[a] ])),
        };
      } else if (Array.isArray(v)) {
        v = Array.from(v).map(prepareJson);
      } else if (v && typeof v == 'object') {
        v = Object.fromEntries(
          Object.entries(v)
            .map((a) => [ a[0], prepareJson(a[1]) ])
        )
      }
      return v;
    }
    return super.logJson(prepareJson(json));
  }

  async requireNetworkProvider (network: Network): Promise<NetworkProvider> {
    await requireMainnet();
    this._network_provider_fetched = true;
    return getNetworkProvider(network)
  }
  async getNetworkProvider (network: Network): Promise<NetworkProvider> {
    if (!this.ctor.vega_options.require_network_provider) {
      throw new Error('getNetworkProvider called, should have require_network_provider option enabled');
    }
    this._network_provider_fetched = true;
    return getNetworkProvider(network)
  }
  async saveWallet (name: string, wallet_data: string): Promise<Wallet|any> {
    if (!this._vega_storage_filename && name) {
      throw new Error('VegaCommand is not initialized!');
    }
    let [ wallet_type, network ]: Array<string | undefined> = wallet_data.split(":");
    const wallet_class = await getWalletClassByTypeAndNetwork(wallet_type||'', network||'');
    return await wallet_class.replaceNamed(name, wallet_data, this._vega_storage_filename);
  }
  async getWallet (name: string): Promise<Wallet> {
    if (!this._vega_storage_filename) {
      throw new Error('VegaCommand is not initialized!');
    }
    const wallet_data = await this.getWalletData(name);
    if (wallet_data == null) {
      throw new Error("Wallet not found, name: " + name);
    }
    let [ wallet_type, network ]: Array<string | undefined> = wallet_data.split(":");
    const wallet_class: typeof Wallet = await getWalletClassByTypeAndNetwork(wallet_type||'', network||'');
    return await wallet_class.fromId(wallet_data);
  }
  async walletExists (name: string): Promise<boolean> {
    if (!this._vega_storage_filename) {
      throw new Error('VegaCommand is not initialized!');
    }
    return (await this.getWalletData(name)) != null;
  }
  async generateWallet (wallet_type: WalletTypeEnum, network: Network): Promise<Wallet> {
    const wallet_class: typeof Wallet = await getWalletClassByTypeAndNetwork(wallet_type||'', network||'');
    const wallet = new wallet_class();
    wallet.walletType = wallet_type;
    // ignore protected member warning
    return await (wallet as any).generate();
  }
  async getWalletData (name: string): Promise<string | undefined> {
    if (name.length === 0) {
      throw new Error("Named vega must have a non-empty name");
    }
    const db = new VegaFileStorageProvider(this._vega_storage_filename);
    await db.init();
    const wallet_record = await db.getWallet(name);
    await db.close();
    return wallet_record?.wallet;
  }
  async getWalletsInfo (): Promise<Array<{ name: string, type: WalletTypeEnum, network: Network }>> {
    const db = new VegaFileStorageProvider(this._vega_storage_filename);
    await db.init();
    const records = await db.getWallets();
    await db.close();
    return records.map((entry) => {
      let [ wallet_type, network ]: Array<string | undefined> = entry.wallet.split(":");
      return { name: entry.name, type: (wallet_type || '') as WalletTypeEnum, network: (network || '') as Network };
    })
  }

}
