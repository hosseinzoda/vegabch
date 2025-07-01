import { Args } from '@oclif/core';
import VegaCommand, { VegaCommandOptions } from '../../lib/vega-command.js';
import { fractionAsReadableText } from '../../lib/util.js';
import type { Moria1WalletSettings } from '../../lib/main/moria1/types.js';
import { simpleJsonSerializer } from '@cashlab/common/util.js';

export default class Moria1PrintWalletSettings extends VegaCommand<typeof Moria1PrintWalletSettings> {
  static args = {
    wallet_name: Args.string({
      name: 'wallet_name',
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
    `<%= config.bin %> <%= command.id %> <wallet_name>`,
  ];

  async run (): Promise<any> {
    const { args } = this;
    const settings: Moria1WalletSettings | null = await this.callModuleMethod('moria1.get-wallet-settings', args.wallet_name);
    if (settings == null) {
      this.log('NULL');
    } else {
      this.log(`enabled = ${settings.enabled ? 'true' : 'false'}`);
      if (settings.auto_withdraw_from_agent_p2nfth != null) {
        this.log(`auto_withdraw_from_agent_p2nfth ==>`);
        this.log(`    enabled = ${settings.auto_withdraw_from_agent_p2nfth.enabled ? 'true' : 'false'}`);
        this.log(`    txfee_per_byte = ${fractionAsReadableText(settings.auto_withdraw_from_agent_p2nfth.txfee_per_byte, 2)}`);
        this.log(`==|`);
      }
    }
    return settings;
  }
}
