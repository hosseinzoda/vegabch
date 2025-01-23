import VegaCommand from '../../lib/vega-command.js';

export default class UnpinWallet extends VegaCommand<typeof UnpinWallet> {
  static args = {
  };
  static flags = {
  };

  static description = 'unpin the pinned wallet.';

  static examples = [
    `<%= config.bin %> <%= command.id %>`,
  ];

  async run (): Promise<void> {
    await this.callModuleMethod('wallet.pin_wallet', undefined);
  }
}
