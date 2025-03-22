import { Args, Flags } from '@oclif/core';
import VegaCommand, { VegaCommandOptions } from '../../lib/vega-command.js';

export default class CreateWallet extends VegaCommand<typeof CreateWallet> {
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
    mnemonic: Flags.string({
      char: 'm',
      helpLabel: '--mnemonic',
      description: "Wallet's mnemonic words, hd wallet's private key represented as mnemonic words.",
    }),
    'derivation-path': Flags.string({
      char: 'p',
      helpLabel: '--derivation-path',
      description: "Wallet's mnemonic words, hd wallet's private key represented as mnemonic words.",
    }),
    secret: Flags.string({
      char: 's',
      helpLabel: '--secret',
      description: "Wallet's private key represented as wallet import format (wif).",
    }),
  };
  static vega_options: VegaCommandOptions = {
  };

  static description = 'create a wallet';

  static examples = [
    `<%= config.bin %> <%= command.id %> mywallet seed --mnemonic '<12 words>' --derivation-path "m/44'/0'/0'"`,
    `<%= config.bin %> <%= command.id %> mywallet seed mainnet --mnemonic '<12 words>'`,
    `<%= config.bin %> <%= command.id %> mywallet wif --secret '<the wif secret>'`,
  ];

  async run (): Promise<any> {
    const libauth = await import('@cashlab/common/libauth.js');
    const { assertSuccess, decodePrivateKeyWif } = libauth;
    const { args, flags } = this;
    const wallet_name = args.name;
    const wallet_info = await this.callModuleMethod('wallet.info', wallet_name);
    if (wallet_info != null) {
      this.error('A wallet with the following name already exists: ' + wallet_name);
      this.exit(1);
    }
    const wallet_type = args.type == 'seed' ? 'single-address-seed' : 'wif';
    const network = args.network;
    const params: any = {};
    if (wallet_type == 'single-address-seed') {
      if (flags.secret) {
        this.error('Use of --secret is not accepted on creation of seed wallet.')
        this.exit(1)
      }
      if (!flags.mnemonic) {
        this.error('--mnemonic is required!, use --help to learn more.')
        this.exit(1)
      }
      params.seed_phrase = flags.mnemonic;
      params.derivation_path = flags['derivation-path'];
    } else  if (wallet_type == 'wif') {
      if (flags.mnemonic || flags['derivation-path']) {
        this.error('Use of --mnemonic & --derivation-path is not accepted on creation of wif wallet.')
        this.exit(1)
      }
      if (!flags.secret) {
        this.error('--secret is required!, use --help to learn more.')
        this.exit(1)
      }
      params.private_key = assertSuccess(decodePrivateKeyWif(flags.secret)).privateKey;
    } else {
      throw new Error('Unknown type: ' + wallet_type);
    }
    await this.callModuleMethod('wallet.create', wallet_name, wallet_type, network, params);
    return { name: wallet_name };
  }
}
