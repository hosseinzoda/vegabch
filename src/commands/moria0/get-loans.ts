import { Args, Flags } from '@oclif/core';
import VegaCommand, { VegaCommandOptions } from '../../lib/vega-command.js';
import {
  getNativeBCHTokenInfo, bigIntToDecString, binToHex, convertUTXOToJSON,
} from '../../lib/util.js';
import { MUSDV0_SYMBOL, MUSDV0_DECIMALS } from '../../lib/constants.js';
import type { UTXOWithNFT } from 'cashlab';

export default class Moria0GetLoans extends VegaCommand<typeof Moria0GetLoans> {
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
    const { moria: cashlab_moria } = await import('cashlab');
    const { MoriaV0 } = cashlab_moria;
    const bch_token_info = getNativeBCHTokenInfo();
    const loans: UTXOWithNFT[] = await this.callModuleMethod('moria0.get-loans');
    for (const loan of loans) {
      this.log(`- ${binToHex(loan.outpoint.txhash)}:${loan.outpoint.index}`);
      try {
        const loan_params = MoriaV0.parseParametersFromLoanNFTCommitment(loan.output.token.nft.commitment);
        this.log(`  Loan amount: ${bigIntToDecString(loan_params.amount, MUSDV0_DECIMALS)} ${MUSDV0_SYMBOL}`);
        this.log(`  Collateral amount: ${bigIntToDecString(loan.output.amount, bch_token_info.decimals)} ${bch_token_info.symbol}`);
      } catch (err) {
        this.log(`  Parse error: [${(err as any).name}] ${(err as any).message}`);
      }
    }
    return loans.map(convertUTXOToJSON);
  }
}
