import { initModuleMethodWrapper } from '../helpers.js';
import type ElectrumClientManager from '../electrum-client-manager.js';
import broadcastTransaction from './broadcast-transaction.js';
import type { ModuleSchema, ModuleDependency, ModuleMethod } from '../types.js';

const methods_wrapper = initModuleMethodWrapper();

type NetworkInputServices = {
  electrum_client_manager: ElectrumClientManager;
};

// @ts-ignore
methods_wrapper.add('is_network_available', async (services: NetworkInputServices, network_name: string): Promise<boolean> => {
  return network_name == 'mainnet';
});

methods_wrapper.add('broadcast_transaction', async ({ electrum_client_manager }: NetworkInputServices, txbin: Uint8Array, wait_for_confirmation: boolean): Promise<{ txhash: string }> => {
  const client = electrum_client_manager.getClient();
  if (!client) {
    throw new Error('No active connection with the main electrum node!');
  }
  return await broadcastTransaction(client, txbin, wait_for_confirmation);
});

export function getSchema (): ModuleSchema {
  return {
    methods: Object.keys(methods_wrapper.methods).map((name) => ({ name })),
  };
}

export function getDependencies (): ModuleDependency[] {
  return [
    { name: 'electrum_client_manager' },
  ];
};

export async function init (services: NetworkInputServices): Promise<void> {
  methods_wrapper.defineServices(services);
}

export async function destroy (): Promise<void> {
  // destroy
}

export function getMethod (name: string): ModuleMethod | undefined {
  return methods_wrapper.methods[name];
}

