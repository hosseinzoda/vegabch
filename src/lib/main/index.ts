import * as wallet from './wallet/index.js';
import * as vega_storage from './vega_storage/index.js';
import * as network from './network/index.js';
import * as cauldron from './cauldron/index.js';
import * as moria0 from './moria0/index.js';
import * as moria0_manager from './moria0_manager/index.js';
import * as moria1 from './moria1/index.js';
import * as token from './token/index.js';
import type {
  ModuleSchema, ServiceDependency, ModuleDependency, ModuleMethod,
  Module, ServiceConstructor, Service,
} from './types.js';

import { ValueError } from '../exceptions.js';

type SubModuleEntry = {
  name: string;
  module: Module;
  init_by_dependent?: boolean;
  initialized: boolean;
  pending_init?: Promise<void>;
  pending_destroy?: Promise<void>;
};

const sub_module_entries: SubModuleEntry[] = [
  { name: 'wallet', module: wallet  },
  { name: 'vega_storage', module: vega_storage },
  { name: 'network', module: network },
  { name: 'cauldron', module: cauldron },
  { name: 'moria0', module: moria0 },
  { name: 'moria0_manager', module: moria0_manager },
  { name: 'moria1', module: moria1 },
  { name: 'token', module: token },
].map((a) => ({ ...a, initialized: false }));

let services_init_pending_map: { [name: string]: Promise<any> } = {};
let services_destroy_pending_map: { [name: string]: Promise<any> } = {};
let services_map: { [name: string]: any } = {};
const service_constructor_list: Array<{ name: string, value: ServiceConstructor }> = [];

export function registerService (name: string, value: ServiceConstructor): void {
  if (service_constructor_list.find((a) => a.name == name) != null) {
    throw new Error('Service name already registered, name: ' + name);
  }
  service_constructor_list.push({ name, value });
}

type DependencyTreeItem = {
  type: 'service' | 'module';
  name: string;
  value: any;
  dependencies_wrapper: Array<{
    value: any;
    node: DependencyTreeItem,
  }>;
  dependents: DependencyTreeItem[];
};
const dependency_tree_item_map: Map<string, DependencyTreeItem> = new Map();

function getModuleDependencyTree (sub_module_entry: SubModuleEntry): DependencyTreeItem {
  const validateDependencies = (parent_name: string, dependencies: any[], pending_resolution: string[]) => {
    const dependencies_map = new Map();
    for (const entry of dependencies) {
      if (!entry.name) {
        throw new Error('dependency name not defined!');
      }
      if (parent_name == entry.name) {
        throw new Error('Module/Service cannot depend on itself, name: ' + entry.name);
      }
      if (pending_resolution.indexOf(entry.name) != -1) {
        throw new Error('Circular dependency, name: '  + entry.name);
      }
      if (dependencies_map.has(entry.name)) {
        throw new Error('Duplicate dependency, name: ' + entry.name);
      }
      dependencies_map.set(entry.name, entry);
    }
  }
  const buildServiceDependencyTree = (service_name: string, service_constructor: ServiceConstructor, pending_resolution: string[]): DependencyTreeItem => {
    if (dependency_tree_item_map.has(service_name)) {
      return dependency_tree_item_map.get(service_name) as DependencyTreeItem;
    }
    const dependencies = typeof service_constructor.getDependencies == 'function' ?
      service_constructor.getDependencies() : [];
    validateDependencies(service_name, dependencies, pending_resolution);
    const dependencies_wrapper = [];
    for (const dependency of dependencies) {
      let dependency_name = dependency.name;
      if (dependency.name.startsWith('.')) {
        const parts = service_name.split('.');
        if (parts.length == 0) {
          throw new Error('Relative dependency is not applicable, name: ' + dependency.name);
        }
        dependency_name = parts.slice(0, parts.length - 1).join('.') + dependency.name;
      }
      const matched_service_constructor = service_constructor_list.find((a) => a.name == dependency_name);
      if (matched_service_constructor != null) {
        dependencies_wrapper.push({
          value: dependency,
          node: buildServiceDependencyTree(matched_service_constructor.name, matched_service_constructor.value, [ ...pending_resolution, dependency_name ]),
        });
        continue;
      }
      throw new Error('Dependency not found, name: ' + dependency.name);
    }
    const item: DependencyTreeItem = {
      type: 'service',
      name: service_name,
      value: service_constructor,
      dependencies_wrapper,
      dependents: [],
    };
    for (const dependency_wrapper of dependencies_wrapper) {
      if (dependency_wrapper.node.dependents.indexOf(item) == -1) {
        dependency_wrapper.node.dependents.push(item);
      }
    }
    dependency_tree_item_map.set(service_name, item);
    return item;
  };
  const buildModuleDependencyTree = (sub_module_entry: SubModuleEntry, pending_resolution: string[]): DependencyTreeItem => {
    if (dependency_tree_item_map.has(sub_module_entry.name)) {
      return dependency_tree_item_map.get(sub_module_entry.name) as DependencyTreeItem;
    }
    const dependencies = sub_module_entry.module.getDependencies();
    validateDependencies(sub_module_entry.name, dependencies, pending_resolution);
    const dependencies_wrapper = [];
    for (const dependency of dependencies) {
      const matched_module_entry = sub_module_entries.find((a) => a.name == dependency.name);
      if (matched_module_entry != null) {
        dependencies_wrapper.push({
          value: dependency,
          node: buildModuleDependencyTree(matched_module_entry, [ ...pending_resolution, dependency.name ])
        });
        continue;
      } else {
        let dependency_name = dependency.name;
        if (dependency.name.startsWith('.')) {
          dependency_name = sub_module_entry.name + dependency.name;
        }
        const matched_service_constructor_item = service_constructor_list.find((a) => a.name == dependency_name);
        if (matched_service_constructor_item != null) {
          dependencies_wrapper.push({
            value: dependency,
            node: buildServiceDependencyTree(dependency_name, matched_service_constructor_item.value, [ ...pending_resolution, dependency_name ])
          });
          continue;
        }
      }
      throw new Error('Dependency not found, name: ' + dependency.name + ', Dependent module name: ' + sub_module_entry.name);
    }
    const item: DependencyTreeItem = {
      type: 'module',
      name: sub_module_entry.name,
      value: sub_module_entry,
      dependencies_wrapper,
      dependents: [],
    };
    for (const dependency_wrapper of dependencies_wrapper) {
      if (dependency_wrapper.node.dependents.indexOf(item) == -1) {
        dependency_wrapper.node.dependents.push(item);
      }
    }
    dependency_tree_item_map.set(sub_module_entry.name, item);
    return item;
  };
  return buildModuleDependencyTree(sub_module_entry, []);
}

