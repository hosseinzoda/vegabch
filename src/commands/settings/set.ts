import { Args, Flags } from '@oclif/core';
import VegaCommand, { VegaCommandOptions } from '../../lib/vega-command.js';

export default class GetSetting extends VegaCommand<typeof GetSetting> {
  static args = {
    name: Args.string({
      name: 'name',
      required: true,
      description: 'name',
      ignoreStdin: true,
    }),
    value: Args.string({
      name: 'value',
      required: true,
      description: 'value',
    }),
  };
  static flags = {
  };
  static vega_options: VegaCommandOptions = {
  };

  static description = 'set wallet settings';

  static examples = [
    `<%= config.bin %> <%= command.id %> <name> <value>`,
  ];

  async run (): Promise<any> {
    const { args, flags } = this;
    const settings = await this.callModuleMethod('vega_storage.get_settings');
    const name = args.name;
    const value = args.value;
    settings[name] = value;
    await this.callModuleMethod('vega_storage.store_settings', settings);
    return null;
  }
}
