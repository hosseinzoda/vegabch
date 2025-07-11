import { Args, Flags } from '@oclif/core';
import VegaCommand, { VegaCommandOptions } from '../../lib/vega-command.js';
import {
  convertTradeResultToJSON, fractionToDecString, BCMRIndexer, resolveArgRefTokenAToken,
  getNativeBCHTokenInfo, bigIntToDecString, bigIntFromDecString, buildTokensBCMRFromTokensIdentity,
} from '../../lib/util.js';
import type { TokenId } from '@cashlab/common';
import { NATIVE_BCH_TOKEN_ID } from '@cashlab/common/constants.js';
import { writeFile } from 'node:fs/promises';
import type { TokensIdentity } from '../../lib/main/vega-file-storage-provider.js';

export default class CauldronConstructTrade extends VegaCommand<typeof CauldronConstructTrade> {
  static args = {
    supply_token: Args.string({
      name: 'supply-token',
      required: true,
      description: 'The token to offer for the trade, Expecting a token id or "BCH" for the native token.',
    }),
    demand_token: Args.string({
      name: 'demand-token',
      required: true,
      description: 'The token to request as the result of the trade, Expecting a token id or "BCH" for the native token.',
    }),
    amount: Args.string({
      name: 'amount',
      required: true,
      description: "Amount of tokens to acquire, Expecting an integer.",
    }),
    output: Args.string({
      name: 'output',
      required: false,
      description: "The trade output file, By default the output will be written to stdout if --json is enabled.",
    }),
  };
  static flags = {
    'target-demand': Flags.boolean({
      description: 'The amount provided is target demand when this flag is enabled. (Enabled by default)',
      required: false,
      default: undefined,
    }),
    'target-supply': Flags.boolean({
      description: 'The amount provided is target supply when this flag is enabled.',
      required: false,
      default: undefined,
    }),
    'decimal-amounts': Flags.boolean({
      description: `Read/Write amounts as a decimal number, Using token's defined decimals (example: BCH has 8 decimals)`,
      default: false,
    }),
    'txfee-per-byte': Flags.string({
      description: 'Specify the txfee per byte in sats, By default the suggested tx fee will be used.',
      required: true,
      default: '1',
    }),
  };
  static vega_options: VegaCommandOptions = {
  };

  static description = `construct a cauldron trade, Uses multiple pools to acquire a target amount at the best rate. When the target is demand, The trade's demand will be equal or slightly greater than the given amount. And when the target is supply, The trade's supply will be equal or slightly less than the given amount.`;

  static examples = [
    `<%= config.bin %> <%= command.id %>`,
  ];

  async run (): Promise<any> {
    const { args, flags } = this;
    if (flags['target-demand'] == null && flags['target-supply'] == null) {
      flags['target-demand'] = true;
    }
    if (flags['target-demand'] && flags['target-supply']) {
      throw new Error('Only one of the following flags can be enabled: (' + ['target-demand', 'target-supply'].join(', ') + ')');
    }
    if (!flags['target-demand'] && !flags['target-supply']) {
      throw new Error('One of the following flags should be enabled: (' + ['target-demand', 'target-supply'].join(', ') + ')');
    }
    const decimal_amounts_enabled = flags['decimal-amounts'];
    const tokens_identity: TokensIdentity = await this.callModuleMethod('vega_storage.get_tokens_identity');
    const bcmr_indexer = new BCMRIndexer(buildTokensBCMRFromTokensIdentity(tokens_identity));
    const supply_token_id: TokenId = resolveArgRefTokenAToken(args.supply_token, bcmr_indexer);
    const demand_token_id: TokenId = resolveArgRefTokenAToken(args.demand_token, bcmr_indexer);
    if (supply_token_id == demand_token_id) {
      throw new Error('supply_token should not be equal to demand_token');
    }
    if (args.supply_token != NATIVE_BCH_TOKEN_ID && args.demand_token != NATIVE_BCH_TOKEN_ID) {
      throw new Error('Can only perform trades with native BCH as one side of the trade.');
    }

    const supply_token_identity = supply_token_id != NATIVE_BCH_TOKEN_ID ? bcmr_indexer.getTokenCurrentIdentity(supply_token_id) : null;
    const supply_token_info = supply_token_id == NATIVE_BCH_TOKEN_ID  ? getNativeBCHTokenInfo() : supply_token_identity?.token;

    const demand_token_identity = demand_token_id != NATIVE_BCH_TOKEN_ID ? bcmr_indexer.getTokenCurrentIdentity(demand_token_id) : null;
    const demand_token_info = demand_token_id == NATIVE_BCH_TOKEN_ID  ? getNativeBCHTokenInfo() : demand_token_identity?.token;

    const supply_decimals = supply_token_info?.decimals != null && supply_token_info.decimals > 0 ? supply_token_info.decimals : 0;
    const demand_decimals = demand_token_info?.decimals != null && demand_token_info.decimals > 0 ? demand_token_info.decimals : 0;


    let txfee_per_byte: bigint = BigInt(flags['txfee-per-byte'])
    if (txfee_per_byte < 0n) {
      throw new Error('txfee-per-byte should be a positive integer');
    }

    let amount: bigint|null = null;
    if (decimal_amounts_enabled) {
      amount = bigIntFromDecString(args.amount, flags['target-demand'] ? demand_decimals : supply_decimals);
    } else {
      try {
        amount = BigInt(args.amount);
      } catch (err) {
        throw new Error('Expecting amount to be an integer, got: ' + args.amount, { cause: err });
      }
    }
    if (amount <= 0n) {
      throw new Error('Expecting amount to be greater than zero, got: ' + amount);
    }

    const { result, build_duration } = await this.callModuleMethod('cauldron.construct-trade', supply_token_id, demand_token_id, flags['target-demand'] ? 'demand': 'supply', amount, txfee_per_byte);

    this.log('Summary');
    this.log(` Build duration: ${build_duration}`);
    this.log(` Pool count: ${result.entries.length}`);
    this.log(' Supply:: ' + [
      (supply_token_info ? `(${supply_token_info.symbol})` : null),
      (decimal_amounts_enabled ? `Defined decimals: ${supply_decimals}` : null),
      `Token Id: ${supply_token_id}`
    ].filter((a) => a != null).join(', '));
    this.log(' Demand:: ' + [
      (demand_token_info ? `(${demand_token_info.symbol})` : null),
      (decimal_amounts_enabled ? `Defined decimals: ${demand_decimals}` : null),
      `Token Id: ${demand_token_id}`
    ].filter((a) => a != null).join(', '));
    this.log(' Supply: ' + (decimal_amounts_enabled ? bigIntToDecString(result.summary.supply, supply_decimals) : result.summary.supply));
    this.log(' Demand: ' + (decimal_amounts_enabled ? bigIntToDecString(result.summary.demand, demand_decimals) : result.summary.demand));
    const bch_token_info = getNativeBCHTokenInfo();
    this.log(' Trade fee: ' + bigIntToDecString(result.summary.trade_fee, bch_token_info.decimals) + ' ' + bch_token_info.symbol);
    this.log(' Rate: ' + fractionToDecString(result.summary.rate, 10));
    this.log('');
    this.log(`The trade fee is included in the supply & demand, DO NOT deduct/add trade fee with supply or demand`);
    const result_json: any = convertTradeResultToJSON(result);
    if (args.output && args.output != '-') {
      await writeFile(args.output, JSON.stringify(result_json, null, 2));
    }
    return result_json;
  }
}
