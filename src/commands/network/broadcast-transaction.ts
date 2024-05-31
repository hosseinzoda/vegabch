import { Args } from '@oclif/core';
import VegaCommand, { VegaCommandOptions } from '../../lib/vega-command.js';
import type { Network } from 'mainnet-js';

export default class BroadcastTransaction extends VegaCommand<typeof BroadcastTransaction> {
  static args = {
    transaction: Args.string({
      name: 'transaction',
      required: true,
      description: `A hexstring representation of the transaction.`,
    }),
    network: Args.string({
      name: 'network',
      required: true,
      description: "Target network.",
      options: ['mainnet', 'testnet', 'regtest'],
      default: 'mainnet',
    }),
  };
  static flags = {
  };
  static vega_options: VegaCommandOptions = {
    require_wallet_selection: false,
    require_network_provider: true,
  };

  static description = 'Broadcast the transaction.';

  static examples = [
    `<%= config.bin %> <%= command.id %>`,
  ];

  async run (): Promise<any> {
    const { args } = this;
    const network_provider = await this.getNetworkProvider(args.network as Network);
    const txhash = await network_provider.sendRawTransaction(args.transaction, true);
    this.log(`txhash: ${txhash}`)
    return { hash: txhash };
  }
}

