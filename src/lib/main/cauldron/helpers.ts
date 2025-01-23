import { cauldron } from 'cashlab'
import type { Settings } from '../vega-file-storage-provider.js';

export const applySettingsToExchangeLab = (exlab: cauldron.ExchangeLab, settings: Settings) => {
  if ('preferred-token-output-bch-amount' in settings && settings['preferred-token-output-bch-amount'] != '') {
    try {
      const value = BigInt(settings['preferred-token-output-bch-amount']);
      if (!(value > 0n)) {
        throw new Error('value is expected to be a positive integer');
      }
      exlab.setDefaultPreferredTokenOutputBCHAmount(value);
    } catch (err) {
      throw new Error(`Failed to apply a setting, name: "preferred-token-output-bch-amount", error: ` + (err as any)?.message);
    }
  }
};
