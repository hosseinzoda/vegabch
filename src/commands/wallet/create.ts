import { Args, Flags } from '@oclif/core';
import VegaCommand, { VegaCommandOptions } from '../../lib/vega-command.js';
import { getWalletClassByTypeAndNetwork } from '../../lib/util.js';
import type { Wallet } from "mainnet-js";


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
      description: "HD Derivation path to use. Format example: m/44'/145'/0'",
    }),
    secret: Flags.string({
      char: 's',
      helpLabel: '--secret',
      description: "Wallet's private key represented as wallet import format (wif).",
    }),
  };
  static vega_options: VegaCommandOptions = {
    require_mainnet: true,
  };

  static description = 'create a wallet';

  static examples = [
    `<%= config.bin %> <%= command.id %> mywallet seed --mnemonic '<12 words>' --derivation-path "m/44'/0'/0'"`,
    `<%= config.bin %> <%= command.id %> mywallet seed mainnet --mnemonic '<12 words>'`,
    `<%= config.bin %> <%= command.id %> mywallet wif --secret '<the wif secret>'`,
  ];

  async run (): Promise<any> {
    const { args, flags } = this;
    const wallet_name = args.name;
    if (await this.walletExists(wallet_name)) {
      this.error('A wallet with the following name already exists: ' + wallet_name);
      this.exit(1);
    }
    const wallet_type = args.type;
    const network = args.network;
    const wallet_class: typeof Wallet = await getWalletClassByTypeAndNetwork(wallet_type, network);
    let wallet: Wallet;
    if (wallet_type == 'seed') {
      if (flags.secret) {
        this.error('Use of --secret is not accepted on creation of seed wallet.')
        this.exit(1)
      }
      if (!flags.mnemonic) {
        this.error('--mnemonic is required!, use --help to learn more.')
        this.exit(1)
      }
      wallet = await wallet_class.fromSeed(flags.mnemonic, flags['derivation-path']);
    } else  if (wallet_type == 'wif') {
      if (flags.mnemonic || flags['derivation-path']) {
        this.error('Use of --mnemonic & --derivation-path is not accepted on creation of wif wallet.')
        this.exit(1)
      }
      if (!flags.secret) {
        this.error('--secret is required!, use --help to learn more.')
        this.exit(1)
      }
      wallet = await wallet_class.fromWIF(flags.secret);
    } else {
      throw new Error('Unknown type: ' + wallet_type);
    }
    this.saveWallet(wallet_name, wallet.toString());
    return { name: wallet_name };
  }
}
