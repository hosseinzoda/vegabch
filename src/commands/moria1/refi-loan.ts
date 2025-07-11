import { Args, Flags } from '@oclif/core';
import VegaCommand, { VegaCommandOptions, selectWalletFlags } from '../../lib/vega-command.js';
import {
  getNativeBCHTokenInfo, bigIntToDecString, binToHex, bigIntFromDecString,
  cashlabTxResultSummaryJSON, convertUTXOToJSON, parseFractionFromString,
  parseOutpointFromInputArgument,
} from '../../lib/util.js';
import { ValueError } from '../../lib/exceptions.js';
import { MUSDV1_SYMBOL, MUSDV1_DECIMALS } from '../../lib/constants.js';
import type { Fraction } from '@cashlab/common';

export default class Moria1RefiLoan extends VegaCommand<typeof Moria1RefiLoan> {
  static args = {
    input_loan_outpoint: Args.string({
      name: 'input_loan_outpoint',
      required: true,
      description: "The outpoint of the loan nft utxo. <txid>:<index>",
    }),
    loan_amount: Args.string({
      name: 'loan_amount',
      required: true,
      description: "Loan amount in MUSD, A decimal number 1.00 is one dollar.",
    }),
    collateral_amount: Args.string({
      name: 'collateral_amount',
      required: true,
      description: "Colateral amount, At least it should be worth 150% of the loan amount. The amount is a decimal number, 1.00000000 is equal to 100000000 sats or one bch.",
    }),
    annual_interest_rate: Args.string({
      name: 'annual_interest_rate',
      required: true,
      description: "Annual interest rate, The input value is the precentage of interest to pay annually with two decimal points, Range: 0% <=> 327.00%",
    }),
  };
  static flags = {
    ...selectWalletFlags(),
    'txfee-per-byte': Flags.string({
      description: 'Specify the txfee per byte in sats. The value can be a fraction.',
      required: true,
      default: '1',
    }),
    'broadcast': Flags.boolean({
      description: `Broadcast the transactions generated by the command.`,
    }),
  };
  static vega_options: VegaCommandOptions = {
    require_wallet_selection: true,
  };

  static description = ``;

  static examples = [
    `<%= config.bin %> <%= command.id %> <loan_outpoint> <loan_amount> <collateral_amount> <annual_interest_rate>`,
  ];

  async run (): Promise<any> {
    const { args, flags } = this;
    const input_loan_outpoint = parseOutpointFromInputArgument(args.input_loan_outpoint, 'input_loan_outpoint');
    const bch_token_info = getNativeBCHTokenInfo();
    const wallet_name = this.getSelectedWalletName();
    const {
      principalFromLoanCommitment, annualInterestBPFromLoanCommitment,
      timestampFromLoanCommitment,
    } = await import('@cashlab/moria/v1/util.js');
    const loan_amount = bigIntFromDecString(args.loan_amount, MUSDV1_DECIMALS);
    if (!(loan_amount >= BigInt(1 * MUSDV1_DECIMALS))) {
      throw new ValueError(`loan_amount should be greater than or equal to 1.0`);
    }
    const collateral_amount = bigIntFromDecString(args.collateral_amount, bch_token_info.decimals);
    if (!(collateral_amount > 0n)) {
      throw new ValueError(`collateral_amount should be greater than zero.`);
    }
    const annual_interest_bp: bigint = bigIntFromDecString(args.annual_interest_rate, 2);
    if (annual_interest_bp < 0n || annual_interest_bp > 32700n) {
      throw new ValueError(`annual_interest_rate is out of range!`);
    }
    const broadcast = flags.broadcast;
    const txfee_per_byte: Fraction = parseFractionFromString(flags['txfee-per-byte'], true);
    const result = await this.callModuleMethod('moria1.refi-loan', wallet_name, input_loan_outpoint, { loan_amount, collateral_amount, annual_interest_bp }, { broadcast, txfee_per_byte, verify: true });
    this.log('Summary:');
    try {
      const loan_commitment = result.loan_utxo.output.token.nft.commitment as Uint8Array;
      const loan_amount = principalFromLoanCommitment(loan_commitment);
      const interest_rate_bp = annualInterestBPFromLoanCommitment(loan_commitment);
      const timestamp = timestampFromLoanCommitment(loan_commitment);
      const timestamp_text = new Date(Number(timestamp) * 1000).toString();
      const collateral_amount = result.loan_utxo.output.amount;

      this.log(`  Transaction id: ${binToHex(result.txhash)}`);
      this.log(`  Loan amount: ${bigIntToDecString(loan_amount, MUSDV1_DECIMALS)} ${MUSDV1_SYMBOL}`);
      this.log(`  Collateral amount: ${bigIntToDecString(collateral_amount, bch_token_info.decimals)} ${bch_token_info.symbol}`);
      this.log(`  Annual interest: ${bigIntToDecString(interest_rate_bp, 2)}%`);
      this.log(`  Timestamp: ${timestamp_text}`);
      this.log(`  Moria fees: ${result.fees.total} sats`);
      this.log(`  Transaction fee: ${result.txfee} sats`);
    } catch (err) {
      this.log(`  Parse error: [${(err as any).name}] ${(err as any).message}`);
    }
    return {
      ...cashlabTxResultSummaryJSON(result),
      fees: Object.fromEntries(Object.entries(result.fees).map((a) => [ a[0], typeof a[1] == 'bigint' ? a[1]+'' : a[1] ]).filter((a) => (a[1] as bigint) >= 0n)),
      ...Object.fromEntries([
        'moria_utxo', 'delphi_utxo', 'loan_utxo', 'loan_agent_utxo',
      ].map((name) => [ name, convertUTXOToJSON(result[name]) ])),
    };
  }
}
