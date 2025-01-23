import VegaCommand, { VegaCommandOptions } from '../../lib/vega-command.js';

export default class WalletList extends VegaCommand<typeof WalletList> {
  static args = {
  };
  static flags = {
  };
  static vega_options: VegaCommandOptions = {
  };

  static description = 'get list of all wallets.';

  static examples = [
    `<%= config.bin %> <%= command.id %>`,
  ];

  async run (): Promise<any> {
    const items = await this.callModuleMethod('wallet.list');
    const pinned_wallet_name = await this.callModuleMethod('wallet.pinned_wallet');
    if (items.length == 0) {
      this.log('The wallets file is empty!');
    } else {
      for (const item of items) {
        this.log('- ' + item.network + ' ' + item.type + ': ' + item.name + (pinned_wallet_name == item.name ? ' (pinned)' : ''));
      }
    }
    return { items };
  }
}
