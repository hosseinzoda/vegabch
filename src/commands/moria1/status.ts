import VegaCommand, { VegaCommandOptions } from '../../lib/vega-command.js';
import type { Moria1Status } from '../../lib/main/moria1/types.js';
import { simpleJsonSerializer, binToHex } from '@cashlab/common/util.js';
import {
  tokensBalanceDetailFromUTXOList, readableTokenBalance,
  BCMRIndexer,  buildTokensBCMRFromTokensIdentity,
  bigIntToDecString, getNativeBCHTokenInfo,
} from '../../lib/util.js';
import { MUSDV1_SYMBOL, MUSDV1_DECIMALS } from '../../lib/constants.js';
import type { TokensIdentity } from '../../lib/main/vega-file-storage-provider.js';

export default class Moria1CommandStatus extends VegaCommand<typeof Moria1CommandStatus> {
  static args = {
  };
  static flags = {
  };
  static vega_options: VegaCommandOptions = {
  };

  static description = ``;

  static examples = [
    `<%= config.bin %> <%= command.id %>`,
  ];

  async run (): Promise<any> {
    const { args } = this;
    const { principalFromLoanCommitment } = await import('@cashlab/moria/v1/util.js');
    const tokens_identity: TokensIdentity = await this.callModuleMethod('vega_storage.get_tokens_identity');
    const status: Moria1Status = await this.callModuleMethod('moria1.status');
    const bcmr_indexer = new BCMRIndexer(buildTokensBCMRFromTokensIdentity(tokens_identity));
    const bch_token_info = getNativeBCHTokenInfo();

    if (status.delphi != null) {
      this.log(`delphi ==>`);
      this.log(`    price: ${bigIntToDecString(status.delphi.price, 2)}`);
      this.log(`    timestamp: ${new Date(Number(status.delphi.timestamp)).toString()}`);
      this.log(`    sequence number: ${status.delphi.sequence_number}`);
      this.log(`    use fee: ${status.delphi.use_fee}`);
      this.log(`==|`);
    } else {
      this.log(`delphi = NULL`);
    }

    if (status.bporacle != null) {
      this.log(`bporacle ==>`);
      this.log(`    redeemable interest rates: ${bigIntToDecString(status.bporacle.value, 2)}`);
      this.log(`    timestamp: ${new Date(Number(status.bporacle.timestamp)).toString()}`);
      this.log(`    use fee: ${status.bporacle.use_fee}`);
      this.log(`==|`);
    } else {
      this.log(`bporacle = NULL`);
    }

    this.log(`wallet_moria_settings_list ==>`);
    for (const item of status.wallet_moria_settings_list) {
      const settings_text = JSON.stringify(item.settings, simpleJsonSerializer, '  ')
        .split('\n').map((a, i) => (i == 0 ? '' : '    ') + a).join('\n');
      this.log(`  - name = ${item.wallet_name}`);
      this.log(`    settings = ${settings_text}`);
    }
    this.log(`==|`);

    this.log(`active_wallet_managers ==>`);
    for (const item of status.active_wallet_managers) {
      this.log(`  - wallet_name = ${item.wallet_name}`);
      this.log(`    agent_nft_list ==>`);
      for (const agent_item of item.agent_nft_list) {
        const agent_text = JSON.stringify(agent_item.agent, simpleJsonSerializer, '  ')
          .split('\n').map((a, i) => (i == 0 ? '' : '    '.repeat(2)) + a).join('\n');
        this.log(`      - nfthash = ${binToHex(agent_item.nfthash)}`);
        this.log(`        agent = ${agent_text}`);
        this.log(`        loan_count = ${agent_item.loan_list.length}`);
        const total_collateral_amount = agent_item.loan_list.reduce((a, b) => a + b.output.amount, 0n);
        const total_loan_amount = agent_item.loan_list.reduce((a, b) => a + principalFromLoanCommitment(b.output.token.nft.commitment), 0n);
        this.log(`        loans_total_collateral = ${bigIntToDecString(total_collateral_amount, bch_token_info.decimals)} ${bch_token_info.symbol}`);
        this.log(`        loans_total_amount = ${bigIntToDecString(total_loan_amount, MUSDV1_DECIMALS)} ${MUSDV1_SYMBOL}`);
        this.log(`        p2nfth_count = ${agent_item.p2nfth_list.length}`);
        if (agent_item.loan_list.length > 0) {
          this.log(`        p2nfth_assets ==>`);
          for (const balance_item of tokensBalanceDetailFromUTXOList(agent_item.p2nfth_list)) {
            const { symbol, amount } = readableTokenBalance(balance_item.token_id, balance_item.confirmed_balance + balance_item.unconfirmed_balance, bcmr_indexer);
            this.log(`          - ${symbol}: ${amount}`);
          }
          this.log(`        ==|`);
        }
      }
      this.log(`    ==|`);
    }
    this.log(`==|`);

    return status;
  }
}
