import * as wallet from './wallet/index.js';
import * as vega_storage from './vega_storage/index.js';
import * as network from './network/index.js';
import * as cauldron from './cauldron/index.js';
import * as moria0 from './moria0/index.js';
import type { ModuleSchema, ModuleDependency, ModuleMethod, Module, ServiceConstructor } from './types.js';
import UTXOTracker from './utxo-tracker.js';

import { ValueError } from '../exceptions.js';

const sub_module_entries: Array<{ name: string, module: Module }> = [
  { name: 'wallet', module: wallet },
  { name: 'vega_storage', module: vega_storage },
  { name: 'network', module: network },
  { name: 'cauldron', module: cauldron },
  { name: 'moria0', module: moria0 },
];

let services_init_pending_map: { [name: string]: Promise<any> } = {};
let services_map: { [name: string]: any } = {};
const service_constructor_list: Array<{ name: string, value: ServiceConstructor }> = [];

export function registerService (name: string, value: ServiceConstructor): void {
  if (service_constructor_list.find((a) => a.name == name) != null) {
    throw new Error('Service name already registered, name: ' + name);
  }
  service_constructor_list.push({ name, value });
}

export async function prepareModuleDependentServices (dependencies: ModuleDependency[], pending_resolution: string[]): Promise<{ [name: string]: any }> {
  const dependencies_map = new Map();
  for (const entry of dependencies) {
    if (dependencies_map.has(entry.name)) {
      throw new Error('Duplicate dependency, name: ' + entry.name);
    }
    dependencies_map.set(entry.name, entry);
  }
  return Object.fromEntries(
    await Promise.all(dependencies.map(async (item) => {
      if (!item.name) {
        throw new Error('item name not defined!');
      }
      if (pending_resolution.indexOf(item.name) != -1) {
        throw new Error('Circular dependency, name: '  + item.name);
      }
      let service = services_map[item.name];
      if (service == null) {
        if (services_init_pending_map[item.name]) {
          service = await services_init_pending_map[item.name];
        } else {
          try {
            service = await (services_init_pending_map[item.name] = (async () => {
              const service_constructor_item = service_constructor_list.find((a) => a.name == item.name);
              if (service_constructor_item == null) {
                throw new Error('No service registered with the following name: ' + item.name);
              }
              const service = service_constructor_item.value.create();
              const sub_pending_resolution: string[] = [].concat(pending_resolution as any);
              sub_pending_resolution.push(item.name);
              const sub_dependencies = (
                typeof service_constructor_item.value.getDependencies == 'function' ?
                  service_constructor_item.value.getDependencies() :
                  (typeof service.getDependencies == 'function' ?
                    service.getDependencies():  null)
              ) || [];
              const sub_params = sub_dependencies.length > 0 ?
                await prepareModuleDependentServices(sub_dependencies, sub_pending_resolution) : {};
              if (typeof service.init == 'function') {
                await service.init(sub_params);
              }
              return services_map[item.name] = service;
            })());
          } finally {
            delete services_init_pending_map[item.name];
          }
        }
      }
      return [ item.name, service ];
    }))
  );
}

export function getSchema (): ModuleSchema {
  return {
    methods: [].concat(...(sub_module_entries.map((a) => a.module.getSchema().methods.map((b) => ({ name: a.name + '.' + b.name })))) as any[]),
  };
}

export async function init (): Promise<void> {
  for (const sub_module_entry of sub_module_entries) {
    await sub_module_entry.module.init(await prepareModuleDependentServices(sub_module_entry.module.getDependencies(), []));
  }
}

export async function destroy (): Promise<void> {
  for (const sub_module_entry of sub_module_entries) {
    await sub_module_entry.module.destroy();
  }
  for (const service of Object.values(services_map)) {
    if (typeof service.destroy == 'function') {
      await service.destroy();
    }
  }
  services_init_pending_map = {};
  services_map = {};
}

export function getMethod (name: string): ModuleMethod | undefined {
  const name_parts = name.split('.');
  if (name_parts.filter((a) => !a).length > 0) {
    throw new ValueError('Invalid method name: ' + name);
  }
  if (name_parts.length != 2) {
    throw new ValueError('Invalid method name: ' + name);
  }
  const sub_module_name = name_parts[0] as string;
  const method_name = name_parts[1] as string;
  const sub_module_entry = sub_module_entries.find((a) => a.name == sub_module_name);
  if (sub_module_entry == null) {
    throw new ValueError('Unknown module name: ' + sub_module_name);
  }
  return sub_module_entry.module.getMethod(method_name);
}


export default { registerService, getSchema, init, destroy, getMethod };
