import VegaCommand, { VegaCommandOptions, selectWalletFlags } from '../../lib/vega-command.js';
import type { Wallet } from "mainnet-js";

export default class WalletList extends VegaCommand<typeof WalletList> {
  static args = {
  };
  static flags = {
    ...selectWalletFlags(),
  };
  static vega_options: VegaCommandOptions = {
  };

  static description = 'get list of all wallets.';

  static examples = [
    `<%= config.bin %> <%= command.id %>`,
  ];

  async run (): Promise<any> {
    const pinned_wallet = await this.getPinnedWalletName();
    const wallets_info = await this.getWalletsInfo();
    if (wallets_info.length == 0) {
      this.log('The wallets file is empty!');
    } else {
      for (const winfo of wallets_info) {
        this.log('- ' + winfo.network + ' ' + winfo.type + ': ' + winfo.name + (pinned_wallet == winfo.name ? ' (pinned)' : ''));
      }
    }
    return { wallets_info };
  }
}
