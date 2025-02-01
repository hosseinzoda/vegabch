import { Args } from '@oclif/core';
import VegaCommand, { VegaCommandOptions } from '../../lib/vega-command.js';

export default class Moria0ManagerEnable extends VegaCommand<typeof Moria0ManagerEnable> {
  static args = {
    wallet_name: Args.string({
      name: 'wallet_name',
      required: true,
      description: "Enable moria0 manager for the wallet_name",
    }),
  };
  static flags = {
  };
  static vega_options: VegaCommandOptions = {
  };

  static description = ``;

  static examples = [
    `<%= config.bin %> <%= command.id %> <wallet_name>`,
  ];

  async run (): Promise<any> {
    const { args } = this;
    await this.callModuleMethod('moria0_manager.enable', args.wallet_name);
    return {};
  }
}
