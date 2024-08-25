import { Args, Flags } from '@oclif/core';
import VegaCommand, { VegaCommandOptions, selectWalletFlags } from '../../lib/vega-command.js';
import { tradeResultFromJSON, BCMRIndexer, bigIntToDecString } from '../../lib/util.js';
import { buildTokensBCMRFromTokensIdentity } from '../../lib/vega-file-storage-provider.js';
import type { Wallet, UtxoI, TokenI } from 'mainnet-js';
import {
  libauth, common as cashlab_common, cauldron,
  PayoutRule, SpendableCoin, TokenId, Fraction, NATIVE_BCH_TOKEN_ID,
  PayoutAmountRuleType, SpendableCoinType, BurnTokenException,
} from 'cashlab'
import type { PoolV0Parameters, PoolV0, TradeResult, TradeTxResult } from 'cashlab/build/cauldron/types.js';
import { readFile, writeFile } from 'node:fs/promises';
import CauldronIndexerRPCClient from '../../lib/cauldron-indexer-rpc-client.js'; 
const { hexToBin, binToHex, privateKeyToP2pkhLockingBytecode } = libauth;

const DEFAULT_DUST_TOKEN_MIN_IN_BCH = 800n;

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
      required: false,
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
      trade = tradeResultFromJSON(JSON.parse(trade_json));
    }
    const tokens_balance: Array<{ token_id: TokenId, value: bigint }> = [
      { token_id: NATIVE_BCH_TOKEN_ID, value: 0n }
    ];
    const trade_sum_list: Array<{
      supply_token_id: TokenId, demand_token_id: TokenId,
      supply: bigint, demand: bigint
    }> = [];
    const rates: Array<{ token_id: TokenId, rate: Fraction }> = [];
    for (const entry of trade.entries) {
      let trade_sum_entry = trade_sum_list.find((a) => a.supply_token_id == entry.supply_token_id && a.demand_token_id == entry.demand_token_id);
      if (trade_sum_entry == null) {
        trade_sum_entry = {
          supply_token_id: entry.supply_token_id, demand_token_id: entry.demand_token_id,
          supply: 0n, demand: 0n,
        };
        trade_sum_list.push(trade_sum_entry);
      }
      trade_sum_entry.supply += entry.supply;
      trade_sum_entry.demand += entry.demand;
      { // verify entries there's no other opposite trade
        let other_trade_sum_entry = trade_sum_list.find((a) => a.supply_token_id == entry.demand_token_id);
        if (other_trade_sum_entry == null) {
          other_trade_sum_entry = trade_sum_list.find((a) => a.demand_token_id == entry.supply_token_id);
        }
        if (other_trade_sum_entry != null) {
          throw new Error(`The trade may not contain opposed entries!`);
        }
      }
      { // add demand from balance as surplus
        let token_balance = tokens_balance.find((a) => a.token_id == entry.demand_token_id);
        if (token_balance == null) {
          token_balance = { token_id: entry.demand_token_id, value: 0n };
          tokens_balance.push(token_balance);
        }
        token_balance.value += entry.demand;
      }
      { // deduct supply from balance as deficit
        let token_balance = tokens_balance.find((a) => a.token_id == entry.supply_token_id);
        if (token_balance == null) {
          token_balance = { token_id: entry.supply_token_id, value: 0n };
          tokens_balance.push(token_balance);
        }
        token_balance.value -= entry.supply;
      }
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
    const input_coins: SpendableCoin[] = [];
    const wallet_locking_bytecode = privateKeyToP2pkhLockingBytecode({ privateKey: wallet_private_key, throwErrors: true })
    // txfee reserve
    // TODO:: have an estimate of txfee reserve
    const txfee_reserve: bigint = BigInt(200 * trade.entries.length + 1000);
    const native_token_balance = tokens_balance.find((a) => a.token_id == NATIVE_BCH_TOKEN_ID);
    if (native_token_balance == null) {
      throw new Error('InvalidProgramState!');
    }
    // deduct txfee_reserve from bch balance
    native_token_balance.value -= txfee_reserve;
    // supply input coins for tokens with negative balance
    const included_utxo_list: UtxoI[] = [];
    for (const token_balance of tokens_balance) {
      while (token_balance.value < 0n) {
        // select from utxo_list
        let sub_utxo_list
        if (token_balance.token_id == NATIVE_BCH_TOKEN_ID) {
          sub_utxo_list = utxo_list.filter((a) => included_utxo_list.find((b) => a == b) == null && a.satoshis > 0);
          sub_utxo_list.sort((a, b) => b.satoshis - a.satoshis);
        } else {
          sub_utxo_list = utxo_list.filter((a) => included_utxo_list.find((b) => a == b) == null && a.token?.tokenId == token_balance.token_id && a.token?.capability == null && a.token?.commitment == null && a.token.amount > 0n);
          cashlab_common.bigIntArraySortPolyfill(sub_utxo_list, (a, b) => (b.token as TokenI).amount - (a.token as TokenI).amount);
        }
        const utxo = sub_utxo_list.shift();
        if (utxo == null) {
          throw new Error(`Insufficient funds, wallet: ${wallet_info.name}`);
        }
        included_utxo_list.push(utxo);
        native_token_balance.value += BigInt(utxo.satoshis as number);
        if (token_balance.token_id != NATIVE_BCH_TOKEN_ID) {
          token_balance.value += (utxo.token as TokenI).amount as bigint;
        }
        input_coins.push({
          type: SpendableCoinType.P2PKH,
          output: {
            locking_bytecode: wallet_locking_bytecode,
            token: utxo.token != null ? {
              amount: utxo.token.amount,
              token_id: utxo.token.tokenId,
            } : undefined,
            amount: BigInt(utxo.satoshis),
          },
          outpoint: {
            index: utxo.vout,
            txhash: hexToBin(utxo.txid),
          },
          key: wallet_private_key,
        });
      }
    }
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
    const network_provider = await this.getNetworkProvider(wallet.network);
    const txfee_per_byte: bigint = flags['txfee-per-byte'] ? BigInt(flags['txfee-per-byte']) : BigInt(Math.max(await network_provider.getRelayFee(), 1));
    if (txfee_per_byte < 0n) {
      throw new Error('txfee-per-byte should be a positive integer');
    }
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
    let selected_input_coins: SpendableCoin[] = [];
    const write_tx_controller = {
      // @ts-ignore
      async generateMiddleware (result: GenerateChainedTradeTxResult, grouped_entries: Array<{ supply_token_id: TokenId, demand_token_id: TokenId, list: PoolTrade[] }>, input_coins: SpendableCoin[]): Promise<GenerateChainedTradeTxResult> {
        selected_input_coins = [ ...selected_input_coins, ...result.input_coins ];
        return result;
      },
    };
    const trade_tx_list: TradeTxResult[] = await exlab.writeChainedTradeTx(trade.entries, input_coins, payout_rules, null, txfee_per_byte, write_tx_controller);
    for (const trade_tx of trade_tx_list) {
      exlab.verifyTradeTx(trade_tx);
    }

    const result_txoutput: any = {
      pools_count: trade.entries.length,
      input_coins: selected_input_coins.map((a) => ({
        outpoint: {
          txhash: binToHex(a.outpoint.txhash),
          index: a.outpoint.index,
        },
        output: {
          locking_bytecode: binToHex(a.output.locking_bytecode),
          token: a.output.token ? {
            token_id: a.output.token.token_id,
            amount: a.output.token.amount+'',
          } : null,
          amount: a.output.amount+'',
        },
      })),
      transactions: trade_tx_list.map((trade_tx) => {
        return {
          txbin: binToHex(trade_tx.txbin),
          txbin_size: trade_tx.txbin.length,
          txfee: trade_tx.txfee+'',
          input_count: trade_tx.libauth_generated_transaction.inputs.length,
          output_count: trade_tx.libauth_generated_transaction.outputs.length,
          token_burns: trade_tx.token_burns.map((a) => ({ token_id: a.token_id, amount: a.amount+'' })),
          payouts_info: trade_tx.payouts_info.map((a) => ({
            index: a.index,
            output: {
              locking_bytecode: binToHex(a.output.locking_bytecode),
              token: a.output.token ? {
                token_id: a.output.token.token_id,
                amount: a.output.token.amount+'',
              } : null,
              amount: a.output.amount+'',
            },
          })),
        };
      }),
    };

    if (flags.txoutput && flags.txoutput != '-') {
      await writeFile(flags.txoutput, JSON.stringify(result_txoutput, null, 2));
    }

    this.log('Pools count: ' + trade.entries.length);
    this.log('Input coins:');
    for (const input_coin of selected_input_coins) {
      this.log(`- ${binToHex(input_coin.outpoint.txhash)}:${input_coin.outpoint.index}`);
      this.log(`   contains ${input_coin.output.amount} sats` + (input_coin.output.token ? ` & has tokens, token_id: ${input_coin.output.token.token_id}, amount: ${input_coin.output.token.amount}` : ''));
    }
    this.log('Transactions: ');
    let counter = 0;
    for (const trade_tx of trade_tx_list) {
      this.log('- tx: #' + (counter + 1));
      this.log(`- txsize: ${trade_tx.txbin.length}`);
      this.log(`- txfee: ${trade_tx.txfee}`);
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
      for (const trade_tx of trade_tx_list) {
        await wallet.submitTransaction(trade_tx.txbin, true);
        this.log(`Transaction #${counter+1} sent!`);
        if (++counter < trade_tx_list.length) {
          // send the next transaction with some delay
          ;await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    }

    return result_txoutput;
  }
}


