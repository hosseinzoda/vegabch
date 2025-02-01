import { Command, Flags, Interfaces, Config } from '@oclif/core';
import { TimeoutAndIntevalController, binToHex, convertToJSONSerializable } from './util.js';
import ElectrumClientManager from './main/electrum-client-manager.js';
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { serializeMessage, deserializeMessage } from './json-ipc-serializer.js';
import type mainModuleType from './main/index.js';
import type { ServiceDependency, Service } from './main/types.js';

let _mainModule: typeof mainModuleType | null = null;

export type Flags<T extends typeof Command> = Interfaces.InferredFlags<typeof VegaCommand['baseFlags'] & T['flags']>
export type Args<T extends typeof Command> = Interfaces.InferredArgs<T['args']>

export type VegaCommandOptions = {
  require_wallet_selection?: boolean;
  optional_wallet_selection?: boolean;
  disable_module?: boolean;
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

type RemoteClientParameters = {
  host: string;
  port: string;
  path: string;
  headers: { [name: string]: string };
};

export type VegaConfigType = 'standalone' | 'client' | 'daemon';

export type VegaStandaloneConfig = {
  type: 'standalone';
  vega_storage_file: string;
  main_electrum_node: string;
  cauldron_indexer_node: string;
};

export type VegaClientConfig = {
  type: 'client';
  rpc_endpoint: string;
  rpc_username?: string;
  rpc_password?: string;
};

export type VegaDaemonConfig = {
  type: 'daemon';
  rpc_host: string;
  rpc_port: number;
  rpcauth: string;
  vega_storage_file: string;
  main_electrum_node: string;
  cauldron_indexer_node: string;
};

export type VegaConfig = |
  VegaStandaloneConfig |
  VegaClientConfig |
  VegaDaemonConfig;

export default abstract class VegaCommand<T extends typeof Command> extends Command {
  // add the --json flag
  static enableJsonFlag = true
  static baseFlags = {
    config: Flags.string({
      name: 'config',
      required: true,
      description: `A path to the config file. Depending on the command the config can be for a client, daemon or standalone setup.`,
      env: 'VEGABCH_CONFIG',
      ignoreStdin: true,
    }),
  };
  static vega_options: VegaCommandOptions = {
    require_wallet_selection: false,
  };


  _timeout_and_interval_controller: TimeoutAndIntevalController;
  _selected_wallet_name: string | undefined;
  _remote_client_agent: http.Agent | undefined;
  _remote_client_params: RemoteClientParameters | undefined;
  _vega_storage_filename: string;
  _config_path: string | undefined;
  _config: VegaConfig | undefined;

  protected get ctor(): typeof VegaCommand {
    return this.constructor as typeof VegaCommand
  }

  hasSelectedWallet (): boolean {
    return !!this._selected_wallet_name;
  }
  getSelectedWalletName (): string {
    if (!this._selected_wallet_name) {
      throw new Error('To use wallet selection, vega_options.require_wallet_selection should be set to true');
    }
    return this._selected_wallet_name;
  }
  getConfigPath (): string {
    if (!this._config_path) {
      throw new Error('config_path is not defined');
    }
    return this._config_path;
  }
  getConfig (): VegaConfig {
    if (!this._config) {
      throw new Error('config is not defined');
    }
    return this._config;
  }

  protected flags!: Flags<T>
  protected args!: Args<T>
  constructor (argv: string[], config: Config) {
    super(argv, config);
    this._vega_storage_filename = '';
    this._timeout_and_interval_controller = new TimeoutAndIntevalController();
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

    this._config_path = flags.config;
    try {
      this._config = JSON.parse((await readFile(flags.config)).toString('utf8'));
      if (this._config == null) {
        throw new Error('config is null!')
      }
      switch (this._config.type) {
        case 'standalone':
        case 'daemon': {
          for (const name of [ 'vega_storage_file', 'main_electrum_node', 'cauldron_indexer_node' ]) {
            if (!(typeof (this._config as any)[name] == 'string' && (this._config as any)[name])) {
              throw new Error(`config.${name} should be a non-empty string`);
            }
          }
          this._vega_storage_filename = path.resolve(path.dirname(this._config_path), this._config.vega_storage_file);
          break;
        }
        case 'client': {
          for (const name of [ 'rpc_endpoint' ]) {
            if (!(typeof (this._config as any)[name] == 'string' && (this._config as any)[name])) {
              throw new Error(`config.${name} should be a non-empty string`);
            }
          }
          break;
        }
        default: {
          throw new Error('unknown type: ' + (this._config as any).type);
        }
      }
    } catch (err) {
      throw new Error('Failed to parse the config file, '  + (err as any)?.message);
    };

    if (!this.ctor.vega_options.disable_module) {
      if (this._config.type == 'client') {
        const url_params = new URL(this._config.rpc_endpoint);
        if (url_params.protocol != 'http:') {
          throw new Error('rpc-endpoint is expected to be an http url.');
        }

        const username = url_params.username || this._config.rpc_username || process.env.VEGABCH_RPC_USERNAME;
        const password = url_params.password || this._config.rpc_password || process.env.VEGABCH_RPC_PASSWORD;
        if (!username || !password) {
          throw new Error('Authorization to rpc_endpoint is not provided, VEGABCH_RPC_USERNAME & VEGABCH_RPC_PASSWORD environment variables.');
        }
        this._remote_client_params = {
          host: url_params.hostname,
          port: url_params.port,
          path: url_params.pathname + url_params.search,
          headers: {
            'Authorization': 'Basic ' + Buffer.from([username, password].join(':'), 'utf8').toString('base64'),
          },
        };
      } else if (this._config.type == 'standalone' || this._config.type == 'daemon') {
        const UTXOTracker = (await import('./main/utxo-tracker.js')).default;
        const VegaFileStorageProvider = (await import('./main/vega-file-storage-provider.js')).default;
        const mainModule = await import('./main/index.js');

        try { // init mainModule
          let main_node_info = null;
          {
            const url = new URL(this._config.main_electrum_node);
            if (['wss:','ws:'].indexOf(url.protocol) == -1 || isNaN(parseInt(url.port||'443'))) {
              throw new Error('Expecting main-electrum-node to be a valid websocket url, got: ' + this._config.main_electrum_node);
            }
            main_node_info = {
              host: url.hostname,
              port: parseInt(url.port||'443'),
              encrypted: url.protocol == 'wss:',
            };
          }
          let cauldron_indexer_node_info = null;
          {
            const url = new URL(this._config.cauldron_indexer_node);
            if (['wss:','ws:'].indexOf(url.protocol) == -1 || isNaN(parseInt(url.port||'443'))) {
              throw new Error('Expecting cauldron-indexer-node to be a valid websocket url, got: ' + this._config.cauldron_indexer_node);
            }
            cauldron_indexer_node_info = {
              host: url.hostname,
              port: parseInt(url.port||'443'),
              encrypted: url.protocol == 'wss:',
            };
          }
          // services
          mainModule.registerService('electrum_client_manager', {
            getDependencies (): ServiceDependency[] {
              return ElectrumClientManager.getDependencies();
            },
            create: () => {
              return new ElectrumClientManager('main', main_node_info.host, main_node_info.port, main_node_info.encrypted);
            },
          });
          mainModule.registerService('cauldron_client_manager', {
            getDependencies (): ServiceDependency[] {
              return ElectrumClientManager.getDependencies();
            },
            create: () => {
              return new ElectrumClientManager('cauldron-indexer', cauldron_indexer_node_info.host, cauldron_indexer_node_info.port, cauldron_indexer_node_info.encrypted);
            },
          });
          mainModule.registerService('utxo_tracker', {
            getDependencies (): ServiceDependency[] {
              return UTXOTracker.getDependencies();
            },
            create: () => {
              return new UTXOTracker();
            },
          });
          mainModule.registerService('vega_storage_provider', {
            create: () => {
              return new VegaFileStorageProvider(this._vega_storage_filename);
            },
          });
          mainModule.registerService('console', {
            create: () => {
              let console_service: any;
              if (this._config?.type == 'standalone') {
                console_service = {
                  info: () => null,
                  log: () => null,
                  debug: () => null,
                  warn: console.warn.bind(console),
                  error: console.error.bind(console),
                };
              } else {
                console_service = console;
              }
              return console_service;
            },
          });
          mainModule.registerService('config', {
            create: () => {
              return {
                path: this._config_path,
                data: this._config,
              } as Service;
            },
          });
          await mainModule.init();
          _mainModule = mainModule;
        } catch (err) {
          console.error(err);
          throw err;
        }
      }

      // define the selected wallet
      if (this.ctor.vega_options.require_wallet_selection || this.ctor.vega_options.optional_wallet_selection) {
        let wallet_name = flags['wallet'];
        if (!wallet_name) {
          wallet_name = await this.callModuleMethod('wallet.pinned_wallet');
        }
        if (!(this.ctor.vega_options.optional_wallet_selection && wallet_name == null)) {
          if (!wallet_name) {
            throw new Error('This command requires a wallet, To select a wallet either use wallet:pin to pin a wallet or use -w option to set the wallet name')
          }
          this._selected_wallet_name = wallet_name;
        }
      }
    }
  }
  protected async catch(err: Error & {exitCode?: number}): Promise<any> {
    // console.warn(err);
    return super.catch(err)
  }
  protected async finally(_: Error | undefined): Promise<any> {
    if (_mainModule != null) {
      await _mainModule.destroy();
    }
    this._timeout_and_interval_controller.clearAll();
    this._timeout_and_interval_controller.stop();

    return super.finally(_)
  }

  protected logJson (json: unknown): void {
    return super.logJson(convertToJSONSerializable(json));
  }

  async callModuleMethod (name: string, ...args: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        if (this._remote_client_params) {
          const req = http.request({
            agent: this._remote_client_agent,
            host: this._remote_client_params.host,
            port: this._remote_client_params.port,
            path: this._remote_client_params.path,
            method: 'POST',
            headers: {
              ...this._remote_client_params.headers,
              'Content-Type': 'application/json',
            },
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
                const [ error, result ]  = deserializeMessage(JSON.parse(Buffer.concat(chunks).toString('utf8')));
                if (error != null) {
                  reject(error);
                } else {
                  resolve(result);
                }
              } catch (err) {
                reject(new Error('Failed to parse the response body, content: ' + Buffer.concat(chunks).toString()));
              }
            });
          });
          req.on('error', (error) => {
            reject(error);
          });
          req.end(JSON.stringify(serializeMessage([ name, ...args ])));
        } else {
          if (_mainModule == null) {
            throw new Error('main module is not initialized!');
          }
          const method = _mainModule.getMethod(name);
          if (method == null) {
            throw new Error('method not found, name: ' + name);
          }
          method(...args).then(resolve, reject);
        }
      } catch (err) {
        reject(err);
      }
    });
  }
}
