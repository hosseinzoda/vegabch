import { Args } from '@oclif/core';
import VegaCommand, { VegaCommandOptions } from '../../lib/vega-command.js';

export default class Moria0ManagerTriggerTestNotificationHook extends VegaCommand<typeof Moria0ManagerTriggerTestNotificationHook> {
  static args = {
    wallet_name: Args.string({
      name: 'wallet_name',
      required: true,
      description: "wallet name of the loan manager instance.",
    }),
    notification_name: Args.string({
      name: 'notification_name',
      required: true,
      description: "The name of the test notification to trigger.",
    }),
  };
  static flags = {
  };
  static vega_options: VegaCommandOptions = {
  };

  static description = ``;

  static examples = [
    `<%= config.bin %> <%= command.id %> <wallet_name> <notification_name>`,
  ];

  async run (): Promise<any> {
    const { args } = this;
    const result = await this.callModuleMethod('moria0_manager.trigger-test-notification', args.wallet_name, args.notification_name);
    return { result };
  }
}
