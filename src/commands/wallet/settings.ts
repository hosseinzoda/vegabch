import { Args, Flags } from '@oclif/core';
import VegaCommand, { VegaCommandOptions, selectWalletFlags } from '../../lib/vega-command.js';
import type { Wallet, WalletTypeEnum, Network } from "mainnet-js";

export default class GetWalletSetting extends VegaCommand<typeof GetWalletSetting> {
  static args = {
    name: Args.string({
      name: 'name',
      required: false,
      description: 'name',
      ignoreStdin: true,
    }),
  };
  static flags = {
    ...selectWalletFlags(),
    set: Flags.string({
      helpLabel: '--set',
      description: "Add/Modify a setting.",
    }),
    delete: Flags.boolean({
      helpLabel: '--delete',
      description: "Remove a setting.",
    }),
  };
  static vega_options: VegaCommandOptions = {
    require_wallet_selection: true,
    require_network_provider: false,
  };

  static description = 'get/set/delete wallet settings';

  static examples = [
    `<%= config.bin %> <%= command.id %>`,
    `<%= config.bin %> <%= command.id %> name`,
    `<%= config.bin %> <%= command.id %> name --set <value>`,
    `<%= config.bin %> <%= command.id %> name --delete`,
  ];

  async run (): Promise<any> {
    const { args, flags } = this;
    const settings = await this.getWalletSettings();
    const name = args.name;
    const output: any = { result: null };

    if (flags['set']) {
      if (name == null) {
        throw new Error('The setting name is required for the set function.')
      }
      const value = flags['set'];
      settings[name] = value;
      await this.storeWalletSettings(settings);
    } else if (flags['delete']) {
      if (name == null) {
        throw new Error('The setting name is required for the delete function.')
      }
      delete settings[name];
      await this.storeWalletSettings(settings);
    } else {
      // print settings
      if (name == null) {
        for (const [ name, value ] of Object.entries(settings)) {
          this.log(`${name} = ${value}`);
        }
        output.result = settings;
      } else {
        this.log(settings[name] || '');
        output.result = settings[name] || null;
      }
    }

    return output;
  }
}
