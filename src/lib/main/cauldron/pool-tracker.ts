import type ElectrumClientManager from '../electrum-client-manager.js';
import type { ElectrumClient, ElectrumClientEvents, RPCNotification as ElectrumRPCNotification } from '@electrum-cash/network';
import { common as cashlab_common, cauldron, TokenId } from 'cashlab';
import { PoolV0 } from 'cashlab/build/cauldron/types.js';
const { uint8ArrayEqual } = cashlab_common;
import { parsePoolFromRostrumNodeData, deferredPromise } from '../../util.js';
import { EventEmitter } from 'events';
import type { ModuleDependency, Console } from '../types.js';

type TimeoutId = ReturnType<typeof setTimeout>;

export type PoolTrackerEntry = {
  token_id: TokenId;
  data: PoolV0[] | null;
  pending_request: Promise<any> | null;
  error: any;
  active_sub: boolean;
  nouse_auto_remove: boolean;
  nouse_timeout_duration?: number;
  nouse_timeout_id?: TimeoutId;
};

export type RostrumCauldronContractSubscribeEvent = {
  type: string,
  utxos: Array<{
    is_withdrawn: boolean,
    new_utxo_hash: string,
    new_utxo_n: number,
    new_utxo_txid: string,
    pkh: string;
    sats: number,
    spent_utxo_hash: string;
    token_amount: number,
    token_id: string;
  }>;
};

