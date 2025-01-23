import { Args, Flags } from '@oclif/core';
import VegaCommand, { VegaCommandOptions, selectWalletFlags } from '../../lib/vega-command.js';
import {
  getNativeBCHTokenInfo, bigIntToDecString, binToHex,
} from '../../lib/util.js';
import { MUSDV0_SYMBOL, MUSDV0_DECIMALS } from '../../lib/constants.js';
import type { UTXOWithNFT } from 'cashlab';

export default class Moria0GetMyLoans extends VegaCommand<typeof Moria0GetMyLoans> {
  static args = {
  };
  static flags = {
    ...selectWalletFlags(),
  };
  static vega_options: VegaCommandOptions = {
    require_wallet_selection: true,
  };

  static description = ``;

  static examples = [
    `<%= config.bin %> <%= command.id %>`,
  ];

  async run (): Promise<any> {
    const wallet_name = this.getSelectedWalletName();
    const { moria: cashlab_moria } = await import('cashlab');
    const { MoriaV0 } = cashlab_moria;
    const bch_token_info = getNativeBCHTokenInfo();
    const loans: UTXOWithNFT[] = await this.callModuleMethod('moria0.get-my-loans', wallet_name);
    for (const loan of loans) {
      this.log(`- ${binToHex(loan.outpoint.txhash)}:${loan.outpoint.index}`);
      try {
        const loan_params = MoriaV0.parseParametersFromLoanNFTCommitment(loan.output.token.nft.commitment);
        this.log(`  Loan amount: ${bigIntToDecString(loan_params.amount, MUSDV0_DECIMALS)} ${MUSDV0_SYMBOL}`);
        this.log(`  Collateral amount: ${bigIntToDecString(loan.output.amount, bch_token_info.decimals)} ${bch_token_info.symbol}`);
        // this.log('  commitment: ' + binToHex(loan.output.token.nft.commitment));
      } catch (err) {
        this.log(`  Parse error: [${(err as any).name}] ${(err as any).message}`);
      }
    }
    return loans;
  }
}
