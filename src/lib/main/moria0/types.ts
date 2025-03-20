import type { Service } from '../types.js';
import type { moria as cashlab_moria, UTXOWithNFT } from 'cashlab';
import type { EventEmitter } from 'node:events';

export type Moria0State = {
  moria: cashlab_moria.MoriaV0;
  moria_utxo: UTXOWithNFT;
  oracle_utxo: UTXOWithNFT;
  moria_locking_bytecode: Uint8Array;
  loan_locking_bytecode: Uint8Array;
  oracle_locking_bytecode: Uint8Array;
  oracle_owner_pubkey: Uint8Array;
};

export type Moria0StateManagerService = Service & EventEmitter & {
  getWalletLoans (pkh: Uint8Array): UTXOWithNFT[];
  getLoans (): UTXOWithNFT[];
  requireMoriaState (): Promise<Moria0State>;
  getMoriaState (): Moria0State | undefined;
  waitUntilPendingTrackersUpdate (): Promise<void>;
  hasPendingTrackerUpdate (): boolean;
};

