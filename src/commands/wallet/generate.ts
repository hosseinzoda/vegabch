import { Args } from '@oclif/core';
import VegaCommand from '../../lib/vega-command.js';
import type { Wallet, WalletTypeEnum, Network } from "mainnet-js";

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
  };

  static description = 'generate a wallet';

  static examples = [
    `<%= config.bin %> <%= command.id %> mywallet seed`,
    `<%= config.bin %> <%= command.id %> mywallet wif testnet`,
  ];

  async run (): Promise<any> {
    const { args } = this;
    const wallet_name = args.name;
    if (await this.walletExists(wallet_name)) {
      this.error('A wallet with the following name already exists: ' + wallet_name);
      this.exit(1);
    }
    const wallet: Wallet = await this.generateWallet(args.type as WalletTypeEnum, args.network as Network)
    this.saveWallet(wallet_name, wallet.toString());
    return { name: wallet_name };
  }
}
