export type ServiceDependency = {
  name: string;
};
export type ModuleDependency = {
  name: string;
  argument_name?: string;
};

export type Service = {
  init? (dependent_services: any): Promise<void>;
  destroy? (): Promise<void>;
  getDependencies? (): ServiceDependency[];
};

export type ServiceConstructor = {
  getDependencies? (): ServiceDependency[];
  create (): Service;
};

export type Module = {
  init (inputs: any): Promise<void>;
  destroy (): Promise<void>;
  getDependencies (): ModuleDependency[];
  getSchema (): ModuleSchema;
  getMethod (name: string): ModuleMethod | undefined;
  getServices? (): Array<{ name: string, service_constructor: ServiceConstructor }>;
};

export type MainModule = {
  registerService (name: string, value: ServiceConstructor): void;
  init (): Promise<void>;
  destroy (): Promise<void>;
  getSchema (): ModuleSchema;
  getMethod (name: string): ModuleMethod | undefined;
};

export type ModuleMethod = (...args: any[]) => Promise<any>;

export type ModuleSchema = {
  methods: Array<{
    name: string;
  }>;
};

export type Console = {
  info (...args: any[]): void;
  log (...args: any[]): void;
  debug (...args: any[]): void;
  warn (...args: any[]): void;
  error (...args: any[]): void;
};
