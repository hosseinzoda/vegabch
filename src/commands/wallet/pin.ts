import { Args } from '@oclif/core';
import VegaCommand from '../../lib/vega-command.js';

export default class PinWallet extends VegaCommand<typeof PinWallet> {
  static args = {
    name: Args.string({
      name: 'name',
      required: true,
      description: 'the wallet name to pin.',
      ignoreStdin: true,
    }),
  };
  static flags = {
  };

  static description = 'pin a wallet';

  static examples = [
    `<%= config.bin %> <%= command.id %> mywallet`,
  ];

  async run (): Promise<void> {
    const { args } = this;
    const wallet_name = args.name;
    const wallet_info = await this.callModuleMethod('wallet.info', wallet_name);
    if (wallet_info == null) {
      this.error('Wallet name does not exist: ' + wallet_name);
      this.exit(1);
    }
    await this.callModuleMethod('wallet.pin_wallet', wallet_name);
  }
}
