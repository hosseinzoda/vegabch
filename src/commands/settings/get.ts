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
  };
  static flags = {
  };
  static vega_options: VegaCommandOptions = {
  };

  static description = 'get the value of a setting';

  static examples = [
    `<%= config.bin %> <%= command.id %> <name>`,
  ];

  async run (): Promise<any> {
    const { args, flags } = this;
    const settings = await this.callModuleMethod('vega_storage.get_settings');
    const name = args.name;
    this.log(settings[name] || '');
    return { result: settings[name] || null };
  }
}
