import { Args, Flags } from '@oclif/core';
import VegaCommand, { VegaCommandOptions, selectWalletFlags } from '../../lib/vega-command.js';
import { tradeResultFromJSON, BCMRIndexer, bigIntToDecString, walletP2pkhUtxosToSpendableCoins } from '../../lib/util.js';
import { buildTokensBCMRFromTokensIdentity } from '../../lib/vega-file-storage-provider.js';
import type { Wallet, UtxoI, TokenI } from 'mainnet-js';
import {
  libauth, common as cashlab_common, cauldron,
  PayoutRule, SpendableCoin, TokenId, Fraction, NATIVE_BCH_TOKEN_ID,
  PayoutAmountRuleType, SpendableCoinType, BurnTokenException,
} from 'cashlab'
import type { PoolV0Parameters, PoolV0, TradeResult, TradeTxResult, GenerateChainedTradeTxResult } from 'cashlab/build/cauldron/types.js';
import { readFile, writeFile } from 'node:fs/promises';
import CauldronIndexerRPCClient from '../../lib/cauldron-indexer-rpc-client.js'; 
const { hexToBin, binToHex, privateKeyToP2pkhLockingBytecode } = libauth;

import { applyWalletSettingsToExchangeLab } from '../../lib/cauldron/helpers.js';
import fundTrade, { calcTradeSumList, validateTrade, TradeSumEntry } from '../../lib/cauldron/fund-trade.js';

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
      description: `Broadcast the the trade's transaction, This flag will push the constructed transaction to the network after funding has been satisfied.`,
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
      description: `Burns dust tokens (instead of adding to payout) when enabled & allow-mixed-payout is disabled. Less than 800 sats worth of the token is considered as dust tokens. (The value of the token is based on the trades exchange rate).`,
      default: false,
    }),
  };
  static vega_options: VegaCommandOptions = {
    require_wallet_selection: true,
    require_network_provider: true,
  };

  static description = 'Fund a trade with your wallet.';

  static examples = [
    `<%= config.bin %> <%= command.id %>`,
  ];

  async run (): Promise<any> {
    const { args, flags } = this;
    const wallet: Wallet = this.getSelectedWallet();
    const exlab = new cauldron.ExchangeLab();
    applyWalletSettingsToExchangeLab(exlab, await this.getWalletSettings());
    let trade: TradeResult | undefined = undefined;
    const bcmr_indexer = new BCMRIndexer(buildTokensBCMRFromTokensIdentity(await this.getTokensIdentity()));
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

    // find a set of utxo that will fund the supply side
    // The current impl uses mainnet-js, And mainnet's wallets mainly use p2pkh addresses
    // to lock the coins, Having that, The following uses pkh & its cashaddr from the wallet
    // to construct the locking_bytecode & then retrieves the utxos associated with the addr
    const wallet_info = wallet.getInfo();
    if (wallet_info.privateKey == null) {
      throw new Error('The wallet has no private key!');
    }
    const wallet_private_key = hexToBin(wallet_info.privateKey);
    const utxo_list: UtxoI[] = await wallet.getAddressUtxos(wallet_info.cashaddr);
    const wallet_locking_bytecode = privateKeyToP2pkhLockingBytecode({ privateKey: wallet_private_key, throwErrors: true })
    const input_coins: SpendableCoin[] = walletP2pkhUtxosToSpendableCoins(utxo_list, wallet_locking_bytecode, wallet_private_key);
    const txfee_per_byte: bigint = BigInt(flags['txfee-per-byte']);
    if (txfee_per_byte < 0n) {
      throw new Error('txfee-per-byte should be a positive integer');
    }

    const trade_sum_list: TradeSumEntry[] =  calcTradeSumList(trade);

    validateTrade(trade, trade_sum_list);

    const mkPrepareShouldBurnCall = (callable: (token_id: TokenId, amount: bigint, value_in_bch: bigint) => void): ((token_id: TokenId, amount: bigint) => void)  =>{
      const rate_cache: { [token_id: string]: bigint }  = {};
      const rate_denominator = exlab.getRateDenominator();
      const _getRate = (token_id: TokenId): bigint => {
        if (token_id == NATIVE_BCH_TOKEN_ID) {
          throw new Error(`should never occur!`);
        }
        if (typeof rate_cache[token_id] == 'bigint') {
          return rate_cache[token_id] as bigint;
        }
        let rate: bigint | undefined;
        { // when it supplies the token_id
          const trade_sum_entry = trade_sum_list.find((a) => a.supply_token_id == token_id);
          if (trade_sum_entry != null) {
            rate = trade_sum_entry.demand * rate_denominator / trade_sum_entry.supply;
          }
        }
        { // when it demands the token_id
          const trade_sum_entry = trade_sum_list.find((a) => a.demand_token_id == token_id);
          if (trade_sum_entry != null) {
            rate = trade_sum_entry.supply * rate_denominator / trade_sum_entry.demand;
          }
        }
        if (typeof rate == 'bigint') {
          return rate_cache[token_id] = rate;
        }
        throw new Error('Unknown token!!, token_id: ' + token_id);
      };
      return (token_id: TokenId, amount: bigint): void => {
        if (token_id == NATIVE_BCH_TOKEN_ID) {
          callable(token_id, amount, amount);
        } else {
          const rate = _getRate(token_id)
          callable(token_id, amount, amount * rate / rate_denominator);
        }
      };
    };
    const payout_rules: PayoutRule[] = [
      {
        type: PayoutAmountRuleType.CHANGE,
        allow_mixing_native_and_token: !!flags['allow-mixed-payout'],
        locking_bytecode: wallet_locking_bytecode,
        spending_parameters: {
          type: SpendableCoinType.P2PKH,
          key: wallet_private_key,
        },
        // @ts-ignore
        shouldBurn: mkPrepareShouldBurnCall((token_id: TokenId, amount: bigint, value_in_bch: bigint): void => {
          if (token_id != NATIVE_BCH_TOKEN_ID && flags['burn-dust-tokens'] && value_in_bch < DEFAULT_DUST_TOKEN_MIN_IN_BCH) {
            throw new BurnTokenException();
          }
        }),
      },
    ];

    const result = await fundTrade(exlab, trade, input_coins, payout_rules, txfee_per_byte, { verify_transactions: true });

    this.log('Pools count: ' + trade.entries.length);
    this.log('Input coins:');
    for (const input_coin of result.input_coins) {
      this.log(`- ${input_coin.outpoint.txhash}:${input_coin.outpoint.index}`);
      this.log(`   contains ${input_coin.output.amount} sats` + (input_coin.output.token ? ` & has tokens, token_id: ${input_coin.output.token.token_id}, amount: ${input_coin.output.token.amount}` : ''));
    }
    this.log('Transactions: ');
    let counter = 0;
    for (const item of result.transactions) {
      const trade_tx = item.trade_tx;
      this.log('- tx: #' + (counter + 1));
      this.log(`- txid: ${item.txhash}`);
      this.log(`- txsize: ${item.txbin_size}`);
      this.log(`- txfee: ${item.txfee}`);
      if (trade_tx.token_burns.length > 0) {
        this.log('- **** BURNS ****');
        for (const entry of trade_tx.token_burns) {
          const token_info = (entry.token_id != NATIVE_BCH_TOKEN_ID ? bcmr_indexer.getTokenCurrentIdentity(entry.token_id)?.token : null) || null;
          const symbol = token_info == null ? entry.token_id : token_info.symbol;
          const decimals = (token_info == null ? null : token_info.decimals) || 0;
          const amount = bigIntToDecString(entry.amount, decimals);
          this.log(`  + ${symbol}: ${amount},  decimals: ${decimals}`);
        }
      }
      this.log('- Payouts:');
      for (const { index, output } of trade_tx.payouts_info) {
        this.log(`  + output index: ${index}`);
        this.log(`  + locking bytecode: ${binToHex(output.locking_bytecode)}`);
        this.log(`    contains ${output.amount} sats` + (output.token ? ` & has tokens, token_id: ${output.token.token_id}, amount: ${output.token.amount}` : ''));
      }
      this.log('');
      counter++;
    }
    if (flags.broadcast) {
      let counter = 0;
      for (const { trade_tx } of result.transactions) {
        await wallet.submitTransaction(trade_tx.txbin, true);
        this.log(`Transaction #${counter+1} sent!`);
        if (++counter < result.transactions.length) {
          // send the next transaction with some delay
          ;await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
    }
    // exclude trade_tx from the result that will be returned as json data
    for (const item of result.transactions) {
      delete (item as any).trade_tx;
    }

    if (flags.txoutput && flags.txoutput != '-') {
      await writeFile(flags.txoutput, JSON.stringify(result, null, 2));
    }

    return result;
  }
}


