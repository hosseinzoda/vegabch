import VegaCommand, { VegaCommandOptions, selectWalletFlags } from '../../lib/vega-command.js';
import type { Wallet, UtxoI, TokenI } from "mainnet-js";

export default class WalletBCHDepositAddress extends VegaCommand<typeof WalletBCHDepositAddress> {
  static args = {
  };
  static flags = {
    ...selectWalletFlags(),
  };
  static vega_options: VegaCommandOptions = {
    require_wallet_selection: true,
    require_network_provider: false,
  };

  static description = 'Get a bch deposit address for the given wallet.';

  static examples = [
    `<%= config.bin %> <%= command.id %>`,
  ];

  async run (): Promise<any> {
    const wallet: Wallet = this.getSelectedWallet();
    const address = wallet.getDepositAddress();
    this.log(address);
    return { address };
  }
}
