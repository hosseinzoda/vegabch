
export type Service = {
  init? (dependent_services: any): Promise<void>;
  destroy? (): Promise<void>;
  getDependencies? (): ModuleDependency[];
};

export type ServiceConstructor = {
  getDependencies? (): ModuleDependency[];
  create (): Service;
};

export type ModuleDependency = {
  name: string;
};

export type Module = {
  init (services: any): Promise<void>;
  destroy (): Promise<void>;
  getDependencies (): ModuleDependency[];
  getSchema (): ModuleSchema;
  getMethod (name: string): ModuleMethod | undefined;
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
