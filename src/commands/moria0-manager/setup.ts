import { Args, Flags } from '@oclif/core';
import VegaCommand, { VegaCommandOptions } from '../../lib/vega-command.js';
import { bigIntFromDecString } from '../../lib/util.js';
import { MUSDV0_SYMBOL, MUSDV0_DECIMALS } from '../../lib/constants.js';
import type { Moria0LoanManagerSettings } from '../../lib/main/moria0_manager/types.js';
import {
  deserializeSettings, validateSettings,
} from '../../lib/main/moria0_manager/helpers.js';
import { fractionAsReadableText } from '../../lib/util.js';
import { ValueError } from '../../lib/exceptions.js';

export default class Moria0ManagerSetup extends VegaCommand<typeof Moria0ManagerSetup> {
  static args = {
    wallet_name: Args.string({
      name: 'wallet_name',
      required: true,
      description: "wallet name of the loan manager instance.",
    }),
  };
  static flags = {
    'target-loan-amount': Flags.string({
      description: `settings.target_loan_amount, (type: decimal) in ${MUSDV0_SYMBOL}.`,
      required: true,
    }),
    'target-collateral-rate': Flags.string({
      description: 'settings.target_collateral_rate (type: fraction).',
      required: true,
    }),
    'above-target-collateral-refi-threshold': Flags.string({
      description: 'settings.above_target_collateral_refi_threshold (type: fraction or null).',
      required: true,
    }),
    'below-target-collateral-refi-threshold': Flags.string({
      description: 'settings.below_target_collateral_refi_threshold (type: fraction or null).',
      required: true,
    }),
    'margin-call-warning-collateral-rate': Flags.string({
      description: 'settings.margin_call_warning_collateral_rate (type: fraction).',
      required: true,
    }),
    'max-loan-amount-per-utxo': Flags.string({
      description: `settings.max_loan_amount_per_utxo, (type: decimal) in ${MUSDV0_SYMBOL}.`,
      required: true,
      default: '1000.00',
    }),
    'retarget_min_musd_amount': Flags.string({
      description: `settings.retarget_min_musd_amount, (type: decimal) in ${MUSDV0_SYMBOL}.`,
      required: true,
      default: '1.00',
    }),
    'txfee-per-byte': Flags.string({
      description: 'settings.txfee_per_byte (type: integer), Specify the txfee per byte in sats.',
      required: true,
      default: '1',
    }),
    'tx-reserve-for-change-and-txfee': Flags.string({
      description: 'settings.tx_reserve_for_change_and_txfee (type: integer), A reserve change for every generated tx by the loan manager.',
      required: true,
      default: '10000',
    }),
    'dryrun': Flags.boolean({
      description: 'settings.dryrun (type: boolean).',
      required: true,
      default: false,
    }),
    'debug': Flags.boolean({
      description: 'settings.debug (type: boolean).',
      required: true,
      default: false,
    }),
    'warning-notification-frequency': Flags.string({
      description: 'settings.warning_notification_frequency (type: number).',
      required: true,
      default: '1',
    }),
    'error-notification-frequency': Flags.string({
      description: 'settings.error_notification_frequency (type: number).',
      required: true,
      default: '1',
    }),
    'notification-hook': Flags.string({
      description: 'names of the notification_hooks to assign to this entry.',
      required: false,
      multiple: true,
    }),
  };
  static vega_options: VegaCommandOptions = {
  };

  static description = ``;

  static examples = [
    `<%= config.bin %> <%= command.id %> <wallet_name> ....`,
  ];

  async run (): Promise<any> {
    const { args, flags } = this;
    if (!(parseFloat(flags['warning-notification-frequency']) > 0)) {
      throw new ValueError('warning-notification-frequency should be positive number');
    }
    if (!(parseFloat(flags['error-notification-frequency']) > 0)) {
      throw new ValueError('error-notification-frequency should be positive number');
    }
    const settings = deserializeSettings({
      target_loan_amount: bigIntFromDecString(flags['target-loan-amount'], MUSDV0_DECIMALS),
      target_collateral_rate: flags['target-collateral-rate'],
      above_target_collateral_refi_threshold:
        flags['above-target-collateral-refi-threshold'].toLowerCase() == 'null' ? null :
        flags['above-target-collateral-refi-threshold'],
      below_target_collateral_refi_threshold:
        flags['below-target-collateral-refi-threshold'].toLowerCase() == 'null' ? null :
        flags['below-target-collateral-refi-threshold'],
      margin_call_warning_collateral_rate: flags['margin-call-warning-collateral-rate'],
      max_loan_amount_per_utxo: bigIntFromDecString(flags['max-loan-amount-per-utxo'], MUSDV0_DECIMALS),
      retarget_min_musd_amount: bigIntFromDecString(flags['retarget_min_musd_amount'], MUSDV0_DECIMALS),
      txfee_per_byte: flags['txfee-per-byte'],
      tx_reserve_for_change_and_txfee: flags['tx-reserve-for-change-and-txfee'],
      debug: !!flags['debug'],
      dryrun: !!flags['dryrun'],
      warning_notification_frequency:  parseFloat(flags['warning-notification-frequency']),
      error_notification_frequency: parseFloat(flags['error-notification-frequency']),
      notification_hooks: [],
    });
    validateSettings(settings);
    await this.callModuleMethod('moria0_manager.setup', args.wallet_name, settings, { notification_hook_refs: flags['notification-hook'] || [] });
    return {};
  }
}
