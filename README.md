vegabch
=================

BCH defi trading tool


[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/vegabch.svg)](https://npmjs.org/package/vegabch)
[![Downloads/week](https://img.shields.io/npm/dw/vegabch.svg)](https://npmjs.org/package/vegabch)


<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g vegabch
$ vegabch COMMAND
running command...
$ vegabch (--version)
vegabch/0.1.3-beta.1 linux-x64 node-v22.14.0
$ vegabch --help [COMMAND]
USAGE
  $ vegabch COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->

* [`vegabch help [COMMAND]`](#vegabch-help-command)

## Daemon

* [`vegabch daemon:gen-rpcauth USERNAME`](#vegabch-daemongen-rpcauth-username)
* [`vegabch daemon:run`](#vegabch-daemonrun)

## Wallet

* [`vegabch wallet:balance`](#vegabch-walletbalance)
* [`vegabch wallet:bch-deposit-address`](#vegabch-walletbch-deposit-address)
* [`vegabch wallet:create NAME TYPE NETWORK`](#vegabch-walletcreate-name-type-network)
* [`vegabch wallet:generate NAME TYPE NETWORK`](#vegabch-walletgenerate-name-type-network)
* [`vegabch wallet:list`](#vegabch-walletlist)
* [`vegabch wallet:pin NAME`](#vegabch-walletpin-name)
* [`vegabch wallet:token-deposit-address`](#vegabch-wallettoken-deposit-address)
* [`vegabch wallet:unpin`](#vegabch-walletunpin)


## Cauldron

* [`vegabch cauldron:construct-trade SUPPLY_TOKEN DEMAND_TOKEN AMOUNT [OUTPUT]`](#vegabch-cauldronconstruct-trade-supply_token-demand_token-amount-output)
* [`vegabch cauldron:fund-trade TRADE_FILE`](#vegabch-cauldronfund-trade-trade_file)

## MoriaV0

* [`vegabch moria0:add-collateral LOAN_OUTPOINT ADDITIONAL_AMOUNT`](#vegabch-moria0add-collateral-loan_outpoint-additional_amount)
* [`vegabch moria0:get-loans`](#vegabch-moria0get-loans)
* [`vegabch moria0:get-my-loans`](#vegabch-moria0get-my-loans)
* [`vegabch moria0:liquidate-loan LOAN_OUTPOINT`](#vegabch-moria0liquidate-loan-loan_outpoint)
* [`vegabch moria0:mint-loan LOAN_AMOUNT COLLATERAL_AMOUNT`](#vegabch-moria0mint-loan-loan_amount-collateral_amount)
* [`vegabch moria0:reduce-loan LOAN_OUTPOINT NEXT_COLLATERAL_PERCENTAGE`](#vegabch-moria0reduce-loan-loan_outpoint-next_collateral_percentage)
* [`vegabch moria0:repay-loan LOAN_OUTPOINT`](#vegabch-moria0repay-loan-loan_outpoint)
* [`vegabch moria0:sunset-redeem LOAN_OUTPOINT SUNSET_DATASIG`](#vegabch-moria0sunset-redeem-loan_outpoint-sunset_datasig)

### MoriaV0 Loan Manager

* [`vegabch moria0-manager:enable WALLET_NAME`](#vegabch-moria0-managerenable-wallet_name)
* [`vegabch moria0-manager:disable WALLET_NAME`](#vegabch-moria0-managerdisable-wallet_name)
* [`vegabch moria0-manager:print-settings WALLET_NAME`](#vegabch-moria0-managerprint-settings-wallet_name)
* [`vegabch moria0-manager:print-notification-hook HOOK_NAME`](#vegabch-moria0-managerprint-notification-hook-hook_name)
* [`vegabch moria0-manager:delete-notification-hook HOOK_NAME`](#vegabch-moria0-managerdelete-notification-hook-hook_name)
* [`vegabch moria0-manager:set-email-notification-hook HOOK_NAME`](#vegabch-moria0-managerset-email-notification-hook-hook_name)
* [`vegabch moria0-manager:set-web-notification-hook HOOK_NAME`](#vegabch-moria0-managerset-web-notification-hook-hook_name)
* [`vegabch moria0-manager:setup WALLET_NAME`](#vegabch-moria0-managersetup-wallet_name)
* [`vegabch moria0-manager:status WALLET_NAME`](#vegabch-moria0-managerstatus-wallet_name)
* [`vegabch moria0-manager:trigger-test-notification WALLET_NAME NOTIFICATION_NAME`](#vegabch-moria0-managertrigger-test-notification-wallet_name-notification_name)


## MoriaV1

* [`vegabch moria1:add-collateral LOAN_OUTPOINT ADDITIONAL_AMOUNT`](#vegabch-moria1add-collateral-loan_outpoint-additional_amount)
* [`vegabch moria1:get-loans`](#vegabch-moria1get-loans)
* [`vegabch moria1:liquidate-loan LOAN_OUTPOINT`](#vegabch-moria1liquidate-loan-loan_outpoint)
* [`vegabch moria1:mint-loan LOAN_AMOUNT COLLATERAL_AMOUNT ANNUAL_INTEREST_RATE`](#vegabch-moria1mint-loan-loan_amount-collateral_amount-annual_interest_rate)
* [`vegabch moria1:print-wallet-settings WALLET_NAME`](#vegabch-moria1print-wallet-settings-wallet_name)
* [`vegabch moria1:redeem-loan LOAN_OUTPOINT`](#vegabch-moria1redeem-loan-loan_outpoint)
* [`vegabch moria1:refi-loan INPUT_LOAN_OUTPOINT LOAN_AMOUNT COLLATERAL_AMOUNT ANNUAL_INTEREST_RATE`](#vegabch-moria1refi-loan-input_loan_outpoint-loan_amount-collateral_amount-annual_interest_rate)
* [`vegabch moria1:repay-loan LOAN_OUTPOINT`](#vegabch-moria1repay-loan-loan_outpoint)
* [`vegabch moria1:set-wallet-settings WALLET_NAME`](#vegabch-moria1set-wallet-settings-wallet_name)
* [`vegabch moria1:status`](#vegabch-moria1status)
* [`vegabch moria1:wallet-withdraw-from-agent-p2nfth AGENT_NFTHASH`](#vegabch-moria1wallet-withdraw-from-agent-p2nfth-agent_nfthash)

## Misc

* [`vegabch network:broadcast-transaction TRANSACTION NETWORK`](#vegabch-networkbroadcast-transaction-transaction-network)

* [`vegabch settings:delete NAME`](#vegabch-settingsdelete-name)
* [`vegabch settings:get NAME`](#vegabch-settingsget-name)
* [`vegabch settings:list`](#vegabch-settingslist)
* [`vegabch settings:set NAME VALUE`](#vegabch-settingsset-name-value)

* [`vegabch token:list`](#vegabch-tokenlist)
* [`vegabch token:register TOKEN_ID`](#vegabch-tokenregister-token_id)


## `vegabch daemon:gen-rpcauth USERNAME`

```
USAGE
  $ vegabch daemon:gen-rpcauth USERNAME [--password <value>]

ARGUMENTS
  USERNAME  A path to the daemon's config.

FLAGS
  --password=<value>  If defined, the given password will be used to print out the rpcauth.

EXAMPLES
  $ vegabch daemon:gen-rpcauth <username>

  $ vegabch daemon:gen-rpcauth <username> --password <pre-defined-password>
```

_See code: [src/commands/daemon/gen-rpcauth.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/daemon/gen-rpcauth.ts)_

## `vegabch daemon:run`

```
USAGE
  $ vegabch daemon:run --config <value> [--json]

FLAGS
  --config=<value>  (required) A path to the config file. Depending on the command the config can be for a client,
                    daemon or standalone setup.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch daemon:run
```

_See code: [src/commands/daemon/run.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/daemon/run.ts)_

## `vegabch help [COMMAND]`

Display help for vegabch.

```
USAGE
  $ vegabch help [COMMAND...] [-n]

ARGUMENTS
  COMMAND...  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for vegabch.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.2.21/src/commands/help.ts)_


## `vegabch wallet:balance`

view a balance of all tokens.

```
USAGE
  $ vegabch wallet:balance --config <value> [--json] [-w <wallet_name>]

FLAGS
  -w, --wallet=<wallet_name>  Select a wallet.
      --config=<value>        (required) A path to the config file. Depending on the command the config can be for a
                              client, daemon or standalone setup.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  view a balance of all tokens.

EXAMPLES
  $ vegabch wallet:balance

FLAG DESCRIPTIONS
  -w, --wallet=<wallet_name>  Select a wallet.

    The name of wallet to use when it performs the command.
```

_See code: [src/commands/wallet/balance.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/wallet/balance.ts)_

## `vegabch wallet:bch-deposit-address`

Get a bch deposit address for the given wallet.

```
USAGE
  $ vegabch wallet:bch-deposit-address --config <value> [--json] [-w <wallet_name>]

FLAGS
  -w, --wallet=<wallet_name>  Select a wallet.
      --config=<value>        (required) A path to the config file. Depending on the command the config can be for a
                              client, daemon or standalone setup.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Get a bch deposit address for the given wallet.

EXAMPLES
  $ vegabch wallet:bch-deposit-address

FLAG DESCRIPTIONS
  -w, --wallet=<wallet_name>  Select a wallet.

    The name of wallet to use when it performs the command.
```

_See code: [src/commands/wallet/bch-deposit-address.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/wallet/bch-deposit-address.ts)_

## `vegabch wallet:create NAME TYPE NETWORK`

create a wallet

```
USAGE
  $ vegabch wallet:create NAME TYPE NETWORK --config <value> [--json] [-m <value>] [-p <value>] [-s <value>]

ARGUMENTS
  NAME     A unique name for referencing the wallet once saved.
  TYPE     (seed|wif) Type of the wallet.
  NETWORK  (mainnet|testnet|regtest) [default: mainnet] Wallet's target network.

FLAGS
  --mnemonic=<value>         Wallet's mnemonic words, hd wallet's private key represented as mnemonic words.
  --derivation-path=<value>  Wallet's mnemonic words, hd wallet's private key represented as mnemonic words.
  --secret=<value>           Wallet's private key represented as wallet import format (wif).
      --config=<value>       (required) A path to the config file. Depending on the command the config can be for a
                             client, daemon or standalone setup.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  create a wallet

EXAMPLES
  $ vegabch wallet:create mywallet seed --mnemonic '<12 words>' --derivation-path "m/44'/0'/0'"

  $ vegabch wallet:create mywallet seed mainnet --mnemonic '<12 words>'

  $ vegabch wallet:create mywallet wif --secret '<the wif secret>'
```

_See code: [src/commands/wallet/create.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/wallet/create.ts)_

## `vegabch wallet:generate NAME TYPE NETWORK`

generate a wallet

```
USAGE
  $ vegabch wallet:generate NAME TYPE NETWORK --config <value> [--json]

ARGUMENTS
  NAME     A unique name for referencing the wallet once saved.
  TYPE     (seed|wif) Type of the wallet.
  NETWORK  (mainnet|testnet|regtest) [default: mainnet] Wallet's target network.

FLAGS
  --config=<value>  (required) A path to the config file. Depending on the command the config can be for a client,
                    daemon or standalone setup.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  generate a wallet

EXAMPLES
  $ vegabch wallet:generate mywallet seed

  $ vegabch wallet:generate mywallet wif testnet
```

_See code: [src/commands/wallet/generate.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/wallet/generate.ts)_

## `vegabch wallet:list`

get list of all wallets.

```
USAGE
  $ vegabch wallet:list --config <value> [--json]

FLAGS
  --config=<value>  (required) A path to the config file. Depending on the command the config can be for a client,
                    daemon or standalone setup.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  get list of all wallets.

EXAMPLES
  $ vegabch wallet:list
```

_See code: [src/commands/wallet/list.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/wallet/list.ts)_

## `vegabch wallet:pin NAME`

pin a wallet

```
USAGE
  $ vegabch wallet:pin NAME --config <value> [--json]

ARGUMENTS
  NAME  the wallet name to pin.

FLAGS
  --config=<value>  (required) A path to the config file. Depending on the command the config can be for a client,
                    daemon or standalone setup.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  pin a wallet

EXAMPLES
  $ vegabch wallet:pin mywallet
```

_See code: [src/commands/wallet/pin.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/wallet/pin.ts)_

## `vegabch wallet:token-deposit-address`

Get a token deposit address for the given wallet.

```
USAGE
  $ vegabch wallet:token-deposit-address --config <value> [--json] [-w <wallet_name>]

FLAGS
  -w, --wallet=<wallet_name>  Select a wallet.
      --config=<value>        (required) A path to the config file. Depending on the command the config can be for a
                              client, daemon or standalone setup.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Get a token deposit address for the given wallet.

EXAMPLES
  $ vegabch wallet:token-deposit-address

FLAG DESCRIPTIONS
  -w, --wallet=<wallet_name>  Select a wallet.

    The name of wallet to use when it performs the command.
```

_See code: [src/commands/wallet/token-deposit-address.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/wallet/token-deposit-address.ts)_

## `vegabch wallet:unpin`

unpin the pinned wallet.

```
USAGE
  $ vegabch wallet:unpin --config <value> [--json]

FLAGS
  --config=<value>  (required) A path to the config file. Depending on the command the config can be for a client,
                    daemon or standalone setup.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  unpin the pinned wallet.

EXAMPLES
  $ vegabch wallet:unpin
```

_See code: [src/commands/wallet/unpin.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/wallet/unpin.ts)_





## `vegabch cauldron:construct-trade SUPPLY_TOKEN DEMAND_TOKEN AMOUNT [OUTPUT]`

construct a cauldron trade, Uses multiple pools to acquire a target amount at the best rate. When the target is demand, The trade's demand will be equal or slightly greater than the given amount. And when the target is supply, The trade's supply will be equal or slightly less than the given amount.

```
USAGE
  $ vegabch cauldron:construct-trade SUPPLY_TOKEN DEMAND_TOKEN AMOUNT [OUTPUT] --config <value> --txfee-per-byte <value>
    [--json] [--target-demand] [--target-supply] [--decimal-amounts]

ARGUMENTS
  SUPPLY_TOKEN  The token to offer for the trade, Expecting a token id or "BCH" for the native token.
  DEMAND_TOKEN  The token to request as the result of the trade, Expecting a token id or "BCH" for the native token.
  AMOUNT        Amount of tokens to acquire, Expecting an integer.
  OUTPUT        The trade output file, By default the output will be written to stdout if --json is enabled.

FLAGS
  --config=<value>          (required) A path to the config file. Depending on the command the config can be for a
                            client, daemon or standalone setup.
  --decimal-amounts         Read/Write amounts as a decimal number, Using token's defined decimals (example: BCH has 8
                            decimals)
  --target-demand           The amount provided is target demand when this flag is enabled. (Enabled by default)
  --target-supply           The amount provided is target supply when this flag is enabled.
  --txfee-per-byte=<value>  (required) [default: 1] Specify the txfee per byte in sats, By default the suggested tx fee
                            will be used.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  construct a cauldron trade, Uses multiple pools to acquire a target amount at the best rate. When the target is
  demand, The trade's demand will be equal or slightly greater than the given amount. And when the target is supply, The
  trade's supply will be equal or slightly less than the given amount.

EXAMPLES
  $ vegabch cauldron:construct-trade
```

_See code: [src/commands/cauldron/construct-trade.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/cauldron/construct-trade.ts)_

## `vegabch cauldron:fund-trade TRADE_FILE`

Fund a trade with your wallet.

```
USAGE
  $ vegabch cauldron:fund-trade TRADE_FILE --config <value> --txfee-per-byte <value> [--json] [-w <wallet_name>]
    [--broadcast] [--txoutput <value>] [--allow-mixed-payout] [--burn-dust-tokens]

ARGUMENTS
  TRADE_FILE  A path to a file contianing the trade, or pass "-" (minus sign) and send the trade (represented in json
              format) via stdin.

FLAGS
  -w, --wallet=<wallet_name>    Select a wallet.
      --allow-mixed-payout      An output in BCH can contain the native bch & a token. Enabling this will allow the
                                payout to mix a token payout and the bch payout in one output.
      --broadcast               Broadcast the trade's transaction, This flag will push the constructed transaction to
                                the network after funding has been satisfied.
      --burn-dust-tokens        Burns dust tokens (instead of adding to payout) when enabled & allow-mixed-payout is
                                disabled. Less than 100 sats worth of the token is considered as dust tokens. (The value
                                of the token is based on the trades exchange rate).
      --config=<value>          (required) A path to the config file. Depending on the command the config can be for a
                                client, daemon or standalone setup.
      --txfee-per-byte=<value>  (required) [default: 1] Specify the txfee per byte in sats, By default the suggested tx
                                fee will be used.
      --txoutput=<value>        Will write the funded trade transaction in the txoutput. By default the transaction will
                                be written to stdout if --json is enabled.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Fund a trade with your wallet.

EXAMPLES
  $ vegabch cauldron:fund-trade

FLAG DESCRIPTIONS
  -w, --wallet=<wallet_name>  Select a wallet.

    The name of wallet to use when it performs the command.
```

_See code: [src/commands/cauldron/fund-trade.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/cauldron/fund-trade.ts)_



## `vegabch moria0:add-collateral LOAN_OUTPOINT ADDITIONAL_AMOUNT`

```
USAGE
  $ vegabch moria0:add-collateral LOAN_OUTPOINT ADDITIONAL_AMOUNT --config <value> --txfee-per-byte <value> [--json] [-w
    <wallet_name>] [--broadcast]

ARGUMENTS
  LOAN_OUTPOINT      The outpoint of the loan nft utxo. <txid>:<index>
  ADDITIONAL_AMOUNT  Increase the loan's collateral by the additional_amount. The amount is a decimal number, 1.00000000
                     is equal to 100000000 sats or one bch.

FLAGS
  -w, --wallet=<wallet_name>    Select a wallet.
      --broadcast               Broadcast the transactions generated by the command.
      --config=<value>          (required) A path to the config file. Depending on the command the config can be for a
                                client, daemon or standalone setup.
      --txfee-per-byte=<value>  (required) [default: 1] Specify the txfee per byte in sats.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch moria0:add-collateral

FLAG DESCRIPTIONS
  -w, --wallet=<wallet_name>  Select a wallet.

    The name of wallet to use when it performs the command.
```

_See code: [src/commands/moria0/add-collateral.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/moria0/add-collateral.ts)_

## `vegabch moria0:get-loans`

```
USAGE
  $ vegabch moria0:get-loans --config <value> [--json]

FLAGS
  --config=<value>  (required) A path to the config file. Depending on the command the config can be for a client,
                    daemon or standalone setup.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch moria0:get-loans
```

_See code: [src/commands/moria0/get-loans.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/moria0/get-loans.ts)_

## `vegabch moria0:get-my-loans`

```
USAGE
  $ vegabch moria0:get-my-loans --config <value> [--json] [-w <wallet_name>]

FLAGS
  -w, --wallet=<wallet_name>  Select a wallet.
      --config=<value>        (required) A path to the config file. Depending on the command the config can be for a
                              client, daemon or standalone setup.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch moria0:get-my-loans

FLAG DESCRIPTIONS
  -w, --wallet=<wallet_name>  Select a wallet.

    The name of wallet to use when it performs the command.
```

_See code: [src/commands/moria0/get-my-loans.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/moria0/get-my-loans.ts)_

## `vegabch moria0:liquidate-loan LOAN_OUTPOINT`

```
USAGE
  $ vegabch moria0:liquidate-loan LOAN_OUTPOINT --config <value> --txfee-per-byte <value> [--json] [-w <wallet_name>]
    [--broadcast]

ARGUMENTS
  LOAN_OUTPOINT  The outpoint of the loan nft utxo. <txid>:<index>

FLAGS
  -w, --wallet=<wallet_name>    Select a wallet.
      --broadcast               Broadcast the transactions generated by the command.
      --config=<value>          (required) A path to the config file. Depending on the command the config can be for a
                                client, daemon or standalone setup.
      --txfee-per-byte=<value>  (required) [default: 1] Specify the txfee per byte in sats.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch moria0:liquidate-loan

FLAG DESCRIPTIONS
  -w, --wallet=<wallet_name>  Select a wallet.

    The name of wallet to use when it performs the command.
```

_See code: [src/commands/moria0/liquidate-loan.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/moria0/liquidate-loan.ts)_

## `vegabch moria0:mint-loan LOAN_AMOUNT COLLATERAL_AMOUNT`

```
USAGE
  $ vegabch moria0:mint-loan LOAN_AMOUNT COLLATERAL_AMOUNT --config <value> --txfee-per-byte <value> [--json] [-w
    <wallet_name>] [--broadcast]

ARGUMENTS
  LOAN_AMOUNT        Loan amount in MUSD, A decimal number 1.00 is one dollar.
  COLLATERAL_AMOUNT  Colateral amount, At least it should be worth 150% of the loan amount. The amount is a decimal
                     number, 1.00000000 is equal to 100000000 sats or one bch.

FLAGS
  -w, --wallet=<wallet_name>    Select a wallet.
      --broadcast               Broadcast the transactions generated by the command.
      --config=<value>          (required) A path to the config file. Depending on the command the config can be for a
                                client, daemon or standalone setup.
      --txfee-per-byte=<value>  (required) [default: 1] Specify the txfee per byte in sats.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch moria0:mint-loan

FLAG DESCRIPTIONS
  -w, --wallet=<wallet_name>  Select a wallet.

    The name of wallet to use when it performs the command.
```

_See code: [src/commands/moria0/mint-loan.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/moria0/mint-loan.ts)_

## `vegabch moria0:reduce-loan LOAN_OUTPOINT NEXT_COLLATERAL_PERCENTAGE`

```
USAGE
  $ vegabch moria0:reduce-loan LOAN_OUTPOINT NEXT_COLLATERAL_PERCENTAGE --config <value> --txfee-per-byte <value>
    [--json] [-w <wallet_name>] [--broadcast]

ARGUMENTS
  LOAN_OUTPOINT               The outpoint of the loan nft utxo. <txid>:<index>
  NEXT_COLLATERAL_PERCENTAGE  A decimal number representing next collateral percentage or MIN to reduce the collateral
                              to the minimum amount.

FLAGS
  -w, --wallet=<wallet_name>    Select a wallet.
      --broadcast               Broadcast the transactions generated by the command.
      --config=<value>          (required) A path to the config file. Depending on the command the config can be for a
                                client, daemon or standalone setup.
      --txfee-per-byte=<value>  (required) [default: 1] Specify the txfee per byte in sats.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch moria0:reduce-loan

FLAG DESCRIPTIONS
  -w, --wallet=<wallet_name>  Select a wallet.

    The name of wallet to use when it performs the command.
```

_See code: [src/commands/moria0/reduce-loan.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/moria0/reduce-loan.ts)_

## `vegabch moria0:repay-loan LOAN_OUTPOINT`

```
USAGE
  $ vegabch moria0:repay-loan LOAN_OUTPOINT --config <value> --txfee-per-byte <value> [--json] [-w <wallet_name>]
    [--broadcast]

ARGUMENTS
  LOAN_OUTPOINT  The outpoint of the loan nft utxo. <txid>:<index>

FLAGS
  -w, --wallet=<wallet_name>    Select a wallet.
      --broadcast               Broadcast the transactions generated by the command.
      --config=<value>          (required) A path to the config file. Depending on the command the config can be for a
                                client, daemon or standalone setup.
      --txfee-per-byte=<value>  (required) [default: 1] Specify the txfee per byte in sats.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch moria0:repay-loan

FLAG DESCRIPTIONS
  -w, --wallet=<wallet_name>  Select a wallet.

    The name of wallet to use when it performs the command.
```

_See code: [src/commands/moria0/repay-loan.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/moria0/repay-loan.ts)_

## `vegabch moria0:sunset-redeem LOAN_OUTPOINT SUNSET_DATASIG`

```
USAGE
  $ vegabch moria0:sunset-redeem LOAN_OUTPOINT SUNSET_DATASIG --config <value> --txfee-per-byte <value> [--json] [-w
    <wallet_name>] [--broadcast]

ARGUMENTS
  LOAN_OUTPOINT   The outpoint of the loan nft utxo. <txid>:<index>
  SUNSET_DATASIG  hexstring representation of sunset message signature.

FLAGS
  -w, --wallet=<wallet_name>    Select a wallet.
      --broadcast               Broadcast the transactions generated by the command.
      --config=<value>          (required) A path to the config file. Depending on the command the config can be for a
                                client, daemon or standalone setup.
      --txfee-per-byte=<value>  (required) [default: 1] Specify the txfee per byte in sats.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch moria0:sunset-redeem

FLAG DESCRIPTIONS
  -w, --wallet=<wallet_name>  Select a wallet.

    The name of wallet to use when it performs the command.
```

_See code: [src/commands/moria0/sunset-redeem.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/moria0/sunset-redeem.ts)_




## `vegabch moria0-manager:enable WALLET_NAME`

```
USAGE
  $ vegabch moria0-manager:enable WALLET_NAME --config <value> [--json]

ARGUMENTS
  WALLET_NAME  Enable moria0 manager for the wallet_name

FLAGS
  --config=<value>  (required) A path to the config file. Depending on the command the config can be for a client,
                    daemon or standalone setup.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch moria0-manager:enable <wallet_name>
```

_See code: [src/commands/moria0-manager/enable.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/moria0-manager/enable.ts)_

## `vegabch moria0-manager:disable WALLET_NAME`

```
USAGE
  $ vegabch moria0-manager:disable WALLET_NAME --config <value> [--json]

ARGUMENTS
  WALLET_NAME  Enable moria0 manager for the wallet_name

FLAGS
  --config=<value>  (required) A path to the config file. Depending on the command the config can be for a client,
                    daemon or standalone setup.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch moria0-manager:disable <wallet_name>
```

_See code: [src/commands/moria0-manager/disable.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/moria0-manager/disable.ts)_

## `vegabch moria0-manager:print-settings WALLET_NAME`

```
USAGE
  $ vegabch moria0-manager:print-settings WALLET_NAME --config <value> [--json]

ARGUMENTS
  WALLET_NAME  wallet name of the loan manager instance.

FLAGS
  --config=<value>  (required) A path to the config file. Depending on the command the config can be for a client,
                    daemon or standalone setup.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch moria0-manager:print-settings <wallet_name>
```

_See code: [src/commands/moria0-manager/print-settings.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/moria0-manager/print-settings.ts)_

## `vegabch moria0-manager:print-notification-hook HOOK_NAME`

```
USAGE
  $ vegabch moria0-manager:print-notification-hook HOOK_NAME --config <value> [--json]

ARGUMENTS
  HOOK_NAME  wallet name of the loan manager instance.

FLAGS
  --config=<value>  (required) A path to the config file. Depending on the command the config can be for a client,
                    daemon or standalone setup.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch moria0-manager:print-notification-hook <hook_name> ....
```

_See code: [src/commands/moria0-manager/print-notification-hook.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/moria0-manager/print-notification-hook.ts)_

## `vegabch moria0-manager:delete-notification-hook HOOK_NAME`

```
USAGE
  $ vegabch moria0-manager:delete-notification-hook HOOK_NAME --config <value> [--json]

ARGUMENTS
  HOOK_NAME  wallet name of the loan manager instance.

FLAGS
  --config=<value>  (required) A path to the config file. Depending on the command the config can be for a client,
                    daemon or standalone setup.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch moria0-manager:delete-notification-hook <hook_name> ....
```

_See code: [src/commands/moria0-manager/delete-notification-hook.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/moria0-manager/delete-notification-hook.ts)_


## `vegabch moria0-manager:set-email-notification-hook HOOK_NAME`

```
USAGE
  $ vegabch moria0-manager:set-email-notification-hook HOOK_NAME --config <value> --protocol SMTP --host <value> --port <value> --username
    <value> --password <value> --sender <value> --recipient <value> [--json] [--target-events <value>...]
    [--secure-layer STARTTLS|TLS]

ARGUMENTS
  HOOK_NAME  wallet name of the loan manager instance.

FLAGS
  --config=<value>            (required) A path to the config file. Depending on the command the config can be for a
                              client, daemon or standalone setup.
  --host=<value>              (required) email server host.
  --password=<value>          (required) email's authorization password.
  --port=<value>              (required) email server port.
  --protocol=<option>         (required) [default: SMTP] notification hook's email protocol
                              <options: SMTP>
  --recipient=<value>         (required) notification recipient email.
  --secure-layer=<option>     protocol's secure layer.
                              <options: STARTTLS|TLS>
  --sender=<value>            (required) notification from email.
  --target-events=<value>...  trigger the notification for the target-events, If not defined it'll be triggered for all
                              events.
  --username=<value>          (required) email's authorization username.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch moria0-manager:set-email-notification-hook <hook_name> ....
```

_See code: [src/commands/moria0-manager/set-email-notification-hook.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/moria0-manager/set-email-notification-hook.ts)_

## `vegabch moria0-manager:set-web-notification-hook HOOK_NAME`

```
USAGE
  $ vegabch moria0-manager:set-web-notification-hook HOOK_NAME --config <value> --link <value> --method POST|PUT --post-content-type
    json|form-urlencoded [--json] [--target-events <value>...] [--header <value>...]

ARGUMENTS
  HOOK_NAME  wallet name of the loan manager instance.

FLAGS
  --config=<value>              (required) A path to the config file. Depending on the command the config can be for a
                                client, daemon or standalone setup.
  --header=<value>...           Value format, "Name:Value"
  --link=<value>                (required) notification hook's http or https link
  --method=<option>             (required) [default: POST] web request's method.
                                <options: POST|PUT>
  --post-content-type=<option>  (required) [default: json] post's content type.
                                <options: json|form-urlencoded>
  --target-events=<value>...    trigger the notification for the target-events, If not defined it'll be triggered for
                                all events.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch moria0-manager:set-web-notification-hook <hook_name> ....
```

_See code: [src/commands/moria0-manager/set-web-notification-hook.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/moria0-manager/set-web-notification-hook.ts)_

## `vegabch moria0-manager:setup WALLET_NAME`

```
USAGE
  $ vegabch moria0-manager:setup WALLET_NAME --config <value> --target-loan-amount <value> --target-collateral-rate
    <value> --above-target-collateral-refi-threshold <value> --below-target-collateral-refi-threshold <value>
    --margin-call-warning-collateral-rate <value> --max-loan-amount-per-utxo <value> --retarget_min_musd_amount <value>
    --txfee-per-byte <value> --tx-reserve-for-change-and-txfee <value> --dryrun --debug --warning-notification-frequency
    <value> --error-notification-frequency <value> [--json] [--notification-hook <value>...]

ARGUMENTS
  WALLET_NAME  wallet name of the loan manager instance.

FLAGS
  --above-target-collateral-refi-threshold=<value>  (required) settings.above_target_collateral_refi_threshold (type:
                                                    fraction or null).
  --below-target-collateral-refi-threshold=<value>  (required) settings.below_target_collateral_refi_threshold (type:
                                                    fraction or null).
  --config=<value>                                  (required) A path to the config file. Depending on the command the
                                                    config can be for a client, daemon or standalone setup.
  --debug                                           (required) settings.debug (type: boolean).
  --dryrun                                          (required) settings.dryrun (type: boolean).
  --error-notification-frequency=<value>            (required) [default: 1] settings.error_notification_frequency (type:
                                                    number).
  --margin-call-warning-collateral-rate=<value>     (required) settings.margin_call_warning_collateral_rate (type:
                                                    fraction).
  --max-loan-amount-per-utxo=<value>                (required) [default: 1000.00] settings.max_loan_amount_per_utxo,
                                                    (type: decimal) in MUSDV0.
  --notification-hook=<value>...                    names of the notification_hooks to assign to this entry.
  --retarget_min_musd_amount=<value>                (required) [default: 1.00] settings.retarget_min_musd_amount, (type:
                                                    decimal) in MUSDV0.
  --target-collateral-rate=<value>                  (required) settings.target_collateral_rate (type: fraction).
  --target-loan-amount=<value>                      (required) settings.target_loan_amount, (type: decimal) in MUSDV0.
  --tx-reserve-for-change-and-txfee=<value>         (required) [default: 10000] settings.tx_reserve_for_change_and_txfee
                                                    (type: integer), A reserve change for every generated tx by the loan
                                                    manager.
  --txfee-per-byte=<value>                          (required) [default: 1] settings.txfee_per_byte (type: integer),
                                                    Specify the txfee per byte in sats.
  --warning-notification-frequency=<value>          (required) [default: 1] settings.warning_notification_frequency
                                                    (type: number).

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch moria0-manager:setup <wallet_name> ....
```

_See code: [src/commands/moria0-manager/setup.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/moria0-manager/setup.ts)_

## `vegabch moria0-manager:status WALLET_NAME`

```
USAGE
  $ vegabch moria0-manager:status WALLET_NAME --config <value> [--json]

ARGUMENTS
  WALLET_NAME  wallet name of the loan manager instance.

FLAGS
  --config=<value>  (required) A path to the config file. Depending on the command the config can be for a client,
                    daemon or standalone setup.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch moria0-manager:status <wallet_name>
```

_See code: [src/commands/moria0-manager/status.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/moria0-manager/status.ts)_

## `vegabch moria0-manager:trigger-test-notification WALLET_NAME NOTIFICATION_NAME`

```
USAGE
  $ vegabch moria0-manager:trigger-test-notification WALLET_NAME NOTIFICATION_NAME --config <value> [--json]

ARGUMENTS
  WALLET_NAME        wallet name of the loan manager instance.
  NOTIFICATION_NAME  The name of the test notification to trigger.

FLAGS
  --config=<value>  (required) A path to the config file. Depending on the command the config can be for a client,
                    daemon or standalone setup.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch moria0-manager:trigger-test-notification <wallet_name> <notification_name>
```

_See code: [src/commands/moria0-manager/trigger-test-notification.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/moria0-manager/trigger-test-notification.ts)_







## `vegabch moria1:add-collateral LOAN_OUTPOINT ADDITIONAL_AMOUNT`

```
USAGE
  $ vegabch moria1:add-collateral LOAN_OUTPOINT ADDITIONAL_AMOUNT --config <value> --txfee-per-byte <value> [--json] [-w
    <wallet_name>] [--broadcast]

ARGUMENTS
  LOAN_OUTPOINT      The outpoint of the loan nft utxo. <txid>:<index>
  ADDITIONAL_AMOUNT  Additional colateral to add, The amount is a decimal number, 1.00000000 is equal to 100000000 sats
                     or one bch.

FLAGS
  -w, --wallet=<wallet_name>    Select a wallet.
      --broadcast               Broadcast the transactions generated by the command.
      --config=<value>          (required) A path to the config file. Depending on the command the config can be for a
                                client, daemon or standalone setup.
      --txfee-per-byte=<value>  (required) [default: 1] Specify the txfee per byte in sats. The value can be a fraction.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch moria1:add-collateral <loan_outpoint> <additional_amount>

FLAG DESCRIPTIONS
  -w, --wallet=<wallet_name>  Select a wallet.

    The name of wallet to use when it performs the command.
```

_See code: [src/commands/moria1/add-collateral.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/moria1/add-collateral.ts)_

## `vegabch moria1:get-loans`

```
USAGE
  $ vegabch moria1:get-loans --config <value> [--json] [--loan-agent-nfthash <value>] [--liquidable] [--redeemable]
    [--orderby interest_asc|interest_desc|principal_asc|principal_desc|timestamp_asc|timestamp_desc]

FLAGS
  --config=<value>              (required) A path to the config file. Depending on the command the config can be for a
                                client, daemon or standalone setup.
  --liquidable                  Only show under-water loans that anyone can liquidate.
  --loan-agent-nfthash=<value>  Request to get loans of a particular agent nft.
  --orderby=<option>            Sort loans.
                                <options:
                                interest_asc|interest_desc|principal_asc|principal_desc|timestamp_asc|timestamp_desc>
  --redeemable                  Only show loans below the bporacle interest rate threshold. Reedemable loans.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch moria1:get-loans
```

_See code: [src/commands/moria1/get-loans.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/moria1/get-loans.ts)_

## `vegabch moria1:liquidate-loan LOAN_OUTPOINT`

```
USAGE
  $ vegabch moria1:liquidate-loan LOAN_OUTPOINT --config <value> --txfee-per-byte <value> [--json] [-w <wallet_name>]
    [--broadcast]

ARGUMENTS
  LOAN_OUTPOINT  The outpoint of the loan nft utxo. <txid>:<index>

FLAGS
  -w, --wallet=<wallet_name>    Select a wallet.
      --broadcast               Broadcast the transactions generated by the command.
      --config=<value>          (required) A path to the config file. Depending on the command the config can be for a
                                client, daemon or standalone setup.
      --txfee-per-byte=<value>  (required) [default: 1] Specify the txfee per byte in sats. The value can be a fraction.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch moria1:liquidate-loan <loan_outpoint>

FLAG DESCRIPTIONS
  -w, --wallet=<wallet_name>  Select a wallet.

    The name of wallet to use when it performs the command.
```

_See code: [src/commands/moria1/liquidate-loan.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/moria1/liquidate-loan.ts)_

## `vegabch moria1:mint-loan LOAN_AMOUNT COLLATERAL_AMOUNT ANNUAL_INTEREST_RATE`

```
USAGE
  $ vegabch moria1:mint-loan LOAN_AMOUNT COLLATERAL_AMOUNT ANNUAL_INTEREST_RATE --config <value> --txfee-per-byte
    <value> [--json] [-w <wallet_name>] [--broadcast]

ARGUMENTS
  LOAN_AMOUNT           Loan amount in MUSD, A decimal number 1.00 is one dollar.
  COLLATERAL_AMOUNT     Colateral amount, At least it should be worth 150% of the loan amount. The amount is a decimal
                        number, 1.00000000 is equal to 100000000 sats or one bch.
  ANNUAL_INTEREST_RATE  Annual interest rate, The input value is the precentage of interest to pay annually with two
                        decimal points, Range: 0% <=> 327.00%

FLAGS
  -w, --wallet=<wallet_name>    Select a wallet.
      --broadcast               Broadcast the transactions generated by the command.
      --config=<value>          (required) A path to the config file. Depending on the command the config can be for a
                                client, daemon or standalone setup.
      --txfee-per-byte=<value>  (required) [default: 1] Specify the txfee per byte in sats. The value can be a fraction.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch moria1:mint-loan <loan_amount> <collateral_amount> <annual_interest_rate>

FLAG DESCRIPTIONS
  -w, --wallet=<wallet_name>  Select a wallet.

    The name of wallet to use when it performs the command.
```

_See code: [src/commands/moria1/mint-loan.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/moria1/mint-loan.ts)_

## `vegabch moria1:print-wallet-settings WALLET_NAME`

```
USAGE
  $ vegabch moria1:print-wallet-settings WALLET_NAME --config <value> [--json]

ARGUMENTS
  WALLET_NAME  wallet name of the loan manager instance.

FLAGS
  --config=<value>  (required) A path to the config file. Depending on the command the config can be for a client,
                    daemon or standalone setup.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch moria1:print-wallet-settings <wallet_name>
```

_See code: [src/commands/moria1/print-wallet-settings.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/moria1/print-wallet-settings.ts)_

## `vegabch moria1:redeem-loan LOAN_OUTPOINT`

```
USAGE
  $ vegabch moria1:redeem-loan LOAN_OUTPOINT --config <value> --txfee-per-byte <value> [--json] [-w <wallet_name>]
    [--split-payout-tokens] [--broadcast]

ARGUMENTS
  LOAN_OUTPOINT  The outpoint of the loan nft utxo. <txid>:<index>

FLAGS
  -w, --wallet=<wallet_name>    Select a wallet.
      --broadcast               Broadcast the transactions generated by the command.
      --config=<value>          (required) A path to the config file. Depending on the command the config can be for a
                                client, daemon or standalone setup.
      --split-payout-tokens     Generates a secondary transaction to split the mixed bch/token payouts.
      --txfee-per-byte=<value>  (required) [default: 1] Specify the txfee per byte in sats. The value can be a fraction.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch moria1:redeem-loan <loan_outpoint>

FLAG DESCRIPTIONS
  -w, --wallet=<wallet_name>  Select a wallet.

    The name of wallet to use when it performs the command.
```

_See code: [src/commands/moria1/redeem-loan.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/moria1/redeem-loan.ts)_

## `vegabch moria1:refi-loan INPUT_LOAN_OUTPOINT LOAN_AMOUNT COLLATERAL_AMOUNT ANNUAL_INTEREST_RATE`

```
USAGE
  $ vegabch moria1:refi-loan INPUT_LOAN_OUTPOINT LOAN_AMOUNT COLLATERAL_AMOUNT ANNUAL_INTEREST_RATE --config <value>
    --txfee-per-byte <value> [--json] [-w <wallet_name>] [--broadcast]

ARGUMENTS
  INPUT_LOAN_OUTPOINT   The outpoint of the loan nft utxo. <txid>:<index>
  LOAN_AMOUNT           Loan amount in MUSD, A decimal number 1.00 is one dollar.
  COLLATERAL_AMOUNT     Colateral amount, At least it should be worth 150% of the loan amount. The amount is a decimal
                        number, 1.00000000 is equal to 100000000 sats or one bch.
  ANNUAL_INTEREST_RATE  Annual interest rate, The input value is the precentage of interest to pay annually with two
                        decimal points, Range: 0% <=> 327.00%

FLAGS
  -w, --wallet=<wallet_name>    Select a wallet.
      --broadcast               Broadcast the transactions generated by the command.
      --config=<value>          (required) A path to the config file. Depending on the command the config can be for a
                                client, daemon or standalone setup.
      --txfee-per-byte=<value>  (required) [default: 1] Specify the txfee per byte in sats. The value can be a fraction.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch moria1:refi-loan <loan_outpoint> <loan_amount> <collateral_amount> <annual_interest_rate>

FLAG DESCRIPTIONS
  -w, --wallet=<wallet_name>  Select a wallet.

    The name of wallet to use when it performs the command.
```

_See code: [src/commands/moria1/refi-loan.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/moria1/refi-loan.ts)_

## `vegabch moria1:repay-loan LOAN_OUTPOINT`

```
USAGE
  $ vegabch moria1:repay-loan LOAN_OUTPOINT --config <value> --txfee-per-byte <value> [--json] [-w <wallet_name>]
    [--broadcast]

ARGUMENTS
  LOAN_OUTPOINT  The outpoint of the loan nft utxo. <txid>:<index>

FLAGS
  -w, --wallet=<wallet_name>    Select a wallet.
      --broadcast               Broadcast the transactions generated by the command.
      --config=<value>          (required) A path to the config file. Depending on the command the config can be for a
                                client, daemon or standalone setup.
      --txfee-per-byte=<value>  (required) [default: 1] Specify the txfee per byte in sats. The value can be a fraction.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch moria1:repay-loan <loan_outpoint>

FLAG DESCRIPTIONS
  -w, --wallet=<wallet_name>  Select a wallet.

    The name of wallet to use when it performs the command.
```

_See code: [src/commands/moria1/repay-loan.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/moria1/repay-loan.ts)_

## `vegabch moria1:set-wallet-settings WALLET_NAME`

```
USAGE
  $ vegabch moria1:set-wallet-settings WALLET_NAME --config <value> --enabled true|false [--json]
    [--auto-withdraw-from-agent-p2nfth-enabled true|false] [--auto-withdraw-from-agent-p2nfth-txfee-per-byte <value>]

ARGUMENTS
  WALLET_NAME  wallet name of the loan manager instance.

FLAGS
  --auto-withdraw-from-agent-p2nfth-enabled=<option>        settings.auto_withdraw_from_agent_p2nfth.enabled, When it's
                                                            set to true the manager will withdraws all pay-to-nfthash's
                                                            it owns automatically.
                                                            <options: true|false>
  --auto-withdraw-from-agent-p2nfth-txfee-per-byte=<value>  settings.auto_withdraw_from_agent_p2nfth.txfee_per_byte, A
                                                            fee rate should be assigned when auto withdraw is enabled.
                                                            The value is expected to be a fraction.
  --config=<value>                                          (required) A path to the config file. Depending on the
                                                            command the config can be for a client, daemon or standalone
                                                            setup.
  --enabled=<option>                                        (required) settings.enabled, When it's set to true
                                                            vegabch-moria1 will track and manage the wallet.
                                                            <options: true|false>

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch moria1:set-wallet-settings <wallet_name>
```

_See code: [src/commands/moria1/set-wallet-settings.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/moria1/set-wallet-settings.ts)_

## `vegabch moria1:status`

```
USAGE
  $ vegabch moria1:status --config <value> [--json]

FLAGS
  --config=<value>  (required) A path to the config file. Depending on the command the config can be for a client,
                    daemon or standalone setup.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch moria1:status
```

_See code: [src/commands/moria1/status.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/moria1/status.ts)_

## `vegabch moria1:wallet-withdraw-from-agent-p2nfth AGENT_NFTHASH`

```
USAGE
  $ vegabch moria1:wallet-withdraw-from-agent-p2nfth AGENT_NFTHASH --config <value> --txfee-per-byte <value> [--json] [-w <wallet_name>]
    [--broadcast]

ARGUMENTS
  AGENT_NFTHASH  The nfthash of the agent nft utxo.

FLAGS
  -w, --wallet=<wallet_name>    Select a wallet.
      --broadcast               Broadcast the transactions generated by the command.
      --config=<value>          (required) A path to the config file. Depending on the command the config can be for a
                                client, daemon or standalone setup.
      --txfee-per-byte=<value>  (required) [default: 1] Specify the txfee per byte in sats. The value can be a fraction.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  $ vegabch moria1:wallet-withdraw-from-agent-p2nfth -w <wallet_name> <agent_outpoint>

FLAG DESCRIPTIONS
  -w, --wallet=<wallet_name>  Select a wallet.

    The name of wallet to use when it performs the command.
```

_See code: [src/commands/moria1/wallet-withdraw-from-agent-p2nfth.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/moria1/wallet-withdraw-from-agent-p2nfth.ts)_








## `vegabch network:broadcast-transaction TRANSACTION NETWORK`

Broadcast the transaction.

```
USAGE
  $ vegabch network:broadcast-transaction TRANSACTION NETWORK --config <value> [--json]

ARGUMENTS
  TRANSACTION  A hexstring representation of the transaction.
  NETWORK      (mainnet|testnet|regtest) [default: mainnet] Target network.

FLAGS
  --config=<value>  (required) A path to the config file. Depending on the command the config can be for a client,
                    daemon or standalone setup.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Broadcast the transaction.

EXAMPLES
  $ vegabch network:broadcast-transaction
```

_See code: [src/commands/network/broadcast-transaction.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/network/broadcast-transaction.ts)_

## `vegabch settings:delete NAME`

delete a setting

```
USAGE
  $ vegabch settings:delete NAME --config <value> [--json]

ARGUMENTS
  NAME  name

FLAGS
  --config=<value>  (required) A path to the config file. Depending on the command the config can be for a client,
                    daemon or standalone setup.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  delete a setting

EXAMPLES
  $ vegabch settings:delete <name>
```

_See code: [src/commands/settings/delete.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/settings/delete.ts)_

## `vegabch settings:get NAME`

get the value of a setting

```
USAGE
  $ vegabch settings:get NAME --config <value> [--json]

ARGUMENTS
  NAME  name

FLAGS
  --config=<value>  (required) A path to the config file. Depending on the command the config can be for a client,
                    daemon or standalone setup.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  get the value of a setting

EXAMPLES
  $ vegabch settings:get <name>
```

_See code: [src/commands/settings/get.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/settings/get.ts)_

## `vegabch settings:list`

Prints all recorded settings

```
USAGE
  $ vegabch settings:list --config <value> [--json]

FLAGS
  --config=<value>  (required) A path to the config file. Depending on the command the config can be for a client,
                    daemon or standalone setup.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Prints all recorded settings

EXAMPLES
  $ vegabch settings:list
```

_See code: [src/commands/settings/list.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/settings/list.ts)_

## `vegabch settings:set NAME VALUE`

set wallet settings

```
USAGE
  $ vegabch settings:set NAME VALUE --config <value> [--json]

ARGUMENTS
  NAME   name
  VALUE  value

FLAGS
  --config=<value>  (required) A path to the config file. Depending on the command the config can be for a client,
                    daemon or standalone setup.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  set wallet settings

EXAMPLES
  $ vegabch settings:set <name> <value>
```

_See code: [src/commands/settings/set.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/settings/set.ts)_

## `vegabch token:list`

Get the list of registered tokens.

```
USAGE
  $ vegabch token:list --config <value> [--json]

FLAGS
  --config=<value>  (required) A path to the config file. Depending on the command the config can be for a client,
                    daemon or standalone setup.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Get the list of registered tokens.

EXAMPLES
  $ vegabch token:list
```

_See code: [src/commands/token/list.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/token/list.ts)_

## `vegabch token:register TOKEN_ID`

Add a BCMR token record from its baseauth.

```
USAGE
  $ vegabch token:register TOKEN_ID --config <value> [--json] [--overwrite]

ARGUMENTS
  TOKEN_ID  The authbase txid for the token.

FLAGS
  --config=<value>  (required) A path to the config file. Depending on the command the config can be for a client,
                    daemon or standalone setup.
  --overwrite       When enabled it will overwrite the identity if it does already exists.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Add a BCMR token record from its baseauth.

EXAMPLES
  $ vegabch token:register <authbase>
```

_See code: [src/commands/token/register.ts](https://github.com/hosseinzoda/vegabch/blob/v0.1.3-beta.1/src/commands/token/register.ts)_

<!-- commandsstop -->
