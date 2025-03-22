import VegaCommand, { VegaCommandOptions, selectWalletFlags } from '../../lib/vega-command.js';

export default class WalletTokenDepositAddress extends VegaCommand<typeof WalletTokenDepositAddress> {
  static args = {
  };
  static flags = {
    ...selectWalletFlags(),
  };
  static vega_options: VegaCommandOptions = {
    require_wallet_selection: true,
  };

  static description = 'Get a token deposit address for the given wallet.';

  static examples = [
    `<%= config.bin %> <%= command.id %>`,
  ];

  async run (): Promise<any> {
    const libauth = await import('@cashlab/common/libauth.js');
    const { assertSuccess, lockingBytecodeToCashAddress } = libauth;
    const info = await this.callModuleMethod('wallet.info', this.getSelectedWalletName());
    const network_prefix = info.network === 'mainnet' ? 'bitcoincash' : 'bchtest';
    const address = assertSuccess(lockingBytecodeToCashAddress({
      bytecode: info.main.locking_bytecode,
      prefix: network_prefix,
      tokenSupport: true,
    })).address;
    this.log(address);
    return { address };
  }
}