async function prepareModuleRequiredDependencies (tree: DependencyTreeItem, pending_resolution: string[]): Promise<{ [name: string]: any }> {
  return Object.fromEntries(
    await Promise.all(tree.dependencies_wrapper.map(async (dependency_wrapper) => {
      if (!dependency_wrapper.node.name) {
        throw new Error('item name not defined!');
      }
      if (pending_resolution.indexOf(dependency_wrapper.node.name) != -1) {
        throw new Error('Circular dependency, name: '  + dependency_wrapper.node.name);
      };
      let argument_name = dependency_wrapper.node.name.replace('.', '__');
      if (dependency_wrapper.value.argument_name) {
        argument_name = dependency_wrapper.value.argument_name
      }
      if (dependency_wrapper.node.type == 'module') {
        return [ argument_name, await initSubModuleIfNeeded(dependency_wrapper.node, true, [ ...pending_resolution, dependency_wrapper.node.name ]) ];
      } else if (dependency_wrapper.node.type == 'service') {
        return [ argument_name, await initServiceIfNeeded(dependency_wrapper.node, [ ...pending_resolution, dependency_wrapper.node.name ]) ];
      }
      throw new Error('Unknown dependency type: ' + dependency_wrapper.node.type);
    }))
  );
}

async function initServiceIfNeeded (item: DependencyTreeItem, pending_resolution: string[]): Promise<Service> {
  const saved_service = services_map[item.name];
  if (saved_service != null) {
    return saved_service;
  }
  if (services_init_pending_map[item.name]) {
    return await services_init_pending_map[item.name];
  }
  try {
    return await (services_init_pending_map[item.name] = (async () => {
      const service_constructor: ServiceConstructor = item.value
      const service = service_constructor.create();
      const sub_services = await prepareModuleRequiredDependencies(item, [ ...pending_resolution, item.name ]);
      if (typeof service.init == 'function') {
        await service.init(sub_services);
      }
      return services_map[item.name] = service;
    })());
  } finally {
    delete services_init_pending_map[item.name];
 }
}

async function initSubModuleIfNeeded (item: DependencyTreeItem, init_by_dependent: boolean, pending_resolution: string[]): Promise<Module> {
  const sub_module_entry: SubModuleEntry = item.value;
  try {
    if (sub_module_entry.pending_destroy) {
      await sub_module_entry.pending_destroy;
    }
    if (sub_module_entry.pending_init == null && !sub_module_entry.initialized) {
      sub_module_entry.pending_init = sub_module_entry.module.init(await prepareModuleRequiredDependencies(item, [ ...pending_resolution, sub_module_entry.name ]))
        .then(() => {
          sub_module_entry.initialized = true;
          if (!init_by_dependent) {
            sub_module_entry.init_by_dependent = false;
          } else if (sub_module_entry.init_by_dependent === undefined) {
            sub_module_entry.init_by_dependent = true;
          }
        });
    }
    await sub_module_entry.pending_init;
    return sub_module_entry.module;
  } finally {
    delete sub_module_entry.pending_init;
  }
}

