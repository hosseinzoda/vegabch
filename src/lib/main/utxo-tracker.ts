import type ElectrumClientManager from './electrum-client-manager.js';
import type { ElectrumClient, ElectrumClientEvents, RPCNotification as ElectrumRPCNotification } from '@electrum-cash/network';
import { uint8ArrayEqual, UTXO } from '@cashlab/common';
import { assertSuccess, lockingBytecodeToCashAddress } from '@cashlab/common/libauth.js';
import { EventEmitter } from 'node:events';
import type { Service, Console, ServiceDependency } from './types.js';
import { deferredPromise, parseElectrumUTXO } from '../util.js';

type TimeoutId = ReturnType<typeof setTimeout>;
export type UTXOTrackerRefId = string;

export type UTXOTrackerLockingBytecodeEntry = {
  type: 'locking_bytecode';
  locking_bytecode: Uint8Array;
  cashaddr: string;
  pending_request: Promise<any> | null,
  data: UTXO[] | null,
  error: any;
  initialized: boolean;
  active_sub: boolean;
};

export type UTXOTrackerEntry = |
  UTXOTrackerLockingBytecodeEntry;

export default class UTXOTracker extends EventEmitter implements Service {
  _client_manager: ElectrumClientManager | undefined;
  _cashaddr_finalization_registry: FinalizationRegistry<any>;
  _cashaddr_entries_ref: Map<string, WeakRef<UTXOTrackerEntry>>;
  _cached_entries: Array<{ nouse_timeout_id: TimeoutId | null, value: UTXOTrackerEntry }>;
  _subscribed_cashaddrs: Set<string>;
  _console: Console;
  constructor () {
    super();
    this._console = null as any;
    this._cashaddr_entries_ref = new Map();
    this._cached_entries = [];
    this._subscribed_cashaddrs = new Set();
    this._cashaddr_finalization_registry = new FinalizationRegistry((cashaddr: string) => {
      if (this._client_manager != null) {
        const client = this._client_manager.getClient();
        if (client != null) {
          if (this._subscribed_cashaddrs.has(cashaddr)) {
            this._subscribed_cashaddrs.delete(cashaddr);
            client.unsubscribe('blockchain.address.subscribe', cashaddr);
          }
        }
      }
    });
  }
  static getDependencies (): ServiceDependency[] {
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
      const client = this._client_manager.getClient();
      if (client != null) {
        await Promise.all(Array.from(this._subscribed_cashaddrs).map((a) => client.unsubscribe('blockchain.address.subscribe', a)));
      }
    }
    for (const { nouse_timeout_id } of this._cached_entries) {
      if (nouse_timeout_id != null) {
        clearTimeout(nouse_timeout_id);
      }
    }
    for (const [ cashaddr, ref ] of this._cashaddr_entries_ref.entries()) {
      const entry = ref.deref()
      if (entry != null) {
        this._cashaddr_finalization_registry.unregister(entry);
      }
    }
    this._cashaddr_entries_ref = new Map();
    this._subscribed_cashaddrs = new Set();
    this._cached_entries = [];
  }
  onConnected (): void {
    if (this._client_manager == null) {
      throw new Error('client manager is not defined!');
    }
    const client = this._client_manager.getClient();
    if (client == null) {
      throw new Error('onConnected, client should not be null!');
    }
    for (const [ cashaddr, ref ] of this._cashaddr_entries_ref.entries()) {
      const entry = ref.deref();
      if (entry != null) {
        this.initEntry(client, entry);
      } else {
        this._cashaddr_entries_ref.delete(cashaddr);
      }
    }
  }
  onDisconnected (): void {
    if (this._client_manager == null) {
      throw new Error('client manager is not defined!');
    }
    for (const [ cashaddr, ref ] of this._cashaddr_entries_ref.entries()) {
      const entry = ref.deref();
      if (entry != null) {
        entry.initialized = false;
        entry.active_sub = false;
        entry.pending_request = null;
        entry.data = null
      } else {
        this._cashaddr_entries_ref.delete(cashaddr);
      }
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
        if (message.params == null || typeof message.params[0] != 'string') {
          return;
        }
        const cashaddr: string = message.params[0];
        const entry_ref = this._cashaddr_entries_ref.get(cashaddr);
        if (entry_ref != null) {
          const entry = entry_ref.deref();
          if (entry != null && entry.initialized) {
            this.reloadEntryData(client, entry);
          }
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
  async addTrackerByLockingBytecode (locking_bytecode: Uint8Array): Promise<UTXOTrackerEntry> {
    if (this._client_manager == null) {
      throw new Error('client manager is not defined!');
    }
    // TODO:: set network_prefix based on the network
    // network == 'mainnet'
    const network_prefix = 'bitcoincash';
    const cashaddr = assertSuccess(lockingBytecodeToCashAddress({
      bytecode: locking_bytecode,
      prefix: network_prefix,
      tokenSupport: false,
    })).address;
    let entry = this.getTrackerEntryByCashAddr(cashaddr);
    if (entry != null) {
      return entry;
    }
    entry = {
      type: 'locking_bytecode',
      locking_bytecode,
      cashaddr,
      pending_request: null,
      data: null,
      error: null,
      initialized: false,
      active_sub: false,
    };
    this._cashaddr_entries_ref.set(cashaddr, new WeakRef(entry));
    this._cashaddr_finalization_registry.register(entry, cashaddr);
    const client = this._client_manager.getClient();
    if (client != null) {
      await this.initEntry(client, entry);
    }
    return entry;
  }
  getTrackerEntryByCashAddr (cashaddr: string): UTXOTrackerEntry | undefined {
    const ref = this._cashaddr_entries_ref.get(cashaddr);
    return ref != null ? ref.deref() : undefined;
  }
  async getEntryUTXOList (entry: UTXOTrackerEntry): Promise<UTXO[]> {
    if (this._client_manager == null) {
      throw new Error('client manager is not defined!');
    }
    const matched_ref_value = this._cashaddr_entries_ref.get(entry.cashaddr)
    if (!matched_ref_value || matched_ref_value.deref() != entry) {
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
    const cached_entry = this._cached_entries.find((a) => a.value == entry);
    if (cached_entry != null) {
      if (cached_entry.nouse_timeout_id != null) {
        clearTimeout(cached_entry.nouse_timeout_id);
      }
      const NOUSE_TIMEOUT_DURATION = 10 * 60 * 1000
      cached_entry.nouse_timeout_id = setTimeout(() => {
        const cached_entry_idx = this._cached_entries.findIndex((a) => a.value == entry);
        if (cached_entry_idx != -1) {
          this._cached_entries.splice(cached_entry_idx, 1);
        }
      }, NOUSE_TIMEOUT_DURATION);
    }
  }
  async getUTXOListForLockingBytecode (locking_bytecode: Uint8Array): Promise<UTXO[]> {
    const entry = await this.addTrackerByLockingBytecode(locking_bytecode);
    const idx = this._cached_entries.findIndex((a) => a.value == entry);
    if (idx == -1) {
      this._cached_entries.push({ nouse_timeout_id: null, value: entry });
    }
    return await this.getEntryUTXOList(entry);
  }
}


