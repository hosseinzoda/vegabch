import type { NotificationHook, Moria0LoanManagerSettings, MoriaV0ManagerStorageData } from './types.js';
import { convertFractionDenominator, Fraction } from '@cashlab/common';
import { ValueError } from '../../exceptions.js';
import { bigIntToDecString, parseFractionFromString } from '../../util.js';

export const loanManagerSettingsFromStorageData = (settings_data: any, storage_data: MoriaV0ManagerStorageData): Moria0LoanManagerSettings => {
  settings_data = structuredClone(settings_data);
  if (settings_data.notification_hook_refs) {
    for (const hook_name of settings_data.notification_hook_refs) {
      const item = storage_data.notification_hooks.find((a) => a.name == hook_name);
      if (item == null) {
        throw new ValueError(`notification_hook_ref not found, name: ${hook_name}`);
      }
      settings_data.notification_hooks.push(structuredClone(item));
    }
    delete settings_data.notification_hook_refs;
  }
  return deserializeSettings(settings_data);
};
export const loanManagerSettingsDataForStorageData = (settings: Moria0LoanManagerSettings, options: { notification_hook_refs: string[] }, storage_data: MoriaV0ManagerStorageData): any => {
  const settings_data: any = serializeSettings(settings);
  if (options.notification_hook_refs) {
    settings_data.notification_hook_refs = [];
    for (const hook_name of options.notification_hook_refs) {
      const item = storage_data.notification_hooks.find((a) => a.name == hook_name);
      if (item == null) {
        throw new ValueError(`notification_hook_ref not found, name: ${hook_name}`);
      }
      settings_data.notification_hook_refs.push(hook_name);
    }
  }
  return settings_data;
}

export const serializeSettings = (settings: Moria0LoanManagerSettings): any => {
  settings.notification_hooks.forEach((a) => validateNotificationHookData(a));
  return {
    target_loan_amount: serializeBigInt(settings.target_loan_amount, 'target_loan_amount'),
    target_collateral_rate: settings.target_collateral_rate == 'MIN' ? 'MIN' : serializeFraction(settings.target_collateral_rate, 'target_collateral_rate'),
    above_target_collateral_refi_threshold: settings.above_target_collateral_refi_threshold == null ? null : serializeFraction(settings.above_target_collateral_refi_threshold, 'above_target_collateral_refi_threshold'),
    below_target_collateral_refi_threshold: settings.below_target_collateral_refi_threshold == null ? null : serializeFraction(settings.below_target_collateral_refi_threshold, 'below_target_collateral_refi_threshold'),
    notification_hooks: settings.notification_hooks,
    margin_call_warning_collateral_rate: serializeFraction(settings.margin_call_warning_collateral_rate, 'margin_call_warning_collateral_rate'),
    max_loan_amount_per_utxo: serializeBigInt(settings.max_loan_amount_per_utxo, 'max_loan_amount_per_utxo'),
    txfee_per_byte: serializeBigInt(settings.txfee_per_byte, 'txfee_per_byte'),
    tx_reserve_for_change_and_txfee: serializeBigInt(settings.tx_reserve_for_change_and_txfee, 'tx_reserve_for_change_and_txfee'),
    retarget_min_musd_amount: serializeBigInt(settings.retarget_min_musd_amount, 'retarget_min_musd_amount'),
    dryrun: !!settings.dryrun,
    debug: !!settings.debug,
    warning_notification_frequency: settings.warning_notification_frequency > 0 ? settings.warning_notification_frequency : 1,
    error_notification_frequency: settings.error_notification_frequency > 0 ? settings.error_notification_frequency : 1,
  };
};
export const deserializeSettings = (settings: any): Moria0LoanManagerSettings => {
  if (!Array.isArray(settings.notification_hooks)) {
    throw new ValueError(`notification_hooks is not a list!`);
  }
  settings.notification_hooks.forEach((a: any) => validateNotificationHookData(a));
  return {
    target_loan_amount: deserializeBigInt(settings.target_loan_amount, 'target_loan_amount'),
    target_collateral_rate: settings.target_collateral_rate == 'MIN' ? 'MIN' : deserializeFraction(settings.target_collateral_rate, true, 'target_collateral_rate'),
    above_target_collateral_refi_threshold: settings.above_target_collateral_refi_threshold == null ? null : deserializeFraction(settings.above_target_collateral_refi_threshold, true, 'above_target_collateral_refi_threshold'),
    below_target_collateral_refi_threshold: settings.below_target_collateral_refi_threshold == null ? null : deserializeFraction(settings.below_target_collateral_refi_threshold, true, 'below_target_collateral_refi_threshold'),
    notification_hooks: settings.notification_hooks,
    margin_call_warning_collateral_rate: deserializeFraction(settings.margin_call_warning_collateral_rate, true, 'margin_call_warning_collateral_rate'),
    max_loan_amount_per_utxo: deserializeBigInt(settings.max_loan_amount_per_utxo, 'max_loan_amount_per_utxo'),
    txfee_per_byte: deserializeBigInt(settings.txfee_per_byte, 'txfee_per_byte'),
    tx_reserve_for_change_and_txfee: deserializeBigInt(settings.tx_reserve_for_change_and_txfee, 'tx_reserve_for_change_and_txfee'),
    retarget_min_musd_amount: deserializeBigInt(settings.retarget_min_musd_amount, 'retarget_min_musd_amount'),
    dryrun: !!settings.dryrun,
    debug: !!settings.debug,
    warning_notification_frequency: settings.warning_notification_frequency > 0 ? settings.warning_notification_frequency : 1,
    error_notification_frequency: settings.error_notification_frequency > 0 ? settings.error_notification_frequency : 1,
  };
};

