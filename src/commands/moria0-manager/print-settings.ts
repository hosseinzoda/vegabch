import { Args } from '@oclif/core';
import VegaCommand, { VegaCommandOptions } from '../../lib/vega-command.js';
import { bigIntToDecString, fractionAsReadableText } from '../../lib/util.js';
import { MUSDV0_SYMBOL, MUSDV0_DECIMALS } from '../../lib/constants.js';
import type { Moria0LoanManagerSettings } from '../../lib/main/moria0_manager/types.js';
import { deserializeSettings } from '../../lib/main/moria0_manager/helpers.js';

export default class Moria0ManagerPrintSettings extends VegaCommand<typeof Moria0ManagerPrintSettings> {
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
    const settings: Moria0LoanManagerSettings | null = await this.callModuleMethod('moria0_manager.get-settings', args.wallet_name);
    if (settings == null) {
      this.log('NULL');
    } else {
      const FRACTION_READABLE_DECIMALS = 5;
      this.log(`target_loan_amount = ${bigIntToDecString(settings.target_loan_amount, MUSDV0_DECIMALS)} ${MUSDV0_SYMBOL}`);
      this.log(`target_collateral_rate = ${(typeof settings.target_collateral_rate == 'string' && settings.target_collateral_rate == 'MIN') ? 'MIN' : fractionAsReadableText(settings.target_collateral_rate, FRACTION_READABLE_DECIMALS)}`);
      this.log(`above_target_collateral_refi_threshold = ${settings.above_target_collateral_refi_threshold == null ? 'NULL' : fractionAsReadableText(settings.above_target_collateral_refi_threshold, FRACTION_READABLE_DECIMALS)}`);
      this.log(`below_target_collateral_refi_threshold = ${settings.below_target_collateral_refi_threshold == null ? 'NULL' : fractionAsReadableText(settings.below_target_collateral_refi_threshold, FRACTION_READABLE_DECIMALS)}`);

      this.log(`margin_call_warning_collateral_rate = ${fractionAsReadableText(settings.margin_call_warning_collateral_rate, FRACTION_READABLE_DECIMALS)}`);
      
      this.log(`max_loan_amount_per_utxo = ${bigIntToDecString(settings.max_loan_amount_per_utxo, MUSDV0_DECIMALS)} ${MUSDV0_SYMBOL}`);
      this.log(`retarget_min_musd_amount = ${bigIntToDecString(settings.retarget_min_musd_amount, MUSDV0_DECIMALS)} ${MUSDV0_SYMBOL}`);

      this.log(`txfee_per_byte = ${settings.txfee_per_byte} sats`);

      this.log(`dryrun = ${settings.dryrun ? 'true' : 'false'}`);
      this.log(`debug = ${settings.debug ? 'true' : 'false'}`);

      this.log(`warning_notification_frequency = ${settings.warning_notification_frequency} hour(s)`);
      this.log(`error_notification_frequency = ${settings.error_notification_frequency} hour(s)`);

      this.log('notification_hooks ==>');
      for (const notification_hook of settings.notification_hooks) {
        this.log(` - name = ${notification_hook.name}`);
        this.log(`   type = ${notification_hook.type}`);
        this.log(`   target_events = ${notification_hook.target_events == null ? '*' : notification_hook.target_events.join(', ')}`);
      }
      this.log('==|');
    }
    return {
      result: settings ? deserializeSettings(settings) : null,
    };
  }
}
