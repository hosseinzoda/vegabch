import type ElectrumClientManager from './electrum-client-manager.js';
import type { ElectrumClient, ElectrumClientEvents, RPCNotification as ElectrumRPCNotification } from '@electrum-cash/network';
import { libauth, common as cashlab_common, UTXO } from 'cashlab';
const { uint8ArrayEqual } = cashlab_common;
const { assertSuccess, lockingBytecodeToCashAddress } = libauth;
import { EventEmitter } from 'node:events';
import type { Service, Console, ModuleDependency } from './types.js';
import { deferredPromise, parseElectrumUTXO } from '../util.js';

type TimeoutId = ReturnType<typeof setTimeout>;

export type UTXOTrackerLockingBytecodeEntry = {
  type: 'locking_bytecode';
  locking_bytecode: Uint8Array;
  cashaddr: string;
  pending_request: Promise<any> | null,
  data: UTXO[] | null,
  error: any;
  initialized: boolean;
  active_sub: boolean;
  nouse_auto_remove: boolean;
  nouse_timeout_duration?: number;
  nouse_timeout_id?: TimeoutId;
};

export type UTXOTrackerEntry = |
  UTXOTrackerLockingBytecodeEntry;

export default class UTXOTracker extends EventEmitter implements Service {
  _client_manager: ElectrumClientManager | undefined;
  _entries: UTXOTrackerEntry[];
  _console: Console;
  constructor () {
    super();
    this._console = null as any;
    this._entries = [];
  }
  getDependencies (): ModuleDependency[] {
    return [
      { name: 'electrum_client_manager' },
      { name: 'console' },
    ];
  }
  async init ({ electrum_client_manager, console }: { electrum_client_manager: ElectrumClientManager, console: Console }) {
    this._console = console;
    this._client_manager = electrum_client_manager;
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
      entry.initialized = false;
      entry.active_sub = false;
      entry.pending_request = null;
      entry.data = null
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
      case 'blockchain.address.subscribe': {
        if (message.params == null) {
          return;
        }
        const cashaddr = message.params[0];
        const entry = this._entries.find((a) => a.type == 'locking_bytecode' && a.cashaddr && a.cashaddr == cashaddr);
        if (entry != null && entry.initialized) {
          this.reloadEntryData(client, entry);
        }
        break;
      }
    }
  }
  async initEntry (client: ElectrumClient<ElectrumClientEvents>, entry: UTXOTrackerEntry) {
    if (entry.type != 'locking_bytecode') {
      throw new Error('Unknown entry type=locking_bytecode');
    }
    const { promise: pending_promise, resolve } = await deferredPromise<void>();
    entry.error = null;
    entry.pending_request = pending_promise;
    (async () => {
      try {
        await client.subscribe('blockchain.address.subscribe', entry.cashaddr)
        entry.active_sub = true;
        if (entry.pending_request != pending_promise) {
          await entry.pending_request;
          return; // exit
        }
        const result = await client.request('blockchain.address.listunspent', entry.cashaddr, 'include_tokens');
        if (entry.pending_request != pending_promise) {
          return; // exit
        }
        if (!Array.isArray(result)) {
          throw new Error('Expecting response of blockchain.address.listunspent to be an array');
        }
        entry.initialized = true;
        for (const item of result) {
          item.locking_bytecode = entry.locking_bytecode;
        }
        entry.data = result.map(parseElectrumUTXO);
        this.emit('update', entry);
      } catch (err) {
        if (entry.pending_request != pending_promise) {
          await entry.pending_request;
          return; // exit
        }
        entry.error = err;
        entry.data = null;
      } finally {
        entry.pending_request = null;
        resolve();
      }
    })();
    await pending_promise;
  }
  async reloadEntryData (client: ElectrumClient<ElectrumClientEvents>, entry: UTXOTrackerEntry) {
    if (entry.type != 'locking_bytecode') {
      throw new Error('Unknown entry type=locking_bytecode');
    }
    const { promise: pending_promise, resolve } = await deferredPromise<void>();
    entry.error = null;
    entry.pending_request = pending_promise;
    ;(async () => {
      try {
        const result = await client.request('blockchain.address.listunspent', entry.cashaddr, 'include_tokens');
        if (entry.pending_request != pending_promise) {
          await entry.pending_request;
          return; // exit
        }
        if (!Array.isArray(result)) {
          throw new Error('Expecting response of blockchain.address.listunspent to be an array');
        }
        for (const item of result) {
          item.locking_bytecode = entry.locking_bytecode;
        }
        entry.data = result.map(parseElectrumUTXO);
        this.emit('update', entry);
      } catch (err) {
        if (entry.pending_request != pending_promise) {
          await entry.pending_request;
          return; // exit
        }
        entry.error = err;
        entry.data = null;
      } finally {
        entry.pending_request = null;
        resolve();
      }
    })();
    return await pending_promise;
  }
  async removeEntry (entry: UTXOTrackerEntry): Promise<void> {
    if (this._client_manager == null) {
      throw new Error('client manager is not defined!');
    }
    const idx = this._entries.indexOf(entry);
    if (idx == -1) {
      throw new Error('The entry is not registered');
    }
    this._entries.splice(idx, 1);
    if (entry.type != 'locking_bytecode') {
      throw new Error('Unknown entry type=locking_bytecode');
    }
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
            await client.unsubscribe('blockchain.address.subscribe', entry.cashaddr);
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
  async addTrackerByLockingBytecode (locking_bytecode: Uint8Array): Promise<UTXOTrackerEntry> {
    if (this._client_manager == null) {
      throw new Error('client manager is not defined!');
    }
    let entry = this.getTrackerEntryByLockingBytecode(locking_bytecode);
    if (entry != null) {
      return entry;
    }
    // TODO:: set network_prefix based on the network
    // network == 'mainnet'
    const network_prefix = 'bitcoincash';
    const cashaddr = assertSuccess(lockingBytecodeToCashAddress({
      bytecode: locking_bytecode,
      prefix: network_prefix,
      tokenSupport: false,
    })).address;
    entry = {
      type: 'locking_bytecode',
      locking_bytecode,
      cashaddr,
      pending_request: null,
      data: null,
      error: null,
      initialized: false,
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
  getTrackerEntryByLockingBytecode (locking_bytecode: Uint8Array): UTXOTrackerEntry | undefined {
    return this._entries.find((a) => a.type == 'locking_bytecode' && uint8ArrayEqual(a.locking_bytecode, locking_bytecode));
  }
  getTrackerEntries (): UTXOTrackerEntry[] {
    return this._entries;
  }
  async getEntryUTXOList (entry: UTXOTrackerEntry): Promise<UTXO[]> {
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
        if (entry.initialized) {
          await this.reloadEntryData(client, entry);
        } else {
          await this.initEntry(client, entry);
        }
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
  onEntryUsed (entry: UTXOTrackerEntry): void {
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
  async getUTXOListForLockingBytecode (locking_bytecode: Uint8Array): Promise<UTXO[]> {
    let entry = this.getTrackerEntryByLockingBytecode(locking_bytecode);
    if (entry == null) {
      entry = await this.addTrackerByLockingBytecode(locking_bytecode);
      entry.nouse_auto_remove = true;
    }
    return await this.getEntryUTXOList(entry);
  }
}
