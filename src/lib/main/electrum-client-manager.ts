import { ElectrumClient, ElectrumClientEvents, RPCNotification as ElectrumRPCNotification } from '@electrum-cash/network';
import { ElectrumWebSocket } from '@electrum-cash/web-socket';
import EventEmitter from 'node:events';
import type { Service, ServiceDependency, Console } from './types.js';

export default class ElectrumClientManager extends EventEmitter implements Service {
  _name: string;
  _host: string;
  _port: number;
  _encrypted: boolean;
  _web_socket: ElectrumWebSocket | null;
  _client: ElectrumClient<ElectrumClientEvents> | null;
  _client_initializing: boolean;
  _console: Console;
  constructor (name: string, host: string, port: number, encrypted: boolean) {
    super()
    this._console = null as any;
    this._name = name;
    this._host = host;
    this._port = port;
    this._encrypted = encrypted;
    this._web_socket = null;
    this._client = null;
    this._client_initializing = false;
  }
  isConnected (): boolean {
    return !!this._client;
  }
  getClient (): ElectrumClient<ElectrumClientEvents> | null {
    return this._client;
  }
  static getDependencies (): ServiceDependency[] {
    return [
      { name: 'console' },
    ];
  }
  onSocketError (error: any): void {
    try {
      this._console.warn(`${this._name} node socket error`, error);
    } catch (err) {
      // pass
    }
  }
  async init ({ console }: { console: Console }) {
    this._console = console;
    const onConnected = async () => {
      this._console.info(`Connected to ${this._name} node, address: ${this._host}:${this._port}`);
      try {
        this.emit('connected');
      } catch (err) {
        console.log(`error thrown on connected event, `, err);
      }
    };
    const onConnecting = async () => {
      this._console.info(`Connecting to a ${this._name} node, address: ${this._host}:${this._port}`);
    };
    const onDisconnected = async () => {
      this._console.log(`Disconnected from ${this._name} node.`);
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
      try {
        this._client_initializing = true;
        this._web_socket = new ElectrumWebSocket(this._host, this._port, this._encrypted);
        (this as any)._onSocketError = this.onSocketError.bind(this);
        this._web_socket.addListener('error', (this as any)._onSocketError);
        const client = new ElectrumClient('vegabch', '1.4.3', this._web_socket);
        // nullify resubscribeOnConnect, vegabch already resubscribe upon reconnect
        if ((client as any).resubscribeOnConnect != null) {
          const origResubscribeOnConnect = (client as any).resubscribeOnConnect;
          (client as any).resubscribeOnConnect = function () {
            this.subscriptionMethods = {};
            return origResubscribeOnConnect.apply(this, arguments);
          };
        }
        this._client = client;
        (this as any)._onClientNotification = onClientNotification;
        (this as any)._onDisconnected = onDisconnected;
        (this as any)._onConnected = onConnected;
        (this as any)._onConnecting = onConnecting;
        this._client.addListener('notification', onClientNotification);
			  this._client.addListener('disconnected', onDisconnected);
			  this._client.addListener('connected', onConnected);
			  this._client.addListener('connecting', onConnecting);
        await client.connect();
      } catch (err) {
        this._console.warn(`An attempt to connect to ${this._name} node failed, `, err);
      } finally {
        this._client_initializing = false;
      }
    };
    return await initClient();
  }
  async destroy () {
    if (this._web_socket != null) {
      this._web_socket.removeListener('error', (this as any)._onSocketError);
    }
    if (this._client != null) {
      this._client.removeListener('notification', (this as any)._onClientNotification);
			this._client.removeListener('disconnected', (this as any)._onDisconnected);
			this._client.removeListener('connected', (this as any)._onConnected);
			this._client.removeListener('connecting', (this as any)._onConnecting);
      try {
        await this._client.disconnect(true, false);
      } catch (err) {
        this._console.warn(`electrum-client-manager (${this._name}) onDestroy client disconnect fail!, `, err);
      }
      this._client = null;
    }
  }
}
