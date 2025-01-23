import { ElectrumClient, ElectrumClientEvents, RPCNotification as ElectrumRPCNotification } from '@electrum-cash/network';
import { ElectrumWebSocket } from '@electrum-cash/web-socket';
import EventEmitter from 'node:events';
import type { Service, ModuleDependency, Console } from './types.js';

export default class ElectrumClientManager extends EventEmitter implements Service {
  _name: string;
  _host: string;
  _port: number;
  _encrypted: boolean;
  _client: ElectrumClient<ElectrumClientEvents> | null;
  _client_initializing: boolean;
  _client_successful_last_connect_attempt: boolean;
  _console: Console;
  constructor (name: string, host: string, port: number, encrypted: boolean) {
    super()
    this._console = null as any;
    this._name = name;
    this._host = host;
    this._port = port;
    this._encrypted = encrypted;
    this._client = null;
    this._client_initializing = false;
    this._client_successful_last_connect_attempt = false;
  }
  isConnected (): boolean {
    return !!this._client;
  }
  getClient (): ElectrumClient<ElectrumClientEvents> | null {
    return this._client;
  }
  getDependencies (): ModuleDependency[] {
    return [
      { name: 'console' },
    ];
  }
  async init ({ console }: { console: Console }) {
    this._console = console;
    const onClientConnected = async () => {
      try {
        this.emit('connected');
      } catch (err) {
        console.log(`error thrown on connected event, `, err);
      }
    };
    const onClientDisconnected = async () => {
      try {
        this.emit('disconnected');
      } catch (err) {
        console.log(`error thrown on disconnected event, `, err);
      }
    };
    const onClientNotification = (message: ElectrumRPCNotification): void => {
      try {
        this.emit('notification', message);
      } catch (err) {
        console.log(`error thrown on notification event, `, err);
      }
    };
    const initClient = async () => {
      if (this._client_initializing) {
        return;
      }
      const onReconnect = () => {
        if (this._client_successful_last_connect_attempt) {
          this._client_successful_last_connect_attempt = false;
          this._console.log(`Reconnect ${this._name} node immediately.`);
          initClient();
        } else {
          const RECONNECT_DELAY = 30;
          this._console.log(`Will try to connect ${this._name} node in: ${RECONNECT_DELAY} seconds`);
          setTimeout(() => {
            initClient();
          }, RECONNECT_DELAY * 1000);
        }
      };
      const cleanup = () => {
        if (this._client != null) {
			    this._client.removeListener('disconnected', onDisconnected);
          this._client = null;
        }
      };
      const onDisconnected = () => {
        cleanup();
        onClientDisconnected();
        this._console.log(`Disconnected from ${this._name} node.`);
        onReconnect();
      };
      try {
        this._console.info(`Connecting to a ${this._name} node, address: ${this._host}:${this._port}`);
        this._client_initializing = true;
        const client = new ElectrumClient('vegabch', '1.4.3', new ElectrumWebSocket(this._host, this._port, this._encrypted));
        await client.connect();
        this._console.info(`Connected to ${this._name} node, address: ${this._host}:${this._port}`);
        this._client = client;
        (this as any)._onClientNotification = onClientNotification;
        (this as any)._onDisconnected = onDisconnected;
        this._client.addListener('notification', onClientNotification);
			  this._client.addListener('disconnected', onDisconnected);
        this._client_successful_last_connect_attempt = true;
        onClientConnected();
      } catch (err) {
        this._console.warn(`An attempt to connect to ${this._name} node failed, `, err);
        onReconnect();
      } finally {
        this._client_initializing = false;
      }
    };
    return await initClient();
  }
  async destroy () {
    if (this._client != null) {
      this._client.removeListener('notification', (this as any)._onClientNotification);
			this._client.removeListener('disconnected', (this as any)._onDisconnected);
      await this._client.disconnect(true, false);
    }
  }
}
