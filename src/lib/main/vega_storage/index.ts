import type { ModuleSchema, ModuleDependency, ModuleMethod } from '../types.js';
import VegaFileStorageProvider, { TokensIdentity, Settings } from '../vega-file-storage-provider.js';
import { initModuleMethodWrapper } from '../helpers.js';

const methods_wrapper = initModuleMethodWrapper();

type WalletInputServices = {
  vega_storage_provider: VegaFileStorageProvider;
};

methods_wrapper.add('get_tokens_identity', async ({ vega_storage_provider }: WalletInputServices): Promise<TokensIdentity | undefined> => {
  return await vega_storage_provider.getTokensIdentity();
});
methods_wrapper.add('store_tokens_identity', async ({ vega_storage_provider }: WalletInputServices, tokens_identity: TokensIdentity): Promise<void> => {
  await vega_storage_provider.storeTokensIdentity(tokens_identity);
});

methods_wrapper.add('get_settings', async ({ vega_storage_provider }: WalletInputServices): Promise<Settings> => {
  return await vega_storage_provider.getSettings();
});
methods_wrapper.add('store_settings', async ({ vega_storage_provider }: WalletInputServices, settings: Settings): Promise<void> => {
  await vega_storage_provider.storeSettings(settings);
});

export function getSchema (): ModuleSchema {
  return {
    methods: Object.keys(methods_wrapper.methods).map((name) => ({ name })),
  };
}

export function getDependencies (): ModuleDependency[] {
  return [
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
