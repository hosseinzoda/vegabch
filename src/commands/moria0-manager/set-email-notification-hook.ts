import { Args, Flags } from '@oclif/core';
import VegaCommand, { VegaCommandOptions } from '../../lib/vega-command.js';
import type { EmailNotificationHook } from '../../lib/main/moria0_manager/types.js';
import { validateNotificationHookData } from '../../lib/main/moria0_manager/helpers.js';
import { ValueError } from '../../lib/exceptions.js';

export default class Moria0ManagerSetEmailNotificationHook extends VegaCommand<typeof Moria0ManagerSetEmailNotificationHook> {
  static args = {
    hook_name: Args.string({
      name: 'hook_name',
      required: true,
      description: "wallet name of the loan manager instance.",
    }),
  };
  static flags = {
    'target-events': Flags.string({
      description: `trigger the notification for the target-events, If not defined it'll be triggered for all events.`,
      required: false,
      multiple: true,
    }),
    'protocol': Flags.string({
      description: `notification hook's email protocol`,
      required: true,
      options: ['SMTP'],
      default: 'SMTP',
    }),
    'secure-layer': Flags.string({
      description: `protocol's secure layer.`,
      required: false,
      options: ['STARTTLS', 'TLS'],
    }),
    'host': Flags.string({
      description: `email server host.`,
      required: true,
    }),
    'port': Flags.string({
      description: `email server port.`,
      required: true,
    }),
    'username': Flags.string({
      description: `email's authorization username.`,
      required: true,
    }),
    'password': Flags.string({
      description: `email's authorization password.`,
      required: true,
    }),
    'sender': Flags.string({
      description: `notification from email.`,
      required: true,
    }),
    'recipient': Flags.string({
      description: `notification recipient email.`,
      required: true,
    }),
  };
  static vega_options: VegaCommandOptions = {
  };

  static description = ``;

  static examples = [
    `<%= config.bin %> <%= command.id %> <hook_name> ....`,
  ];

  async run (): Promise<any> {
    const { args, flags } = this;
    if (!(parseInt(flags['port']) > 0)) {
      throw new ValueError(`port should be a positive number`);
    }
    let target_events: string[] | undefined = flags['target-events'] || [];
    target_events = target_events.length == 0 || target_events.filter((a) => a == '*').length == 1 ? undefined : target_events;
    const notification_hook: EmailNotificationHook = {
      name: args.hook_name,
      type: 'email',
      target_events,
      protocol: flags['protocol'] as any,
      secure_layer: flags['secure-layer'] || null as any,
      host: flags['host'],
      port: parseInt(flags['port']),
      username: flags['username'],
      password: flags['password'],
      sender: flags['sender'],
      recipient: flags['recipient'],
    };
    validateNotificationHookData(notification_hook);
    await this.callModuleMethod('moria0_manager.set-notification-hook', notification_hook);
    return {};
  }
}
