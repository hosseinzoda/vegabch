import { NetworkProvider, Network, UtxoI, TxI, HeaderI } from "mainnet-js";

export default class DummyNetworkProvider implements NetworkProvider {
  network: Network;
  constructor (network: Network) {
    this.network = network;
  }
  _dummyProviderError (): Error {
    return new Error('Dummy network provider shall not be called');
  }
  // @ts-ignore: unused parameters
  async getUtxos (cashaddr: string): Promise<UtxoI[]> {
    throw this._dummyProviderError();
  }
  // @ts-ignore: unused parameters
  async getBalance (cashaddr: string): Promise<number> {
    throw this._dummyProviderError();
  }
  async getBlockHeight (): Promise<number> {
    throw this._dummyProviderError();
  }
  async getRelayFee (): Promise<number> {
    throw this._dummyProviderError();
  }
  // @ts-ignore: unused parameters
  async getRawTransaction (txHash: string): Promise<string> {
    throw this._dummyProviderError();
  }
  // @ts-ignore: unused parameters
  async getRawTransactionObject (txHash: string): Promise<any> {
    throw this._dummyProviderError();
  }
  // @ts-ignore: unused parameters
  sendRawTransaction (txHex: string, awaitPropagation?: boolean): Promise<string> {
    throw this._dummyProviderError();
  }
  // @ts-ignore: unused parameters
  getHistory (cashaddr: string): Promise<TxI[]> {
    throw this._dummyProviderError();
  }
  // @ts-ignore: unused parameters
  waitForBlock (height?: number): Promise<HeaderI> {
    throw this._dummyProviderError();
  }
  // @ts-ignore: unused parameters
  subscribeToAddress (cashaddr: string, callback: (data: any) => void): Promise<void> {
    throw this._dummyProviderError();
  }
  // @ts-ignore: unused parameters
  unsubscribeFromAddress (cashaddr: string, callback: (data: any) => void): Promise<void> {
    throw this._dummyProviderError();
  }
  // @ts-ignore: unused parameters
  subscribeToTransaction (txHash: string, callback: (data: any) => void): Promise<void> {
    throw this._dummyProviderError();
  }
  // @ts-ignore: unused parameters
  unsubscribeFromTransaction (txHash: string, callback: (data: any) => void): Promise<void> {
    throw this._dummyProviderError();
  }
  // @ts-ignore: unused parameters
  async ready (timeout?: number): Promise<boolean | unknown> {
    return true;
  }
  connect (): Promise<void[]> {
    return Promise.resolve<void[]>([]);
  }
  async disconnect (): Promise<boolean[]> {
    return [true];
  }
}
