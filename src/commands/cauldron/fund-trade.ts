import { Args, Flags } from '@oclif/core';
import VegaCommand, { VegaCommandOptions, selectWalletFlags } from '../../lib/vega-command.js';
import { tradeResultFromJSON } from '../../lib/util.js';
import type { Wallet, UtxoI, TokenI } from 'mainnet-js';
import { libauth, common as cashlab_common, cauldron, PayoutRule, SpendableCoin, TokenId, Fraction, NATIVE_BCH_TOKEN_ID, PayoutAmountRuleType, SpendableCoinType } from 'cashlab'
import type { PoolV0Parameters, PoolV0, TradeResult, TradeTxResult } from 'cashlab/build/cauldron/types.js';
import { readFile, writeFile } from 'node:fs/promises';
import CauldronIndexerRPCClient from '../../lib/cauldron-indexer-rpc-client.js'; 
const { hexToBin, binToHex, privateKeyToP2pkhLockingBytecode } = libauth;

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
      trade = tradeResultFromJSON(JSON.parse(trade_json));
    }
    const tokens_balance: Array<{ token_id: string, value: bigint }> = [
      { token_id: NATIVE_BCH_TOKEN_ID, value: 0n }
    ];
    for (const entry of trade.entries) {
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
    const network_provider = await this.getNetworkProvider(wallet.network);
    const txfee_per_byte: bigint = flags['txfee-per-byte'] ? BigInt(flags['txfee-per-byte']) : BigInt(Math.max(await network_provider.getRelayFee(), 1));
    if (txfee_per_byte < 0n) {
      throw new Error('txfee-per-byte should be a positive integer');
    }
    const payout_rules: PayoutRule[] = [
      {
        type: PayoutAmountRuleType.CHANGE,
        allow_mixing_native_and_token: true,
        locking_bytecode: wallet_locking_bytecode,
      },
    ];
    const exlab = new cauldron.ExchangeLab();
    const result: TradeTxResult = exlab.writeTradeTx(trade.entries, input_coins, payout_rules, null, txfee_per_byte);
    exlab.verifyTradeTx(result);
    const result_txoutput: any = {
      txbin: binToHex(result.txbin),
      txfee: result.txfee+'',
      input_coins: input_coins.map((a) => ({
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
      payout_outputs: result.payout_outputs.map((a) => ({
        locking_bytecode: binToHex(a.locking_bytecode),
        token: a.token ? {
          token_id: a.token.token_id,
          amount: a.token.amount+'',
        } : null,
        amount: a.amount+'',
      })),
    };
    if (flags.txoutput && flags.txoutput != '-') {
      await writeFile(flags.txoutput, JSON.stringify(result_txoutput, null, 2));
    }

    this.log(`txfee: ${result.txfee}`);
    this.log('Coins to spend.');
    for (const input_coin of input_coins) {
      this.log(`- ${binToHex(input_coin.outpoint.txhash)}:${input_coin.outpoint.index}`);
      this.log(`   contains ${input_coin.output.amount} sats` + (input_coin.output.token ? ` & has tokens, token_id: ${input_coin.output.token.token_id}, amount: ${input_coin.output.token.amount}` : ''));
    }
    this.log('Payouts.');
    for (const output of result.payout_outputs) {
      this.log(`- locking bytecode: ${binToHex(output.locking_bytecode)}`);
      this.log(`   contains ${output.amount} sats` + (output.token ? ` & has tokens, token_id: ${output.token.token_id}, amount: ${output.token.amount}` : ''));
    }
    if (flags.broadcast) {
      const txhash = await wallet.submitTransaction(result.txbin, true);
      result_txoutput.broadcasted_txhash = txhash;
      this.log(`Transaction sent!`);
    } else {
      this.log(`Transaction hash.`);
      this.log(binToHex(result.txbin));
    }
    return result_txoutput;
  }
}


