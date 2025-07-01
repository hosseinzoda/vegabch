import type UTXOTracker from '../utxo-tracker.js';
import VegaFileStorageProvider, {
  WalletDataType, WalletDataNetwork,
  genWalletAddressInfo, WalletData,
} from '../vega-file-storage-provider.js';
import type { ModuleSchema, ModuleDependency, ModuleMethod } from '../types.js';
import {
  getNativeBCHTokenInfo, bigIntToDecString, TokenBalanceDetail,
  tokensBalanceDetailFromUTXOList, readableTokenBalance,
  BCMRIndexer, buildTokensBCMRFromTokensIdentity,
} from '../../util.js';

import { ValueError } from '../../exceptions.js';
import { initModuleMethodWrapper } from '../helpers.js';
import { UTXO, TokenId, NATIVE_BCH_TOKEN_ID } from '@cashlab/common';
import {
  generatePrivateKey, generateRandomSeed, generateRandomBytes,
  encodeBip39Mnemonic, assertSuccess,
} from '@cashlab/common/libauth.js';

const methods_wrapper = initModuleMethodWrapper();

type WalletInputServices = {
  vega_storage_provider: VegaFileStorageProvider;
  utxo_tracker: UTXOTracker;
};

methods_wrapper.add('balance', async ({ vega_storage_provider, utxo_tracker }: WalletInputServices, wallet_name: string) => {
  const bcmr_indexer = new BCMRIndexer(buildTokensBCMRFromTokensIdentity(await vega_storage_provider.getTokensIdentity()));
  const wallet_data = await vega_storage_provider.getWalletData(wallet_name);
  if (wallet_data == null) {
    throw new ValueError(`wallet not found, name: ${wallet_name}`);
  }
  const addr_info = genWalletAddressInfo(wallet_data);
  const utxo_list: UTXO[] = await utxo_tracker.getUTXOListForLockingBytecode(addr_info.locking_bytecode);
  const result: TokenBalanceDetail[] = tokensBalanceDetailFromUTXOList(utxo_list);
  return result.map((item) => ({
    ...item,
    summary_readable: readableTokenBalance(item.token_id, item.confirmed_balance + item.unconfirmed_balance, bcmr_indexer),
    confirmed_readable: readableTokenBalance(item.token_id, item.confirmed_balance, bcmr_indexer),
    unconfirmed_readable: readableTokenBalance(item.token_id, item.unconfirmed_balance, bcmr_indexer),
  }));
});

methods_wrapper.add('info', async ({ vega_storage_provider }: WalletInputServices, wallet_name: string) => {
  const wallet_data = await vega_storage_provider.getWalletData(wallet_name);
  if (wallet_data == null) {
    return null;
  }
  const addr_info = genWalletAddressInfo(wallet_data);
  return {
    type: wallet_data.type,
    network: wallet_data.network,
    main: Object.fromEntries([
      'wallet_type', 'locking_type', 'public_key', 'public_key_compressed',
      'public_key_hash', 'locking_bytecode', 'cashaddr'
    ].map((a) => [ a, (addr_info as any)[a] ])),
  };
});

methods_wrapper.add('create', async ({ vega_storage_provider }: WalletInputServices, wallet_name: string, wallet_type: WalletDataType, network: WalletDataNetwork, params: any): Promise<void> => {
  let wallet_data: WalletData;
  if (wallet_type == 'single-address-seed') {
    if (!params.seed_phrase) {
      throw new Error('params.seed_phrase is required!');
    }
    if (!params.derivation_path) {
      throw new Error('params.derivation_path is required!');
    }
    wallet_data = {
      type: wallet_type,
      network,
      seed_phrase: params.seed_phrase,
      derivation_path: params.derivation_path,
    };
  } else  if (wallet_type == 'wif') {
    if (!params.private_key) {
      throw new Error('params.private_key is required!');
    }
    wallet_data = {
      type: wallet_type,
      network,
      private_key: params.private_key,
    };
  } else {
    throw new Error('Unknown type: ' + wallet_type);
  }
  genWalletAddressInfo(wallet_data);
  await vega_storage_provider.init();
  const saved_wallet_record = await vega_storage_provider.getWalletMetadata(wallet_name);
  if (saved_wallet_record) {
    throw new Error('Wallet already exists, name: ' + wallet_name);
  }
  const metadata = {
    name: wallet_name,
    settings: {},
  };
  await vega_storage_provider.insertWallet(metadata, wallet_data);
});

methods_wrapper.add('generate', async ({ vega_storage_provider }: WalletInputServices, wallet_name: string, wallet_type: WalletDataType, network: WalletDataNetwork, params: any): Promise<void> => {
  let wallet_data: WalletData;
  if (wallet_type == 'single-address-seed') {
    if (!params.derivation_path) {
      throw new Error('params.derivation_path is required!');
    }
    wallet_data = {
      type: wallet_type,
      network,
      seed_phrase: assertSuccess(encodeBip39Mnemonic(generateRandomBytes(32))).phrase,
      derivation_path: params.derivation_path,
    };
  } else  if (wallet_type == 'wif') {
    wallet_data = {
      type: wallet_type,
      network,
      private_key: generatePrivateKey(),
    };
  } else {
    throw new Error('Unknown type: ' + wallet_type);
  }
  genWalletAddressInfo(wallet_data);
  await vega_storage_provider.init();
  const saved_wallet_record = await vega_storage_provider.getWalletMetadata(wallet_name);
  if (saved_wallet_record) {
    throw new Error('Wallet already exists, name: ' + wallet_name);
  }
  const metadata = {
    name: wallet_name,
    settings: {},
  };
  await vega_storage_provider.insertWallet(metadata, wallet_data);
});

methods_wrapper.add('list', async ({ vega_storage_provider }: WalletInputServices): Promise<Array<{ name: string, type: string, network: string }>> => {
  return (await vega_storage_provider.getAllWallets())
    .map(({ metadata, wallet_data }) => {
      return { name: metadata.name, type: wallet_data.type, network: wallet_data.network };
    });
});

methods_wrapper.add('pinned_wallet', async ({ vega_storage_provider }: WalletInputServices): Promise<string | undefined> => {
  return await vega_storage_provider.getPinnedWalletName();
});
methods_wrapper.add('pin_wallet', async ({ vega_storage_provider }: WalletInputServices, wallet_name: string | undefined): Promise<void> => {
  await vega_storage_provider.pinWallet(wallet_name);
});

export function getSchema (): ModuleSchema {
  return {
    methods: Object.keys(methods_wrapper.methods).map((name) => ({ name })),
  };
}

export function getDependencies (): ModuleDependency[] {
  return [
    { name: 'utxo_tracker' },
    { name: 'vega_storage_provider' },
  ];
}

export async function init (services: WalletInputServices): Promise<void> {
  methods_wrapper.defineServices(services);
}

export async function destroy (): Promise<void> {
  // pass
}

export function getMethod (name: string): ModuleMethod | undefined {
  return methods_wrapper.methods[name];
}

