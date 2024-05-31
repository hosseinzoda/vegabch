import { Args, Flags } from '@oclif/core';
import VegaCommand, { VegaCommandOptions } from '../../lib/vega-command.js';
import { convertTradeResultToJSON, fractionToDecString, BCMRIndexer, resolveArgRefTokenAToken, getNativeBCHTokenInfo, bigIntToDecString, bigIntFromDecString } from '../../lib/util.js';
import { libauth, cauldron, TokenId, NATIVE_BCH_TOKEN_ID, Fraction } from 'cashlab';
import type { PoolV0Parameters, PoolV0, TradeResult, TradeTxResult } from 'cashlab/build/cauldron/types.js';
import { writeFile } from 'node:fs/promises';
import CauldronIndexerRPCClient from '../../lib/cauldron-indexer-rpc-client.js'; 
const { hexToBin, binToHex } = libauth;
import { buildTokensBCMRFromTokensIdentity } from '../../lib/vega-file-storage-provider.js';

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
    demand_amount: Args.string({
      name: 'demand-amount',
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
    'cauldron-indexer-endpoint': Flags.string({
      description: 'A url to the cauldron contracts indexer. CAULDRON_INDEXER_ENDPOINT environment variable can also be used to set it.',
      env: 'CAULDRON_INDEXER_ENDPOINT',
      required: true,
    }),
    'decimal-amounts': Flags.boolean({
      description: 'Use the defined decimals when displaying (excluding json outputs) & taking an amount as arguments.',
      env: 'CAULDRON_INDEXER_ENDPOINT',
      default: false,
    }),
  };
  static vega_options: VegaCommandOptions = {
    require_wallet_selection: false,
    require_network_provider: false,
  };

  static description = 'construct a cauldron trade, Uses multiple pools to acquire a target amount at the best rate. The trade demand will be equal or slightly greater than given demand-amount. The trade fee is deducted from trade demand if the BCH is demanded, In this case, To have a transaction with the demand amount to spend, the trade fee should be supplied.';

  static examples = [
    `<%= config.bin %> <%= command.id %>`,
  ];

  async run (): Promise<any> {
    const { args, flags } = this;
    const decimal_amounts_enabled = flags['decimal-amounts'];
    const bcmr_indexer = new BCMRIndexer(buildTokensBCMRFromTokensIdentity(await this.getTokensIdentity()));
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

    const exlab = new cauldron.ExchangeLab();
    let demand_amount: bigint;
    try {
      if (decimal_amounts_enabled) {
        demand_amount = bigIntFromDecString(args.demand_amount, demand_decimals);
      } else {
        demand_amount = BigInt(args.demand_amount);
      }
    } catch (err) {
      throw new Error('Expecting demand_amount to be an integer, got: ' + args.demand_amount);
    }
    if (demand_amount <= 0) {
      throw new Error('Expecting demand_amount to be greater than zero, got: ' + demand_amount);
    } 
    const indexer_client = new CauldronIndexerRPCClient(flags['cauldron-indexer-endpoint']);
    const non_native_token_id = supply_token_id == NATIVE_BCH_TOKEN_ID ? demand_token_id : supply_token_id;
    const indexed_pools = await indexer_client.getActivePoolsForToken(non_native_token_id);
    const input_pools: PoolV0[] = [];
    for (const indexed_pool of indexed_pools.active) {
      const pool_params: PoolV0Parameters = {
        withdraw_pubkey_hash: hexToBin(indexed_pool.owner_pkh),
      };
      // reconstruct pool's locking bytecode
      const locking_bytecode = exlab.generatePoolV0LockingBytecode(pool_params);
      const pool: PoolV0 = {
        version: '0',
        parameters: pool_params,
        outpoint: {
          index: indexed_pool.tx_pos,
          txhash: hexToBin(indexed_pool.txid),
        },
        output: {
          locking_bytecode,
          token: {
            amount: BigInt(indexed_pool.tokens),
            token_id: indexed_pool.token_id,
          },
          amount: BigInt(indexed_pool.sats),
        },
      };
      input_pools.push(pool);
    }
    const result: TradeResult = exlab.constractTradeBestRateForTargetAmount(supply_token_id, demand_token_id, demand_amount, input_pools);
    this.log('Summary');
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
    this.log(' Trade fee: ' + result.summary.trade_fee);
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
