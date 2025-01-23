import { Args } from '@oclif/core';
import VegaCommand, { VegaCommandOptions } from '../../lib/vega-command.js';

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
  };

  static description = 'Broadcast the transaction.';

  static examples = [
    `<%= config.bin %> <%= command.id %>`,
  ];

  async run (): Promise<any> {
    const { args } = this;
    if (!(await this.callModuleMethod('network.is_network_available', args.network))) {
      throw new Error('network is not available, network_name: ' + args.network);
    }
    const { txhash } = await this.callModuleMethod('network.broadcast_transaction', args.transaction, true);
    this.log(`txhash: ${txhash}`)
    return { hash: txhash };
  }
}