export default class PoolTracker extends EventEmitter {
  _client_manager: ElectrumClientManager | undefined;
  _entries: PoolTrackerEntry[];
  _pool_hashmap: Map<string, { pool: PoolV0, entry: PoolTrackerEntry }>;
  _exlab: cauldron.ExchangeLab;
  _console: Console;
  constructor (exlab: cauldron.ExchangeLab) {
    super();
    this._console = null as any;
    this._exlab = exlab;
    this._entries = [];
    this._pool_hashmap = new Map();
  }
  getDependencies (): ModuleDependency[] {
    return [
      { name: 'cauldron_client_manager' },
      { name: 'console' },
    ];
  }
  async init ({ cauldron_client_manager, console }: { cauldron_client_manager: ElectrumClientManager, console: Console }) {
    this._console = console;
    this._client_manager = cauldron_client_manager;
    (this as any)._onConnected = this.onConnected.bind(this);
    (this as any)._onDisconnected = this.onDisconnected.bind(this);
    (this as any)._onElectrumNotification = this.onElectrumNotification.bind(this);
    this._client_manager.addListener('connected', (this as any)._onConnected);
    this._client_manager.addListener('disconnected', (this as any)._onDisconnected);
    this._client_manager.addListener('notification', (this as any)._onElectrumNotification);
  }
  async destroy () {
    if (this._client_manager != null) {
      this._client_manager.removeListener('connected', (this as any)._onConnected);
      this._client_manager.removeListener('disconnected', (this as any)._onDisconnected);
      this._client_manager.removeListener('notification', (this as any)._onElectrumNotification);
    }
    await Promise.all(this._entries.map((entry) => this.removeEntry(entry)));
    this._pool_hashmap = new Map();
  }
  onConnected (): void {
    if (this._client_manager == null) {
      throw new Error('client manager is not defined!');
    }
    const client = this._client_manager.getClient();
    if (client == null) {
      throw new Error('onConnected, client should not be null!');
    }
    for (const entry of this._entries) {
      this.initEntry(client, entry);
    }
  }
  onDisconnected (): void {
    if (this._client_manager == null) {
      throw new Error('client manager is not defined!');
    }
    for (const entry of this._entries) {
      entry.active_sub = false;
      entry.pending_request = null;
    }
  }
  onElectrumNotification (message: ElectrumRPCNotification): void {
    if (this._client_manager == null) {
      throw new Error('client manager is not defined!');
    }
    const client = this._client_manager.getClient();
    if (client == null) {
      throw new Error('client is null!!');
    }
    switch (message.method) {
      case 'cauldron.contract.subscribe': {
        if (message.params != null && message.params[0] == 2 && message.params[1]) {
          const entry = this.getTokenTrackerEntry(message.params[1] as string);
          if (entry == null) {
            return; // ignore
          }
          const event: RostrumCauldronContractSubscribeEvent = message.params[2] as any;
          if (event.type == 'initial') {
            const pools: PoolV0[] = []
            for (const utxo of event.utxos) {
              const pool = parsePoolFromRostrumNodeData(this._exlab, utxo);
              if (pool != null) {
                this._pool_hashmap.set(utxo.new_utxo_hash, { pool, entry });
                pools.push(pool);
              }
            }
            entry.data = pools;
            this.emit('init-pools', entry.token_id, pools);
            this.emit('update', entry.token_id);
          } else {
            this._console.warn('Unknown event type from (1) cauldron.contract.subscribe: ', event)
          }
        } else if (message.params != null && (message.params as any).type != null) {
          const event: RostrumCauldronContractSubscribeEvent = message.params as any;
          if (event.type == 'update') {
            const updated_token_id_set: Set<string> = new Set();;
            let cached_entry: PoolTrackerEntry | null = null;
            for (const utxo of event.utxos) {
              if (utxo.token_id != null) {
                let entry;
                if (cached_entry && cached_entry.token_id == utxo.token_id) {
                  entry = cached_entry;
                } else {
                  entry = this._entries.find((a) => a.token_id == utxo.token_id);
                  if (entry == null) {
                    continue; // ignore
                  }
                  cached_entry = entry;
                }
                if (this._pool_hashmap.has(utxo.new_utxo_hash)) {
                  continue; // already processed
                }
                const pool = parsePoolFromRostrumNodeData(this._exlab, utxo);
                if (pool == null) {
                  throw new Error('Failed to parse a pool: ' + JSON.stringify(utxo, null, '  '));
                }
                const existing_pool_ref = this._pool_hashmap.get(utxo.spent_utxo_hash);
                if (existing_pool_ref) {
                  // update
                  const existing_pool = existing_pool_ref.pool;
                  existing_pool.outpoint = pool.outpoint;
                  existing_pool.output = pool.output;
                  this._pool_hashmap.set(utxo.new_utxo_hash, { pool: existing_pool, entry });
                } else {
                  // add
                  if (entry.data == null) {
                    throw new Error('entry.data is null!');
                  }
                  entry.data.push(pool);
                  this._pool_hashmap.set(utxo.new_utxo_hash, { pool, entry });
                }
                this._pool_hashmap.delete(utxo.spent_utxo_hash);
                updated_token_id_set.add(entry.token_id);
              } else {
                // delete
                const pool_ref = this._pool_hashmap.get(utxo.spent_utxo_hash);
                if (pool_ref != null) {
                  // delete
                  const { entry, pool } = pool_ref;
                  if (entry.data == null) {
                    throw new Error('entry.data is null!');
                  }
                  const idx = entry.data.indexOf(pool);
                  if (idx != -1) {
                    entry.data.splice(idx, 1);
                  }
                  this._pool_hashmap.delete(utxo.spent_utxo_hash);
                  updated_token_id_set.add(entry.token_id);
                }
              }
            }
            for (const token_id of updated_token_id_set) {
              this.emit('update', token_id);
            }
          } else {
            console.info('Unknown event type from (2) cauldron.contract.subscribe: ', event)
          }
        } else {
          console.info('Unexpected data from cauldron.contract.subscribe: ', message);
        }
        break;
      }
    }
  }
  async initEntry (client: ElectrumClient<ElectrumClientEvents>, entry: PoolTrackerEntry): Promise<void> {
    const { promise: pending_promise, resolve } = await deferredPromise<void>();
    entry.error = null;
    entry.pending_request = pending_promise;
    ;(async () => {
      const onResolve = () => {
        entry.pending_request = null;
        resolve();
      };
      try {
        const clear = () => {
          this.removeListener('init-pools', onInitPools);
          this.removeListener('disconnected', onDisconnected);
        };
        const onInitPools = (token_id: TokenId) => {
          if (entry.token_id == token_id) {
            clear();
            entry.active_sub = true;
            onResolve();
          }
        };
        const onDisconnected = () => {
          clear();
          onResolve();
        };
        this.addListener('init-pools', onInitPools);
        this.addListener('disconnected', onDisconnected);
        await client.subscribe('cauldron.contract.subscribe', 2, entry.token_id);
      } catch (err) {
        if (entry.pending_request != pending_promise) {
          await entry.pending_request;
          onResolve();
          return; // exit
        }
        entry.error = err;
        entry.data = null;
        onResolve();
      }
    })();
    await pending_promise;
  }
  async removeEntry (entry: PoolTrackerEntry): Promise<void> {
    const idx = this._entries.indexOf(entry);
    if (idx == -1) {
      throw new Error('The entry is not registered');
    }
    this._entries.splice(idx, 1);
    for (const [ utxo_hash, pool_ref ] of this._pool_hashmap.entries()) {
      if (pool_ref.entry == entry) {
        this._pool_hashmap.delete(utxo_hash);
      }
    }
    entry.data = null;
    let pending_promise;
    if (this._client_manager != null) {
      const client = this._client_manager.getClient();
      if (client != null) {
        try {
          await entry.pending_request;
        } catch (err) {
          // pass
        }
        const pending_promise = entry.pending_request = (async () => {
          try {
            await client.unsubscribe('cauldron.contract.subscribe', 2, entry.token_id);
          } catch (err) {
            this._console.warn('unsubscribe blockchain.address failed, ', err);
          } finally {
            entry.pending_request = null;
          }
        })();
        await pending_promise;
      }
    }
  }
  async addTokenTracker (token_id: TokenId): Promise<PoolTrackerEntry> {
    if (this._client_manager == null) {
      throw new Error('client manager is not defined!');
    }
    let entry = this.getTokenTrackerEntry(token_id);
    if (entry != null) {
      return entry;
    }
    entry = {
      token_id,
      data: null,
      pending_request: null,
      error: null,
      active_sub: false,
      nouse_auto_remove: false,
    };
    this._entries.push(entry);
    const client = this._client_manager.getClient();
    if (client != null) {
      await this.initEntry(client, entry);
    }
    return entry;
  }
  getTokenTrackerEntry (token_id: string): PoolTrackerEntry | undefined {
    return this._entries.find((a) => a.token_id == token_id);
  }
  getTrackerEntries (): PoolTrackerEntry[] {
    return this._entries;
  }
  async getEntryPools (entry: PoolTrackerEntry): Promise<PoolV0[]> {
    if (this._client_manager == null) {
      throw new Error('client manager is not defined!');
    }
    if (this._entries.indexOf(entry) == -1) {
      throw new Error('The entry is not registered');
    }
    if (entry.pending_request != null) {
      await entry.pending_request;
    }
    if (entry.data == null) {
      const client = this._client_manager.getClient();
      if (client != null) {
        this.onEntryUsed(entry);
        if (entry.active_sub) {
          throw new Error('entry.active_sub is true while entry.data is null');
        }
        await this.initEntry(client, entry);
        if (entry.error != null) {
          throw entry.error;
        }
        if (entry.data == null) {
          throw new Error('entry.data should not be null!!');
        }
        return entry.data;
      } else {
        throw new Error(entry.error || 'Unknown error!');
      }
    } else {
      this.onEntryUsed(entry);
      return entry.data;
    }
  }
  onEntryUsed (entry: PoolTrackerEntry): void {
    if (entry.nouse_auto_remove) {
      if (entry.nouse_timeout_id != null) {
        clearTimeout(entry.nouse_timeout_id);
      }
      entry.nouse_timeout_duration = 10 * 60 * 1000;
      entry.nouse_timeout_id = setTimeout(() => {
        this.removeEntry(entry);
      }, entry.nouse_timeout_duration);
    }
  }
  async getTokenPools (token_id: TokenId): Promise<PoolV0[]> {
    let entry = this.getTokenTrackerEntry(token_id);
    if (entry == null) {
      entry = await this.addTokenTracker(token_id);
      entry.nouse_auto_remove = true;
    }
    return await this.getEntryPools(entry);
  }
}
