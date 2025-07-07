import { Args, Flags } from '@oclif/core';
import VegaCommand, { VegaCommandOptions } from '../../lib/vega-command.js';

export default class GenerateWallet extends VegaCommand<typeof GenerateWallet> {
  static args = {
    name: Args.string({
      name: 'name',
      required: true,
      description: 'A unique name for referencing the wallet once saved.',
    }),
    type: Args.string({
      name: 'type',
      required: true,
      description: 'Type of the wallet.',
      options: ['seed', 'wif'],
    }),
    network: Args.string({
      name: 'network',
      required: true,
      description: "Wallet's target network.",
      options: ['mainnet', 'testnet', 'regtest'],
      default: 'mainnet',
    }),
  };
  static flags = {
    'derivation-path': Flags.string({
      char: 'p',
      helpLabel: '--derivation-path',
      description: "The derivation path for the hd wallet. default = m/44'/0'/0'",
    }),
  };
  static vega_options: VegaCommandOptions = {
  };

  static description = 'generate a wallet';

  static examples = [
    `<%= config.bin %> <%= command.id %> mywallet seed`,
    `<%= config.bin %> <%= command.id %> mywallet wif testnet`,
  ];

  async run (): Promise<any> {
    const { args, flags } = this;
    const wallet_name = args.name;
    const wallet_type = args.type == 'seed' ? 'single-address-seed' : 'wif';
    const network = args.network;
    const wallet_info = await this.callModuleMethod('wallet.info', wallet_name);
    if (wallet_info != null) {
      this.error('A wallet with the following name already exists: ' + wallet_name);
      this.exit(1);
    }
    const params: { derivation_path?: string  } = {};
    if (wallet_type == 'single-address-seed') {
      params.derivation_path = (flags['derivation-path']||"m/44'/0'/0'") + '/0/0'; // zeroth address
    }
    await this.callModuleMethod('wallet.generate', wallet_name, wallet_type, network, params);
    return { name: wallet_name };
  }
}
