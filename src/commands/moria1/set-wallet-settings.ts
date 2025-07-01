import { Args, Flags } from '@oclif/core';
import VegaCommand, { VegaCommandOptions } from '../../lib/vega-command.js';
import { fractionAsReadableText, parseFractionFromString } from '../../lib/util.js';
import { ValueError } from '../../lib/exceptions.js';
import type { Moria1WalletSettings } from '../../lib/main/moria1/types.js';
import { validateMoriaWalletSettings } from '../../lib/main/moria1/helpers.js';

export default class Moria1SetWalletSettings extends VegaCommand<typeof Moria1SetWalletSettings> {
  static args = {
    wallet_name: Args.string({
      name: 'wallet_name',
      required: true,
      description: "wallet name of the loan manager instance.",
    }),
  };
  static flags = {
    'enabled': Flags.string({
      description: `settings.enabled, When it's set to true vegabch-moria1 will track and manage the wallet.`,
      required: true,
      options: [ 'true', 'false' ],
    }),
    'auto-withdraw-from-agent-p2nfth-enabled': Flags.string({
      description: `settings.auto_withdraw_from_agent_p2nfth.enabled, When it's set to true the manager will withdraws all pay-to-nfthash's it owns automatically.`,
      required: false,
      options: [ 'true', 'false' ],
    }),
    'auto-withdraw-from-agent-p2nfth-txfee-per-byte': Flags.string({
      description: `settings.auto_withdraw_from_agent_p2nfth.txfee_per_byte, A fee rate should be assigned when auto withdraw is enabled. The value is expected to be a fraction.`,
      required: false,
    }),
  };
  static vega_options: VegaCommandOptions = {
  };

  static description = ``;

  static examples = [
    `<%= config.bin %> <%= command.id %> <wallet_name>`,
  ];

  async run (): Promise<any> {
    const { args, flags } = this;
    const boolean_flags: { [name: string]: boolean | undefined } = {};
    const boolean_flag_fields = [
      { name: 'enabled', required: true },
      { name: 'auto-withdraw-from-agent-p2nfth-enabled' },
    ];
    for (const { name, required } of boolean_flag_fields) {
      if ((flags as any)[name] == null) {
        if (required) {
          throw new ValueError(`${name} is required!`);
        }
        continue;
      }
      if (['true', 'false'].indexOf((flags as any)[name]) == -1) {
        throw new ValueError(`${name} should be a boolean, true or false.`);
      }
      boolean_flags[name] = (flags as any)[name] === 'true';
    }
    let auto_withdraw_from_agent_p2nfth = undefined;
    if (boolean_flags['auto-withdraw-from-agent-p2nfth-enabled'] == null) {
      if (flags['auto-withdraw-from-agent-p2nfth-txfee-per-byte'] != null) {
        throw new ValueError(`Should not assign "auto-withdraw-from-agent-p2nfth-txfee-per-byte" when "auto-withdraw-from-agent-p2nfth-enabled" is not defined.`);
      }
    } else {
      auto_withdraw_from_agent_p2nfth = {
        enabled: !!boolean_flags['auto-withdraw-from-agent-p2nfth-enabled'],
        txfee_per_byte: flags['auto-withdraw-from-agent-p2nfth-txfee-per-byte'] == null ? { numerator: 1n, denominator: 1n } : parseFractionFromString(flags['auto-withdraw-from-agent-p2nfth-txfee-per-byte'], true),
      };
    }
    const settings: Moria1WalletSettings = {
      enabled: !!boolean_flags['enabled'],
      auto_withdraw_from_agent_p2nfth,
    };
    validateMoriaWalletSettings(settings);
    await this.callModuleMethod('moria1.set-wallet-settings', args.wallet_name, settings);
    return {};
  }
}
