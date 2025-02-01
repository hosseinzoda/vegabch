import { Args } from '@oclif/core';
import VegaCommand, { VegaCommandOptions } from '../../lib/vega-command.js';
import type { NotificationHook } from '../../lib/main/moria0_manager/types.js';

export default class Moria0ManagerPrintNotificationHook extends VegaCommand<typeof Moria0ManagerPrintNotificationHook> {
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
    const notification_hook: NotificationHook = await this.callModuleMethod('moria0_manager.get-notification-hook', args.hook_name);

    this.log(`name = ${notification_hook.name}`);
    if (notification_hook.target_events) {
      this.log(`target_events = ${notification_hook.target_events.join(', ')}`);
    }
    this.log(`type = ${notification_hook.type}`);
    if (notification_hook.type == 'webhook') {
      this.log(`link = ${notification_hook.link}`);
      this.log(`method = ${notification_hook.method}`);
      this.log(`post_content_type = ${notification_hook.post_content_type}`);
      if (notification_hook.headers != null) {
        this.log(`headers ==>`);
        for (const header of notification_hook.headers) {
          this.log(`  - ${header.name} = ${header.value}`);
        }
        this.log(`==|`);
      }
    } else if (notification_hook.type == 'email') {
      this.log(`protocol = ${notification_hook.protocol}`);
      this.log(`secure_layer = ${notification_hook.secure_layer}`);
      this.log(`host = ${notification_hook.host}`);
      this.log(`port = ${notification_hook.port}`);
      this.log(`username = ${notification_hook.username}`);
      this.log(`password = *******`);
      this.log(`sender = ${notification_hook.sender}`);
      this.log(`recipient = ${notification_hook.recipient}`);
    }

    return {
      result: notification_hook,
    };
  }
}