async function destroyService (item: DependencyTreeItem): Promise<void> {
  if (item.dependents.length != 0) {
    throw new Error(`Cannot destroy a module with active dependents!`);
  }
  try {
    if (services_init_pending_map[item.name]) {
      await services_init_pending_map[item.name];
    }
    if (services_destroy_pending_map[item.name] == null && services_map[item.name] != null) {
      const service = services_map[item.name];
      services_destroy_pending_map[item.name] = (typeof service.destroy == 'function' ? service.destroy() : Promise.resolve())
        .then(() => {
          const promises = [];
          delete services_map[item.name];
          // remove the item from the saved dependency tree map
          dependency_tree_item_map.delete(item.name);
          // auto-destroy dependencies that has been initialized by the dependent
          for (const dependency_wrapper of item.dependencies_wrapper) {
            { // remove the destroyed item
              const idx = dependency_wrapper.node.dependents.indexOf(item);
              if (idx != -1) {
                dependency_wrapper.node.dependents.splice(idx, 1);
              }
            }
            if (dependency_wrapper.node.dependents.length == 0 && dependency_wrapper.node.type == 'service') {
              promises.push(destroyService(dependency_wrapper.node));
            }
          }
          return Promise.all(promises);
        });
    }
    await services_destroy_pending_map[item.name];
  } finally {
    delete services_destroy_pending_map[item.name];
  }
}

async function destroySubModule (item: DependencyTreeItem): Promise<void> {
  if (item.dependents.length != 0) {
    throw new Error(`Cannot destroy a module with active dependents!`);
  }
  const sub_module_entry: SubModuleEntry = item.value;
  try {
    if (sub_module_entry.pending_init) {
      await sub_module_entry.pending_init;
    }
    if (sub_module_entry.pending_destroy == null && sub_module_entry.initialized) {
      sub_module_entry.pending_destroy = sub_module_entry.module.destroy()
        .then(() => {
          const promises: Array<Promise<void>> = [];
          sub_module_entry.initialized = false;
          delete sub_module_entry.init_by_dependent;
          // remove the item from the saved dependency tree map
          dependency_tree_item_map.delete(item.name);
          // auto-destroy dependencies that has been initialized by the dependent
          for (const dependency_wrapper of item.dependencies_wrapper) {
            { // remove the destroyed item
              const idx = dependency_wrapper.node.dependents.indexOf(item);
              if (idx != -1) {
                dependency_wrapper.node.dependents.splice(idx, 1);
              }
            }
            if (dependency_wrapper.node.dependents.length == 0) {
              if (dependency_wrapper.node.type == 'module' && dependency_wrapper.node.value.init_by_dependent === false) {
                continue; // skip auto-destroy
              }
              if (dependency_wrapper.node.type == 'module') {
                promises.push(destroySubModule(dependency_wrapper.node));
              } else if (dependency_wrapper.node.type == 'service') {
                promises.push(destroySubModule(dependency_wrapper.node));
              }
            }
          }
          return Promise.all(promises) as any;
        });
    }
    await sub_module_entry.pending_destroy;
  } finally {
    delete sub_module_entry.pending_destroy;
  }
}

export function getSchema (): ModuleSchema {
  return {
    methods: [].concat(...(sub_module_entries.map((a) => a.module.getSchema().methods.map((b) => ({ name: a.name + '.' + b.name })))) as any[]),
  };
}

export async function init (): Promise<void> {
  // register sub module services
  for (const sub_module_entry of sub_module_entries) {
    if (typeof sub_module_entry.module.getServices == 'function') {
      for (const { name, service_constructor } of sub_module_entry.module.getServices()) {
        registerService(sub_module_entry.name + '.' + name, service_constructor);
      }
    }
  }
  // init all modules
  for (const sub_module_entry of sub_module_entries) {
    await initSubModuleIfNeeded(getModuleDependencyTree(sub_module_entry), false, []);
  }
}

export async function destroy (): Promise<void> {
  // wait for pending_init to end
  await Promise.all(sub_module_entries.map((a) => a.pending_init == null ? Promise.resolve() : a.pending_init));
  for (const entry of sub_module_entries) {
    delete entry.init_by_dependent;
    if (entry.initialized) {
      const item = getModuleDependencyTree(entry);
      if (item.dependents.length == 0) {
        destroySubModule(item);
      }
    }
  }
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
