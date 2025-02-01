import { Args, Flags } from '@oclif/core';
import VegaCommand, { VegaCommandOptions } from '../../lib/vega-command.js';
import type { WebNotificationHook } from '../../lib/main/moria0_manager/types.js';
import { validateNotificationHookData } from '../../lib/main/moria0_manager/helpers.js';
import { ValueError } from '../../lib/exceptions.js';

export default class Moria0ManagerSetWebNotificationHook extends VegaCommand<typeof Moria0ManagerSetWebNotificationHook> {
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
    'link': Flags.string({
      description: `notification hook's http or https link`,
      required: true,
    }),
    'method': Flags.string({
      description: `web request's method.`,
      required: true,
      options: ['POST', 'PUT'],
      default: 'POST',
    }),
    'post-content-type': Flags.string({
      description: `post's content type.`,
      required: true,
      options: ['json','form-urlencoded'],
      default: 'json',
    }),
    'header': Flags.string({
      description: `Value format, "Name:Value"`,
      required: false,
      multiple: true,
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
    let target_events: string[] | undefined = flags['target-events'] || [];
    target_events = target_events.length == 0 || target_events.filter((a) => a == '*').length == 1 ? undefined : target_events;
    const headers = [];
    for (const header of flags['header']||[]) {
      const parts = header.split(':');
      const value = parts.slice(1).join(':');
      if (parts.length >= 2 || parts[0] == '' || value == '') {
        throw new ValueError(`Expecting header to be provided with the following format "Name: Value", got: ${header}`);
      }
      headers.push({ name: (parts[0] as string).trim(), value });
    }
    const notification_hook: WebNotificationHook = {
      name: args.hook_name,
      target_events,
      type: 'webhook',
      link: flags['link'],
      method: flags['method'] as any,
      post_content_type: flags['post-content-type'] as any,
      headers,
    };
    validateNotificationHookData(notification_hook);
    await this.callModuleMethod('moria0_manager.set-notification-hook', notification_hook);
    return {};
  }
}
