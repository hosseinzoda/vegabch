import { Args, Flags } from '@oclif/core';
import VegaCommand, { VegaCommandOptions } from '../../lib/vega-command.js';

export default class GetSetting extends VegaCommand<typeof GetSetting> {
  static args = {
  };
  static flags = {
  };
  static vega_options: VegaCommandOptions = {
  };

  static description = 'Prints all recorded settings';

  static examples = [
    `<%= config.bin %> <%= command.id %>`,
  ];

  async run (): Promise<any> {
    const { args, flags } = this;
    const settings = await this.callModuleMethod('vega_storage.get_storage');
    for (const [ name, value ] of Object.entries(settings)) {
      this.log(`${name} = ${value}`);
    }
    return { result: settings };
  }
}