export const serializeFraction = (a: Fraction, name: string): any => {
  if (typeof a.numerator != 'bigint' || typeof a.denominator != 'bigint') {
    throw new ValueError(name + '.numerator & .denominator are expected to be bigints');
  }
  return { numerator: a.numerator+'', denominator: a.denominator+'' }
};
export const deserializeFraction = (a: any, unsigned: boolean, name: string): Fraction => {
  if (typeof a == 'string') {
    try {
      return parseFractionFromString(a, unsigned);
    } catch (err) {
      if (err instanceof ValueError) {
        throw new ValueError(`${name} parse failed, ${err.message}`);
      }
    }
  }
  let value;
  try {
    value = { numerator: BigInt(a.numerator), denominator: BigInt(a.denominator) };
  } catch (err) {
    throw new ValueError(`${name} should be a Fraction, Failed to parse.`);
  }
  if (unsigned && value.numerator < 0n) {
    throw new ValueError(`${name} should be an unsigned fraction, got: ${JSON.stringify(a)}`);
  }
  if (unsigned && value.denominator < 0n) {
    throw new ValueError(`${name} should be an unsigned fraction, got: ${JSON.stringify(a)}`);
  }
  return value;
};
export const serializeBigInt = (a: bigint, name: string): string => {
  if (typeof a != 'bigint') {
    throw new ValueError(`${name} should be a bigint.`);
  }
  return a+'';
};
export const deserializeBigInt = (a: string, name: string): bigint => {
  try {
    return BigInt(a);
  } catch (err) {
    throw new ValueError (`${name} should be an integer, Failed to parse.`);
  }
};

export const validateSettings = (a: Moria0LoanManagerSettings): void => {
  if (!(a.target_loan_amount >= 0n)) {
    throw new ValueError(`target_loan_amount should be greater than or equal to zero!`);
  }
  const min_collateral_rate = { numerator: 1100n, denominator: 1000n };
  const min_target_collateral_rate = { numerator: 3000n, denominator: 2000n };
  const target_collateral_rate_value = a.target_collateral_rate == 'MIN' ? min_target_collateral_rate : a.target_collateral_rate;
  if (convertFractionDenominator(target_collateral_rate_value, min_target_collateral_rate.denominator).numerator < min_target_collateral_rate.numerator) {
    throw new ValueError(`target_collateral_rate should not be less than 1.5`);
  }
  if (a.below_target_collateral_refi_threshold != null) {
    if (convertFractionDenominator(a.below_target_collateral_refi_threshold, min_collateral_rate.denominator).numerator <= min_collateral_rate.numerator) {
      throw new ValueError(`below_target_collateral_refi_threshold should be greater than 1.1`);
    }
    if (convertFractionDenominator(a.below_target_collateral_refi_threshold, target_collateral_rate_value.denominator).numerator >= target_collateral_rate_value.numerator) {
      throw new ValueError(`below_target_collateral_refi_threshold should be less than target_collateral_rate`);
    }
    if (convertFractionDenominator(a.margin_call_warning_collateral_rate, a.below_target_collateral_refi_threshold.denominator).numerator >= a.below_target_collateral_refi_threshold.numerator) {
      throw new ValueError(`margin_call_warning_collateral_rate should be less than below_target_collateral_refi_threshold`);
    }
  }
  if (a.above_target_collateral_refi_threshold != null) {
    if (convertFractionDenominator(a.above_target_collateral_refi_threshold, target_collateral_rate_value.denominator).numerator <= target_collateral_rate_value.numerator) {
      throw new ValueError(`above_target_collateral_refi_threshold should be greater than target_collateral_rate`);
    }
  }
  if (convertFractionDenominator(a.margin_call_warning_collateral_rate, target_collateral_rate_value.denominator).numerator >= target_collateral_rate_value.numerator) {
    throw new ValueError(`margin_call_warning_collateral_rate should be less than target_collateral_rate`);
  }
  if (!(a.max_loan_amount_per_utxo >= 100n && a.max_loan_amount_per_utxo <= 100000n)) {
    throw new ValueError(`max_loan_amount_per_utxo not in range, accepted values, 100 <= max_loan_amount_per_utxo <= 100000)`);
  }
  if (!(a.txfee_per_byte >= 0n)) {
    throw new ValueError(`txfee_per_byte should be greater than or equal to zero.`);
  }
  if (!(a.tx_reserve_for_change_and_txfee >= 10000n)) {
    throw new ValueError(`tx_reserve_for_change_and_txfee should be greater than or equal to 10000.`);
  }
  if (!(a.retarget_min_musd_amount >= 100n && a.retarget_min_musd_amount <= 100000n)) {
    throw new ValueError(`retarget_min_musd_amount not in range, accepted values, 100 <= retarget_min_musd_amount <= 100000)`);
  }
  if (!(a.warning_notification_frequency > 0)) {
    throw new ValueError('warning_notification_frequency should be greater than zero.');
  }
  if (!(a.error_notification_frequency > 0)) {
    throw new ValueError('error_notification_frequency should be greater than zero.');
  }
};

