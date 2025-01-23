import VegaCommand, { VegaCommandOptions, selectWalletFlags } from '../../lib/vega-command.js';
import { BCMRIndexer, getNativeBCHTokenInfo, bigIntToDecString } from '../../lib/util.js';

export default class WalletBalance extends VegaCommand<typeof WalletBalance> {
  static args = {
  };
  static flags = {
    ...selectWalletFlags(),
  };
  static vega_options: VegaCommandOptions = {
    require_wallet_selection: true,
  };

  static description = 'view a balance of all tokens.';

  static examples = [
    `<%= config.bin %> <%= command.id %>`,
  ];

  async run (): Promise<any> {
    const wallet_name = this.getSelectedWalletName();
    const wallet_info = await this.callModuleMethod('wallet.info', wallet_name);
    if (wallet_info == null) {
      this.error('Wallet name does not exist: ' + wallet_name);
      this.exit(1);
    }
    if (!(await this.callModuleMethod('network.is_network_available', wallet_info.network))) {
      throw new Error('network is not available, network_name: ' + wallet_info.network);
    }
    const entries = await this.callModuleMethod('wallet.balance', wallet_name);
    // balance
    this.log(`****** Balance summary ******`);
    for (const entry of entries) {
      const { symbol, amount } = entry.summary_readable;
      this.log(`${symbol}: ${amount}`);
    }
    this.log(`****** *************** ******`);
    // confirmed balance
    this.log(`****** Confirmed balance ******`);
    for (const entry of entries) {
      const { symbol, amount } = entry.confirmed_readable;
      this.log(`${symbol}: ${amount}`);
    }
    this.log(`****** **************** *******`);
    // unconfirmed balance
    this.log(`****** Unconfirmed balance ******`);
    for (const entry of entries) {
      const { symbol, amount } = entry.unconfirmed_readable;
      this.log(`${symbol}: ${amount}`);
    }
    this.log(`****** **************** *******`);
    return { result: entries };
  }
}
