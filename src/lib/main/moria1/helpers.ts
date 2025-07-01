import type { Moria1WalletSettings } from './types.js';
import { ValueError } from '../../exceptions.js';

export function validateMoriaWalletSettings (settings: Moria1WalletSettings): void {
  if (typeof settings.enabled != 'boolean') {
    throw new ValueError(`Expecting wallet_settings.moria.enabled to be a boolean`);
  }
  if (settings.auto_withdraw_from_agent_p2nfth != null) {
    if (typeof settings.auto_withdraw_from_agent_p2nfth.enabled != 'boolean') {
      throw new ValueError(`Expecting wallet_settings.auto_withdraw_from_agent_p2nfth.enabled to be a boolean`);
    }
    const txfee_per_byte = settings.auto_withdraw_from_agent_p2nfth.txfee_per_byte;
    if (txfee_per_byte == null || typeof txfee_per_byte.numerator != 'bigint' ||
      typeof txfee_per_byte.denominator != 'bigint' ||
      txfee_per_byte.numerator < 0n || txfee_per_byte.denominator <= 0n) {
      throw new ValueError(`Expecting wallet_settings.auto_withdraw_from_agent_p2nfth.txfee_per_byte to be a non-negative Fraction, type = { numerator: bigint; denominator: bigint; }`);
    }
  }
}


export function deserializeMoriaWalletSettings (data: any): Moria1WalletSettings {
  const settings = {
    enabled: data.enabled,
    auto_withdraw_from_agent_p2nfth: data.auto_withdraw_from_agent_p2nfth != null ? {
      enabled: data.auto_withdraw_from_agent_p2nfth.enabled,
      txfee_per_byte: {
        numerator: BigInt(data.auto_withdraw_from_agent_p2nfth.txfee_per_byte?.numerator),
        denominator: BigInt(data.auto_withdraw_from_agent_p2nfth.txfee_per_byte?.denominator),
      },
    } : undefined,
  };
  validateMoriaWalletSettings(settings);
  return settings;
}

export function serializeMoriaWalletSettings (settings: Moria1WalletSettings): any {
  return {
    enabled: settings.enabled,
    auto_withdraw_from_agent_p2nfth: settings.auto_withdraw_from_agent_p2nfth != null ? {
      enabled: settings.auto_withdraw_from_agent_p2nfth.enabled,
      txfee_per_byte: {
        numerator: settings.auto_withdraw_from_agent_p2nfth.txfee_per_byte.numerator+'',
        denominator: settings.auto_withdraw_from_agent_p2nfth.txfee_per_byte.denominator+'',
      },
    } : undefined,
  };
}
