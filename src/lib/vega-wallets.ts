import {
  WifWallet, TestNetWifWallet, RegTestWifWallet, Wallet, TestNetWallet, RegTestWallet,
  NetworkProvider, Network,
} from 'mainnet-js';

// @ts-ignore: unused parameters
let getNetworkProvider = (network: Network): NetworkProvider => {
  throw new Error('setHandlerForGetNetworkProvider has not been called!')
};

export const setHandlerForGetNetworkProvider = (handler: (network: Network) => NetworkProvider) => {
  getNetworkProvider = handler;
};

export class VegaWifWallet extends WifWallet {
  public getNetworkProvider (network: Network = Network.MAINNET): NetworkProvider {
    return getNetworkProvider(network);
  }
}

export class VegaTestNetWifWallet extends TestNetWifWallet {
  public getNetworkProvider (network: Network = Network.MAINNET): NetworkProvider  {
    return getNetworkProvider(network);
  }
}

export class VegaRegTestWifWallet extends RegTestWifWallet {
  public getNetworkProvider (network: Network = Network.MAINNET): NetworkProvider {
    return getNetworkProvider(network);
  }
}

export class VegaWallet extends Wallet {
  public getNetworkProvider (network: Network = Network.MAINNET): NetworkProvider {
    return getNetworkProvider(network);
  }
}

export class VegaTestNetWallet extends TestNetWallet {
  public getNetworkProvider (network: Network = Network.MAINNET): NetworkProvider {
    return getNetworkProvider(network);
  }
}

export class VegaRegTestWallet extends RegTestWallet {
  public getNetworkProvider (network: Network = Network.MAINNET): NetworkProvider {
    return getNetworkProvider(network);
  }
}

