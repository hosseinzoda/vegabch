import type { Service } from '../types.js';
import type { UTXO, UTXOWithNFT, Fraction } from '@cashlab/common';
import type { MoriaMutationContext, MoriaCompilerContext } from '@cashlab/moria/v1/types.js';
import type { EventEmitter } from 'node:events';

export type Moria1MUSDStateManagerService = Service & EventEmitter & {
  getAgentLoans (agent_nfthash: Uint8Array): UTXOWithNFT[];
  getLoans (): UTXOWithNFT[];
  getMoriaUTXO (): UTXOWithNFT;
  getDelphiUTXO (): UTXOWithNFT;
  getBPOracleUTXO (): UTXOWithNFT;
  getDelphiGPUpdaterUTXO (): UTXOWithNFT | undefined;
  waitUntilPendingTrackersUpdate (): Promise<void>;
  hasPendingTrackerUpdate (): boolean;
  getCompilerContext (): MoriaCompilerContext;
  createMoriaMutationContext ({ txfee_per_byte }: { txfee_per_byte: Fraction }): MoriaMutationContext;

};

export type Moria1WalletSettings = {
  enabled: boolean;
  auto_withdraw_from_agent_p2nfth?: {
    enabled: boolean;
    txfee_per_byte: Fraction;
  };
};

export type MutationOptions = {
  broadcast?: boolean;
  txfee_per_byte: Fraction;
  verify?: boolean;
};

export type Moria1Status = {
  delphi: {
    price: bigint;
    timestamp: bigint;
    sequence_number: bigint;
    use_fee: bigint;
  } | null;
  bporacle: {
    value: bigint;
    timestamp: bigint;
    use_fee: bigint;
  } | null;
  wallet_moria_settings_list: Array<{
    wallet_name: string;
    settings: Moria1WalletSettings | null;
  }>;
  active_wallet_managers: Array<{
    wallet_name: string;
    agent_nft_list: Array<{
      agent: UTXOWithNFT;
      nfthash: Uint8Array;
      p2nfth_list: UTXO[];
      loan_list: UTXOWithNFT[]
    }>;
  }>;
};
