import { Args, Flags } from '@oclif/core';
import VegaCommand, { VegaCommandOptions, selectWalletFlags } from '../../lib/vega-command.js';
import {
  tradeResultFromJSON, BCMRIndexer, bigIntToDecString, buildTokensBCMRFromTokensIdentity,
} from '../../lib/util.js';
import type { TokensIdentity } from '../../lib/main/vega-file-storage-provider.js';
import { NATIVE_BCH_TOKEN_ID } from '@cashlab/common/constants.js';
import type { TradeResult } from '@cashlab/cauldron/types.js';
import { readFile, writeFile } from 'node:fs/promises';

const DEFAULT_DUST_TOKEN_MIN_IN_BCH = 100n;

export default class CauldronFundTrade extends VegaCommand<typeof CauldronFundTrade> {
  static args = {
    trade_file: Args.string({
      name: 'trade_file',
      required: true,
      description: `A path to a file contianing the trade, or pass "-" (minus sign) and send the trade (represented in json format) via stdin.`,
      ignoreStdin: true,
    }),
  };
  static flags = {
    ...selectWalletFlags(),
    'txfee-per-byte': Flags.string({
      description: 'Specify the txfee per byte in sats, By default the suggested tx fee will be used.',
      required: true,
      default: '1',
    }),
    'broadcast': Flags.boolean({
      description: `Broadcast the trade's transaction, This flag will push the constructed transaction to the network after funding has been satisfied.`,
    }),
    txoutput: Flags.string({
      required: false,
      description: `Will write the funded trade transaction in the txoutput. By default the transaction will be written to stdout if --json is enabled.`,
      allowStdin: false,
    }),
    'allow-mixed-payout': Flags.boolean({
      description: `An output in BCH can contain the native bch & a token. Enabling this will allow the payout to mix a token payout and the bch payout in one output.`,
      default: false,
    }),
    'burn-dust-tokens': Flags.boolean({
      description: `Burns dust tokens (instead of adding to payout) when enabled & allow-mixed-payout is disabled. Less than 100 sats worth of the token is considered as dust tokens. (The value of the token is based on the trades exchange rate).`,
      default: false,
    }),
  };
  static vega_options: VegaCommandOptions = {
    require_wallet_selection: true,
  };

  static description = 'Fund a trade with your wallet.';

  static examples = [
    `<%= config.bin %> <%= command.id %>`,
  ];

  async run (): Promise<any> {
    const { args, flags } = this;
    const wallet_name = this.getSelectedWalletName();
    const wallet_info = await this.callModuleMethod('wallet.info', wallet_name);
    if (wallet_info == null) {
      this.error('Wallet name does not exist: ' + wallet_name);
      this.exit(1);
    }
    if (!(await this.callModuleMethod('network.is_network_available', wallet_info.network))) {
      throw new Error('network is not available, network_name: ' + wallet_info.network);
    }
    const tokens_identity: TokensIdentity = await this.callModuleMethod('vega_storage.get_tokens_identity');
    const bcmr_indexer = new BCMRIndexer(buildTokensBCMRFromTokensIdentity(tokens_identity));

    let trade: TradeResult | undefined = undefined;
    { // parse trade guard
      let trade_json = '';
      if (args.trade_file == '-') {
        trade_json = await (new Promise<string>((resolve, reject) => {
          process.stdin.on('error', reject);
          let chunks: Buffer[] = [];
          process.stdin.on('data', (chunk) => chunks.push(chunk));
          process.stdin.on('end', () => {
            resolve(Buffer.concat(chunks).toString('utf8'));
          });
          process.stdin.resume();
        }));
      } else {
        trade_json = (await readFile(args.trade_file)).toString('utf8');
      }
      const trade_json_data = JSON.parse(trade_json)
      if (trade_json_data.error) {
        throw new Error(`Input trade json contains an error: (${trade_json_data.error.name}) ${trade_json_data.error.message}`);
      }
      trade = tradeResultFromJSON(trade_json_data);
    }

    const txfee_per_byte: bigint = BigInt(flags['txfee-per-byte']);
    if (txfee_per_byte < 0n) {
      throw new Error('txfee-per-byte should be a positive integer');
    }
    const { result, broadcast_result } = await this.callModuleMethod('cauldron.fund-trade', wallet_name, trade, txfee_per_byte, { allow_mixed_payout: flags['allow-mixed-payout'], broadcast: flags.broadcast });

    this.log('Pools count: ' + trade.entries.length);
    this.log('Input coins:');
    for (const input_coin of result.input_coins) {
      this.log(`- ${input_coin.outpoint.txhash}:${input_coin.outpoint.index}`);
      this.log(`   contains ${input_coin.output.amount} sats` + (input_coin.output.token ? ` & has tokens, token_id: ${input_coin.output.token.token_id}, amount: ${input_coin.output.token.amount}` : ''));
    }
    this.log('Transactions: ');
    {
      let counter = 0;
      for (const item of result.transactions) {
        this.log('- tx: #' + (counter + 1));
        this.log(`- txid: ${item.txhash}`);
        this.log(`- txsize: ${item.txbin_size}`);
        this.log(`- txfee: ${item.txfee}`);
        if (item.token_burns.length > 0) {
          this.log('- **** BURNS ****');
          for (const entry of item.token_burns) {
            const token_info = (entry.token_id != NATIVE_BCH_TOKEN_ID ? bcmr_indexer.getTokenCurrentIdentity(entry.token_id)?.token : null) || null;
            const symbol = token_info == null ? entry.token_id : token_info.symbol;
            const decimals = (token_info == null ? null : token_info.decimals) || 0;
            const amount = bigIntToDecString(BigInt(entry.amount), decimals);
            this.log(`  + ${symbol}: ${amount},  decimals: ${decimals}`);
          }
        }
        this.log('- Payouts:');
        for (const { index, output } of item.payouts_info) {
          this.log(`  + output index: ${index}`);
          this.log(`  + locking bytecode: ${output.locking_bytecode}`);
          this.log(`    contains ${output.amount} sats` + (output.token ? ` & has tokens, token_id: ${output.token.token_id}, amount: ${output.token.amount}` : ''));
        }
        this.log('');
        counter++;
      }
    }
    this.log('');
    if (broadcast_result && broadcast_result.error) {
      this.log('Broadcast failed, ' + broadcast_result.error.message);
    } else if (broadcast_result) {
      let counter = 0;
      for (const { txhash } of broadcast_result.items) {
        this.log(`Transaction #${counter+1} sent, txhash: ${txhash}`);
        counter++;
      }
    }
    if (flags.txoutput && flags.txoutput != '-') {
      await writeFile(flags.txoutput, JSON.stringify(result, null, 2));
    }
    return result;
  }
}
