import { Args, Flags } from '@oclif/core';
import VegaCommand, { VegaCommandOptions } from '../../lib/vega-command.js';

export default class Moria0ManagerCreateEmailNotificationHook extends VegaCommand<typeof Moria0ManagerCreateEmailNotificationHook> {
  static args = {
    hook_name: Args.string({
      name: 'hook_name',
      required: true,
      description: "wallet name of the loan manager instance.",
    }),
  };
  static flags = {
  };
  static vega_options: VegaCommandOptions = {
  };

  static description = ``;

  static examples = [
    `<%= config.bin %> <%= command.id %> <hook_name> ....`,
  ];

  async run (): Promise<any> {
    const { args } = this;
    await this.callModuleMethod('moria0_manager.delete-notification-hook', args.hook_name);
    return {};
  }
}
