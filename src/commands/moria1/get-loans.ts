import { Args, Flags } from '@oclif/core';
import VegaCommand, { VegaCommandOptions, selectWalletFlags } from '../../lib/vega-command.js';
import {
  getNativeBCHTokenInfo, bigIntToDecString, binToHex, hexToBin, convertUTXOToJSON,
} from '../../lib/util.js';
import { ValueError } from '../../lib/exceptions.js';
import { MUSDV1_SYMBOL, MUSDV1_DECIMALS } from '../../lib/constants.js';
import type { UTXOWithNFT, Fraction } from '@cashlab/common';
import { bigIntArraySortPolyfill } from '@cashlab/common/util.js';

export default class Moria1GetLoans extends VegaCommand<typeof Moria1GetLoans> {
  static args = {
  };
  static flags = {
    'loan-agent-nfthash': Flags.string({
      description: `Request to get loans of a particular agent nft.`,
    }),
    'liquidable': Flags.boolean({
      description: `Only show under-water loans that anyone can liquidate.`,
    }),
    'redeemable': Flags.boolean({
      description: `Only show loans below the bporacle interest rate threshold. Reedemable loans.`,
    }),
    'orderby': Flags.string({
      description: `Sort loans.`,
      options: [
        'interest_asc', 'interest_desc',
        'principal_asc', 'principal_desc',
        'timestamp_asc', 'timestamp_desc',
      ],
    }),
  };
  static vega_options: VegaCommandOptions = {
  };

  static description = ``;


  static examples = [
    `<%= config.bin %> <%= command.id %>`,
  ];

  async run (): Promise<any> {
    const { args, flags } = this;
    const bch_token_info = getNativeBCHTokenInfo();

    let loans: UTXOWithNFT[];
    if (flags['loan-agent-nfthash'] == null) {
      if (flags['liquidable'] && flags['redeemable']) {
        throw new ValueError(`Only one of the filters can be active, liquidable or redeemable .`);
      }
      if (flags['liquidable']) {
        loans = await this.callModuleMethod('moria1.get-liquidable-loans');
      } else if (flags['redeemable']) {
        loans = await this.callModuleMethod('moria1.get-redeemable-loans');
      } else {
        loans = await this.callModuleMethod('moria1.get-loans');
      }
    } else {
      if (flags['liquidable'] || flags['redeemable']) {
        throw new ValueError(`liquidable or redeemable filters cannot be active when request is to get loans of a particular agent nfthash.`);
      }
      loans = await this.callModuleMethod('moria1.get-agent-loans', hexToBin(flags['loan-agent-nfthash']));
    }
    const {
      principalFromLoanCommitment, annualInterestBPFromLoanCommitment,
      timestampFromLoanCommitment, loanAgentNFTHashFromLoanCommitment,
    } = await import('@cashlab/moria/v1/util.js');
    if (flags.orderby != null) {
      switch (flags.orderby) {
        case 'interest_asc': {
          loans = bigIntArraySortPolyfill(loans, (a: UTXOWithNFT, b: UTXOWithNFT) => annualInterestBPFromLoanCommitment(a.output.token.nft.commitment) - annualInterestBPFromLoanCommitment(b.output.token.nft.commitment));
          break;
        }
        case 'interest_desc': {
          loans = bigIntArraySortPolyfill(loans, (a: UTXOWithNFT, b: UTXOWithNFT) => annualInterestBPFromLoanCommitment(b.output.token.nft.commitment) - annualInterestBPFromLoanCommitment(a.output.token.nft.commitment));
          break;
        }
        case 'principal_asc': {
          loans = bigIntArraySortPolyfill(loans, (a: UTXOWithNFT, b: UTXOWithNFT) => principalFromLoanCommitment(a.output.token.nft.commitment) - principalFromLoanCommitment(b.output.token.nft.commitment));
          break;
        }
        case 'principal_desc': {
          loans = bigIntArraySortPolyfill(loans, (a: UTXOWithNFT, b: UTXOWithNFT) => principalFromLoanCommitment(b.output.token.nft.commitment) - principalFromLoanCommitment(a.output.token.nft.commitment));
          break;
        }
        case 'timestamp_asc': {
          loans = bigIntArraySortPolyfill(loans, (a: UTXOWithNFT, b: UTXOWithNFT) => timestampFromLoanCommitment(a.output.token.nft.commitment) - timestampFromLoanCommitment(b.output.token.nft.commitment));
          break;
        }
        case 'timestamp_desc': {
          loans = bigIntArraySortPolyfill(loans, (a: UTXOWithNFT, b: UTXOWithNFT) => timestampFromLoanCommitment(b.output.token.nft.commitment) - timestampFromLoanCommitment(a.output.token.nft.commitment));
          break;
        }
      }
    }
    for (const loan of loans) {
      this.log(`- ${binToHex(loan.outpoint.txhash)}:${loan.outpoint.index}`);
      try {
        const loan_commitment = loan.output.token.nft.commitment;
        const agent_nfthash = loanAgentNFTHashFromLoanCommitment(loan_commitment);
        const loan_amount = principalFromLoanCommitment(loan_commitment);
        const interest_rate_bp = annualInterestBPFromLoanCommitment(loan_commitment);
        const timestamp = timestampFromLoanCommitment(loan_commitment);
        const timestamp_text = new Date(Number(timestamp) * 1000).toString();

        this.log(`  Loan amount: ${bigIntToDecString(loan_amount, MUSDV1_DECIMALS)} ${MUSDV1_SYMBOL}`);
        this.log(`  Collateral amount: ${bigIntToDecString(loan.output.amount, bch_token_info.decimals)} ${bch_token_info.symbol}`);
        this.log(`  Annual interest: ${bigIntToDecString(interest_rate_bp, 2)}%`);
        this.log(`  Timestamp: ${timestamp_text}`);
        this.log(`  Agent nfthash: ${binToHex(agent_nfthash)}`);
      } catch (err) {
        this.log(`  Parse error: [${(err as any).name}] ${(err as any).message}`);
      }
    }
    return loans.map(convertUTXOToJSON);
  }
}
