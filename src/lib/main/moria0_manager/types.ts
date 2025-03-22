import type { Fraction, TokenId, TxResult, Exception } from '@cashlab/common';

export type NotificationHookCommon = {
  name: string;
  target_events?: string[];
  type: 'webhook' | 'email';
};
export type WebNotificationHook = NotificationHookCommon & {
  type: 'webhook';
  link: string;
  method: 'POST' | 'PUT';
  post_content_type: 'json' | 'form-urlenceded';
  headers?: Array<{ name: string, value: string }>;
};
export type EmailNotificationHook = NotificationHookCommon & {
  type: 'email';
  protocol: 'SMTP';
  secure_layer: 'STARTTLS' | 'TLS' | undefined;
  host: string;
  port: number;
  username: string;
  password: string;
  sender: string;
  recipient: string;
};
export type NotificationHook = |
  WebNotificationHook |
  EmailNotificationHook;

export type NotificationMessage = {
  name: string;
  subject: string;
  body: string;
  data: any;
};

export type Moria0LoanManagerSettings = {
  // The target loan amount. The manager increases or decreases the size of the loan
  // based on the state of the wallet it owns and target loan.
  target_loan_amount: bigint; // musd (cents)
  // The collateral rate upon refi or initiation of new loans.
  target_collateral_rate: Fraction | 'MIN';
  // The manager to refi when collateral goes above or below a value.
  // When the value is null refi will not occur,
  // So when below_target is null the manager will not increase collateral to avoid liquidation.
  above_target_collateral_refi_threshold: Fraction | null;
  below_target_collateral_refi_threshold: Fraction | null; 
  // Submit a notification when the collateral level goes below the margin_call_warning_collateral_rate
  // The value of this field should be less than below_target_collateral_refi_threshold to not get
  // unintended notifications
  margin_call_warning_collateral_rate: Fraction;
  // limits, (max possible amount: 100000)
  max_loan_amount_per_utxo: bigint;
  retarget_min_musd_amount: bigint;
  txfee_per_byte: bigint;
  // the transaction generator uses this to manage the bch change remaining after the txfee
  tx_reserve_for_change_and_txfee: bigint;
  dryrun: boolean;
  debug: boolean;
  warning_notification_frequency: number; // frequency of sending warning notifications, in hours
  error_notification_frequency: number; // frequency of sending error notifications, in hours
  notification_hooks: NotificationHook[];
};

export type MoriaV0ManagerStorageData = {
  manager_entries: Array<{ wallet_name: string, settings: any }>;
  enabled_entries: Array<{ wallet_name: string }>;
  manager_state: { [wallet_name: string]: any };
  notification_hooks: NotificationHook[];
};

export type Moria0LoanManagerStatus = {
  loan_amount: bigint;
  collateral_amount: bigint;
  number_of_loans: number;
  number_of_invalid_loans: number;
  lowest_collateral_rate: Fraction | null;
  highest_collateral_rate: Fraction | null;
  average_collateral_rate: Fraction | null;
  notification_hooks: Array<{ name: string }>;
  last_update_timestamp: number | null;
  last_update_actions_pending_deposit: Array<{ name: string, comment: string, amount: bigint, token_id: TokenId }> | null;
  last_update_transaction_chain: Array<{
    action: string;
    metadata?: any;
    tx_result: TxResult;
  }> | null;
  last_update_error: Exception | Error | null;
};