export const validateNotificationHookData = (a: NotificationHook): void => {
  if (typeof a.name != 'string' || a.name == '') {
    throw new ValueError('notification.name should be a non-empty string');
  }
  if (a.target_events != null) {
    if (!Array.isArray(a.target_events)) {
      throw new ValueError('notification.target_events should be an array or null.');
    }
    for (const item of a.target_events) {
      if (typeof item != 'string' || item == '') {
        throw new ValueError('notification.target_events[i] to be a non-empty string');
      }
    }
  }
  if (a.type == 'email') {
    const accepted_protocols = ['SMTP'];
    if (accepted_protocols.indexOf(a.protocol) == -1) {
      throw new ValueError('email_notification.protocol should be one of (' + accepted_protocols.map((a) => '"'+a+'"').join(', ') + '), got: ' + a.protocol);
    }
    const accepted_secure_layers = ['STARTTLS', 'TLS'];
    if (a.secure_layer !== undefined && accepted_secure_layers.indexOf(a.secure_layer) == -1) {
      throw new ValueError('email_notification.secure_layer should be one of (' + accepted_secure_layers.map((a) => '"'+a+'"').join(', ') + '), got: ' + a.protocol);
    }
    if (typeof a.host != 'string' || a.host == '') {
      throw new ValueError('email_notification.host should be a non-empty string');
    }
    try {
      const port = BigInt(a.port);
      if (!(port > 0n && port <= 65535)) {
        throw new ValueError('email_notification.port is not in range');
      }
    } catch (err) {
      throw new Error(`email_notification.port should be a valid integer, ${err}`);
    }
    if (typeof a.username != 'string' || a.username == '') {
      throw new ValueError('email_notification.username should be a non-empty string');
    }
    if (typeof a.password != 'string' || a.password == '') {
      throw new ValueError('email_notification.password should be a non-empty string');
    }
    if (typeof a.sender != 'string' || a.sender == '') {
      throw new ValueError('email_notification.sender should be a non-empty string');
    }
    if (typeof a.recipient != 'string' || a.recipient == '') {
      throw new ValueError('email_notification.recipient should be a non-empty string');
    }
  } else if (a.type == 'webhook') {
    if (typeof a.link != 'string' || a.link == '') {
      throw new ValueError('webhook_notification.username should be a non-empty string');
    }
    try {
      new URL(a.link);
    } catch (err) {
      throw new ValueError(`webook_notification.link is not a valid url, error: ${err}`);
    }
    const accepted_methods = ['POST','PUT'];
    if (accepted_methods.indexOf(a.method) == -1) {
      throw new ValueError(`webhook_notification.method should be one of the following: (${accepted_methods.map((a) => '"'+a+'"').join(', ')}), got: ${a.method}`);
    }
    const accepted_post_content_types = ['json', 'form-urlencoded'];
    if (accepted_post_content_types.indexOf(a.post_content_type) == -1) {
      throw new ValueError(`webhook_notification.post_content_type should be one of the following: (${accepted_post_content_types.map((a) => '"'+a+'"').join(', ')}), got: ${a.post_content_type}`);
    }
    if (a.headers != null) {
      if (!Array.isArray(a.headers)) {
        throw new ValueError('webhook_notification.headers should be an array or null.');
      }
      for (const { name, value } of a.headers) {
        if (typeof name != 'string' || name == '') {
          throw new ValueError('webhook_notification.headers[i].name should be a non-empty string');
        }
        if (typeof value != 'string' || value == '') {
          throw new ValueError('webhook_notification.headers[i].value should be a non-empty string');
        }
      }
    }
  } else {
    throw new ValueError(`Unknown notification type: ${(a as any)?.type}`);
  }
};
