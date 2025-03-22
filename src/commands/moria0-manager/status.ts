import { Args } from '@oclif/core';
import VegaCommand, { VegaCommandOptions } from '../../lib/vega-command.js';
import {
  getNativeBCHTokenInfo, bigIntToDecString, convertUTXOToJSON,
} from '../../lib/util.js';
import { serializeMessage } from '../../lib/json-ipc-serializer.js';
import { MUSDV0_SYMBOL, MUSDV0_DECIMALS, MUSDV0_TOKEN_ID } from '../../lib/constants.js';
import { binToHex } from '@cashlab/common/util.js';
import { NATIVE_BCH_TOKEN_ID } from '@cashlab/common/constants.js';
import type { Moria0LoanManagerStatus } from '../../lib/main/moria0_manager/types.js';
import { fractionAsReadableText } from '../../lib/main/moria0_manager/helpers.js';

export default class Moria0ManagerStatus extends VegaCommand<typeof Moria0ManagerStatus> {
  static args = {
    wallet_name: Args.string({
      name: 'wallet_name',
      required: true,
      description: "wallet name of the loan manager instance.",
    }),
  };
  static flags = {
  };
  static vega_options: VegaCommandOptions = {
  };

  static description = ``;

  static examples = [
    `<%= config.bin %> <%= command.id %> <wallet_name>`,
  ];

  async run (): Promise<any> {
    const { args } = this;
    const status: Moria0LoanManagerStatus = await this.callModuleMethod('moria0_manager.status', args.wallet_name);
    const bch_token_info = getNativeBCHTokenInfo();

    const FRACTION_READABLE_DECIMALS = 5;
    const last_update_time = status.last_update_timestamp == null ? null : new Date(status.last_update_timestamp);
    this.log(`last update time: ${last_update_time == null ? 'N/A' : last_update_time.toISOString()}`);
    this.log(`loan_amount = ${bigIntToDecString(status.loan_amount, MUSDV0_DECIMALS)} ${MUSDV0_SYMBOL}`);
    this.log(`collateral_amount = ${bigIntToDecString(status.collateral_amount, bch_token_info.decimals)} ${bch_token_info.symbol}`);
    this.log(`number_of_loans = ${status.number_of_loans}`);
    this.log(`number_of_invalid_loans = ${status.number_of_invalid_loans}`);
    this.log(`average_collateral_rate = ${status.average_collateral_rate == null ? 'N/A' : fractionAsReadableText(status.average_collateral_rate, FRACTION_READABLE_DECIMALS)}`);
    this.log(`lowest_collateral_rate = ${status.lowest_collateral_rate == null ? 'N/A' : fractionAsReadableText(status.lowest_collateral_rate, FRACTION_READABLE_DECIMALS)}`);
    this.log(`highest_collateral_rate = ${status.highest_collateral_rate == null ? 'N/A' : fractionAsReadableText(status.highest_collateral_rate, FRACTION_READABLE_DECIMALS)}`);
    this.log(`notification_hooks = ${status.notification_hooks.map((a) => a.name).join(', ')}`);

    if (status.last_update_actions_pending_deposit) {
      this.log(`last_update_actions_pending_deposit ==>`);
      for (const item of status.last_update_actions_pending_deposit) {
        let pending_deposit;
        if (item.token_id == MUSDV0_TOKEN_ID) {
          pending_deposit = `${bigIntToDecString(item.amount, MUSDV0_DECIMALS)} ${MUSDV0_SYMBOL}`;
        } else if (item.token_id == NATIVE_BCH_TOKEN_ID) {
          pending_deposit = `${bigIntToDecString(status.collateral_amount, bch_token_info.decimals)} ${bch_token_info.symbol}`;
        } else {
          pending_deposit = `${item.amount} (token_id: ${item.token_id})`;
        }
        this.log(` - name = ${item.name}`);
        this.log(`   comment = ${item.comment}`);
        this.log(`   pending_deposit = ${pending_deposit}`);
      }
      this.log('==|');
    }
    if (status.last_update_transaction_chain) {
      this.log(`last_update_number_of_chained_transactions = ${status.last_update_transaction_chain.length}`);
    }
    if (status.last_update_error != null) {
      this.log(`last_update_error: ${typeof status.last_update_error.toString == 'function' ? status.last_update_error.toString() : JSON.stringify(serializeMessage(status.last_update_error))}`);
    }

    return {
      result: {
        loan_amount: status.loan_amount+'',
        collateral_amount: status.collateral_amount+'',
        number_of_loans: status.number_of_loans,
        number_of_invalid_loans: !status.number_of_invalid_loans,
        lowest_collateral_rate: !status.lowest_collateral_rate ? null : {
          numerator: status.lowest_collateral_rate.numerator+'',
          denominator: status.lowest_collateral_rate.denominator+'',
        },
        highest_collateral_rate: !status.highest_collateral_rate ? null : {
          numerator: status.highest_collateral_rate.numerator+'',
          denominator: status.highest_collateral_rate.denominator+'',
        },
        average_collateral_rate: !status.average_collateral_rate ? null : {
          numerator: status.average_collateral_rate.numerator+'',
          denominator: status.average_collateral_rate.denominator+'',
        },
        notification_hooks: status.notification_hooks,
        last_update_timestamp: status.last_update_timestamp,
        last_update_actions_pending_deposit: status.last_update_actions_pending_deposit,
        last_update_transaction_chain: !status.last_update_transaction_chain ? null : 
          status.last_update_transaction_chain.map((a) => ({
            action: a.action,
            metadata: a.metadata,
            tx_result: {
              txbin: binToHex(a.tx_result.txbin),
              txhash: binToHex(a.tx_result.txhash),
              txfee: a.tx_result.txfee+'',
              payouts: a.tx_result.payouts.map(convertUTXOToJSON),
            },
          })),
        last_update_error: !status.last_update_error ? null : serializeMessage(status.last_update_error),
      },
    };
  }
}
