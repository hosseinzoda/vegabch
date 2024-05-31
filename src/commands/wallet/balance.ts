import VegaCommand, { VegaCommandOptions, selectWalletFlags } from '../../lib/vega-command.js';
import { BCMRIndexer, getNativeBCHTokenInfo, bigIntToDecString } from '../../lib/util.js';
import { buildTokensBCMRFromTokensIdentity } from '../../lib/vega-file-storage-provider.js';
import type { Wallet, UtxoI, TokenI } from 'mainnet-js';
import { NATIVE_BCH_TOKEN_ID, TokenId } from 'cashlab';

type TokensBalanceDetail = {
  [ token_id: TokenId ]: {
    confirmed_balance: bigint;
    unconfirmed_balance: bigint;
  };
};
const tokensBalanceDetailFromUtxoList = (utxo_list: UtxoI[]): TokensBalanceDetail => {
  const result: TokensBalanceDetail = {};
  for (const utxo of utxo_list) {
    const token: TokenI | undefined = utxo.token;
    if (token != null) {
      const token_result = result[token.tokenId as TokenId] = result[token.tokenId as TokenId] || { confirmed_balance: 0n, unconfirmed_balance: 0n };
      if (utxo.height != null && utxo.height > 0) { 
        token_result.confirmed_balance += token.amount;
      } else {
        token_result.unconfirmed_balance += token.amount;
      }
    }
    const bch_result = result[NATIVE_BCH_TOKEN_ID] = result[NATIVE_BCH_TOKEN_ID] || { confirmed_balance: 0n, unconfirmed_balance: 0n };
    if (utxo.height != null && utxo.height > 0) { 
      bch_result.confirmed_balance += BigInt(utxo.satoshis);
    } else {
      bch_result.unconfirmed_balance += BigInt(utxo.satoshis);
    }
  }
  return result;
};

export default class WalletBalance extends VegaCommand<typeof WalletBalance> {
  static args = {
  };
  static flags = {
    ...selectWalletFlags(),
  };
  static vega_options: VegaCommandOptions = {
    require_wallet_selection: true,
    require_network_provider: true,
  };

  static description = 'view a balance of all tokens.';

  static examples = [
    `<%= config.bin %> <%= command.id %>`,
  ];

  async run (): Promise<any> {
    const wallet: Wallet = this.getSelectedWallet();
    const utxo_list: UtxoI[] = await wallet.getAddressUtxos();
    const result: TokensBalanceDetail = tokensBalanceDetailFromUtxoList(utxo_list);
    const bcmr_indexer = new BCMRIndexer(buildTokensBCMRFromTokensIdentity(await this.getTokensIdentity()));
    const readableTokenBalance = (token_id: TokenId, amount: bigint): { symbol: string, amount_dec: string } => {
      const token_identity = token_id != NATIVE_BCH_TOKEN_ID ? bcmr_indexer.getTokenCurrentIdentity(token_id) : null;
      const token_info = token_id == NATIVE_BCH_TOKEN_ID  ? getNativeBCHTokenInfo() : token_identity?.token;
      const symbol = token_info?.symbol ? token_info.symbol : token_id;
      const decimals = token_info?.decimals != null && token_info?.decimals > 0 ? token_info.decimals : 0;
      const amount_dec = bigIntToDecString(amount, decimals);
      return { symbol, amount_dec };
    };
    
    // balance
    this.log(`****** Balance summary ******`);
    for (const [ token_id, detail ] of Object.entries(result)) {
      const { symbol, amount_dec } = readableTokenBalance(token_id, detail.confirmed_balance + detail.unconfirmed_balance);
      this.log(`${symbol}: ${amount_dec}`);
    }
    this.log(`****** *************** ******`);
    // confirmed balance
    this.log(`****** Confirmed balance ******`);
    for (const [ token_id, detail ] of Object.entries(result)) {
      const { symbol, amount_dec } = readableTokenBalance(token_id, detail.confirmed_balance);
      this.log(`${symbol}: ${amount_dec}`);
    }
    this.log(`****** **************** *******`);
    // unconfirmed balance
    this.log(`****** Unconfirmed balance ******`);
    for (const [ token_id, detail ] of Object.entries(result)) {
      const { symbol, amount_dec } = readableTokenBalance(token_id, detail.unconfirmed_balance);
      this.log(`${symbol}: ${amount_dec}`);
    }
    this.log(`****** **************** *******`);
    return { result };
  }
}
