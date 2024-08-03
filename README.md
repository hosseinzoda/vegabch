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
vegabch/0.0.11 linux-x64 node-v20.13.1
$ vegabch --help [COMMAND]
USAGE
  $ vegabch COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`vegabch wallet:generate NAME TYPE NETWORK`](#vegabch-walletgenerate-name-type-network)
* [`vegabch wallet:create NAME TYPE NETWORK`](#vegabch-walletcreate-name-type-network)
* [`vegabch wallet:list`](#vegabch-walletlist)
* [`vegabch wallet:balance`](#vegabch-walletbalance)
* [`vegabch wallet:bch-deposit-address`](#vegabch-walletbch-deposit-address)
* [`vegabch wallet:token-deposit-address`](#vegabch-wallettoken-deposit-address)
* [`vegabch wallet:pin NAME`](#vegabch-walletpin-name)
* [`vegabch wallet:unpin`](#vegabch-walletunpin)

* [`vegabch token:list`](#vegabch-tokenlist)
* [`vegabch token:register AUTHBASE NETWORK`](#vegabch-tokenregister-authbase-network)

* [`vegabch network:broadcast-transaction TRANSACTION NETWORK`](#vegabch-networkbroadcast-transaction-transaction-network)

* [`vegabch cauldron:construct-trade SUPPLY_TOKEN DEMAND_TOKEN AMOUNT [OUTPUT]`](#vegabch-cauldronconstruct-trade-supply_token-demand_token-amount-output)
* [`vegabch cauldron:fund-trade TRADE_FILE`](#vegabch-cauldronfund-trade-trade_file)

## `vegabch wallet:generate NAME TYPE NETWORK`

generate a wallet

```
USAGE
  $ vegabch wallet:generate NAME TYPE NETWORK [--json] [-c <value>]

ARGUMENTS
  NAME     A unique name for referencing the wallet once saved.
  TYPE     (seed|wif) Type of the wallet.
  NETWORK  (mainnet|testnet|regtest) [default: mainnet] Wallet's target network.

FLAGS
  -c, --vega-storage-file=<value>  [default: vega-storage.json] path to storage wallet file, VEGA_STORAGE_FILE
                                   environment variable can be used to set the flag.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  generate a wallet

EXAMPLES
  $ vegabch wallet:generate mywallet seed

  $ vegabch wallet:generate mywallet wif testnet
```

_See code: [src/commands/wallet/generate.ts](https://github.com/hosseinzoda/vegabch/blob/v0.0.11/src/commands/wallet/generate.ts)_

## `vegabch wallet:create NAME TYPE NETWORK`

create a wallet

```
USAGE
  $ vegabch wallet:create NAME TYPE NETWORK [--json] [-c <value>] [-m <value>] [-p <value>] [-s <value>]

ARGUMENTS
  NAME     A unique name for referencing the wallet once saved.
  TYPE     (seed|wif) Type of the wallet.
  NETWORK  (mainnet|testnet|regtest) [default: mainnet] Wallet's target network.

FLAGS
  -c, --vega-storage-file=<value>  [default: vega-storage.json] path to storage wallet file, VEGA_STORAGE_FILE
                                   environment variable can be used to set the flag.
  --mnemonic=<value>               Wallet's mnemonic words, hd wallet's private key represented as mnemonic words.
  --derivation-path=<value>        Wallet's mnemonic words, hd wallet's private key represented as mnemonic words.
  --secret=<value>                 Wallet's private key represented as wallet import format (wif).

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  create a wallet

EXAMPLES
  $ vegabch wallet:create mywallet seed --mnemonic '<12 words>' --derivation-path "m/44'/0'/0'"

  $ vegabch wallet:create mywallet seed mainnet --mnemonic '<12 words>'

  $ vegabch wallet:create mywallet wif --secret '<the wif secret>'
```

_See code: [src/commands/wallet/create.ts](https://github.com/hosseinzoda/vegabch/blob/v0.0.11/src/commands/wallet/create.ts)_

## `vegabch wallet:list`

get list of all wallets.

```
USAGE
  $ vegabch wallet:list [--json] [-c <value>] [-w <value>]

FLAGS
  -c, --vega-storage-file=<value>  [default: vega-storage.json] path to storage wallet file, VEGA_STORAGE_FILE
                                   environment variable can be used to set the flag.
  -w, --wallet=<wallet_name>       Select a wallet.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  get list of all wallets.

EXAMPLES
  $ vegabch wallet:list

FLAG DESCRIPTIONS
  -w, --wallet=<wallet_name>  Select a wallet.

    The name of wallet to use when it performs the command.
```

_See code: [src/commands/wallet/list.ts](https://github.com/hosseinzoda/vegabch/blob/v0.0.11/src/commands/wallet/list.ts)_

## `vegabch wallet:balance`

view a balance of all tokens.

```
USAGE
  $ vegabch wallet:balance [--json] [-c <value>] [-w <value>]

FLAGS
  -c, --vega-storage-file=<value>  [default: vega-storage.json] path to storage wallet file, VEGA_STORAGE_FILE
                                   environment variable can be used to set the flag.
  -w, --wallet=<wallet_name>       Select a wallet.

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

_See code: [src/commands/wallet/balance.ts](https://github.com/hosseinzoda/vegabch/blob/v0.0.11/src/commands/wallet/balance.ts)_

## `vegabch wallet:bch-deposit-address`

Get a bch deposit address for the given wallet.

```
USAGE
  $ vegabch wallet:bch-deposit-address [--json] [-c <value>] [-w <value>]

FLAGS
  -c, --vega-storage-file=<value>  [default: vega-storage.json] path to storage wallet file, VEGA_STORAGE_FILE
                                   environment variable can be used to set the flag.
  -w, --wallet=<wallet_name>       Select a wallet.

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

_See code: [src/commands/wallet/bch-deposit-address.ts](https://github.com/hosseinzoda/vegabch/blob/v0.0.11/src/commands/wallet/bch-deposit-address.ts)_

## `vegabch wallet:token-deposit-address`

Get a token deposit address for the given wallet.

```
USAGE
  $ vegabch wallet:token-deposit-address [--json] [-c <value>] [-w <value>]

FLAGS
  -c, --vega-storage-file=<value>  [default: vega-storage.json] path to storage wallet file, VEGA_STORAGE_FILE
                                   environment variable can be used to set the flag.
  -w, --wallet=<wallet_name>       Select a wallet.

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

_See code: [src/commands/wallet/token-deposit-address.ts](https://github.com/hosseinzoda/vegabch/blob/v0.0.11/src/commands/wallet/token-deposit-address.ts)_

## `vegabch wallet:pin NAME`

pin a wallet

```
USAGE
  $ vegabch wallet:pin NAME [--json] [-c <value>]

ARGUMENTS
  NAME  the wallet name to pin.

FLAGS
  -c, --vega-storage-file=<value>  [default: vega-storage.json] path to storage wallet file, VEGA_STORAGE_FILE
                                   environment variable can be used to set the flag.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  pin a wallet

EXAMPLES
  $ vegabch wallet:pin mywallet
```

_See code: [src/commands/wallet/pin.ts](https://github.com/hosseinzoda/vegabch/blob/v0.0.11/src/commands/wallet/pin.ts)_

## `vegabch wallet:unpin`

unpin the pinned wallet.

```
USAGE
  $ vegabch wallet:unpin [--json] [-c <value>]

FLAGS
  -c, --vega-storage-file=<value>  [default: vega-storage.json] path to storage wallet file, VEGA_STORAGE_FILE
                                   environment variable can be used to set the flag.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  unpin the pinned wallet.

EXAMPLES
  $ vegabch wallet:unpin
```

_See code: [src/commands/wallet/unpin.ts](https://github.com/hosseinzoda/vegabch/blob/v0.0.11/src/commands/wallet/unpin.ts)_


## `vegabch token:list`

Get the list of registered tokens.

```
USAGE
  $ vegabch token:list [--json] [-c <value>]

FLAGS
  -c, --vega-storage-file=<value>  [default: vega-storage.json] path to storage wallet file, VEGA_STORAGE_FILE
                                   environment variable can be used to set the flag.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Get the list of registered tokens.

EXAMPLES
  $ vegabch token:list
```

_See code: [src/commands/token/list.ts](https://github.com/hosseinzoda/vegabch/blob/v0.0.11/src/commands/token/list.ts)_

## `vegabch token:register AUTHBASE NETWORK`

Add a BCMR token record from its baseauth.

```
USAGE
  $ vegabch token:register AUTHBASE NETWORK [--json] [-c <value>]

ARGUMENTS
  AUTHBASE  The authbase txid for the token.
  NETWORK   (mainnet|testnet|regtest) [default: mainnet] Target network.

FLAGS
  -c, --vega-storage-file=<value>  [default: vega-storage.json] path to storage wallet file, VEGA_STORAGE_FILE
                                   environment variable can be used to set the flag.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Add a BCMR token record from its baseauth.

EXAMPLES
  $ vegabch token:register <authbase>
```

_See code: [src/commands/token/register.ts](https://github.com/hosseinzoda/vegabch/blob/v0.0.11/src/commands/token/register.ts)_


## `vegabch network:broadcast-transaction TRANSACTION NETWORK`

Broadcast the transaction.

```
USAGE
  $ vegabch network:broadcast-transaction TRANSACTION NETWORK [--json] [-c <value>]

ARGUMENTS
  TRANSACTION  A hexstring representation of the transaction.
  NETWORK      (mainnet|testnet|regtest) [default: mainnet] Target network.

FLAGS
  -c, --vega-storage-file=<value>  [default: vega-storage.json] path to storage wallet file, VEGA_STORAGE_FILE
                                   environment variable can be used to set the flag.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Broadcast the transaction.

EXAMPLES
  $ vegabch network:broadcast-transaction
```

_See code: [src/commands/network/broadcast-transaction.ts](https://github.com/hosseinzoda/vegabch/blob/v0.0.11/src/commands/network/broadcast-transaction.ts)_

## `vegabch cauldron:construct-trade SUPPLY_TOKEN DEMAND_TOKEN AMOUNT [OUTPUT]`

construct a cauldron trade, Uses multiple pools to acquire a target amount at the best rate. When the target is demand, The trade's demand will be equal or slightly greater than the given amount. And when the target is supply, The trade's supply will be equal or slightly less than the given amount.

```
USAGE
  $ vegabch cauldron:construct-trade SUPPLY_TOKEN DEMAND_TOKEN AMOUNT [OUTPUT] --cauldron-indexer-endpoint <value> [--json]
    [-c <value>] [--target-demand] [--target-supply] [--decimal-amounts] [--txfee-per-byte <value>] [--network
    mainnet|testnet|regtest]

ARGUMENTS
  SUPPLY_TOKEN  The token to offer for the trade, Expecting a token id or "BCH" for the native token.
  DEMAND_TOKEN  The token to request as the result of the trade, Expecting a token id or "BCH" for the native token.
  AMOUNT        Amount of tokens to acquire, Expecting an integer.
  OUTPUT        The trade output file, By default the output will be written to stdout if --json is enabled.

FLAGS
  -c, --vega-storage-file=<value>          [default: vega-storage.json] path to storage wallet file, VEGA_STORAGE_FILE
                                           environment variable can be used to set the flag.
      --cauldron-indexer-endpoint=<value>  (required) A url to the cauldron contracts indexer. CAULDRON_INDEXER_ENDPOINT
                                           environment variable can also be used to set it.
      --decimal-amounts                    Read/Write amounts as a decimal number, Using token's defined decimals
                                           (example: BCH has 8 decimals)
      --network=<option>                   [default: mainnet] Network that will be used to broadcast the final
                                           transaction, This option is only used when txfee-per-byte is not defined. In
                                           that case the suggested fee from the network will be used.
                                           <options: mainnet|testnet|regtest>
      --target-demand                      The amount provided is target demand when this flag is enabled. (Enabled by
                                           default)
      --target-supply                      The amount provided is target supply when this flag is enabled.
      --txfee-per-byte=<value>             Specify the txfee per byte in sats, By default the suggested tx fee will be
                                           used.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  construct a cauldron trade, Uses multiple pools to acquire a target amount at the best rate. The trade demand will be
  equal or slightly greater than given demand-amount.

EXAMPLES
  $ vegabch cauldron:construct-trade
```

_See code: [src/commands/cauldron/construct-trade.ts](https://github.com/hosseinzoda/vegabch/blob/v0.0.11/src/commands/cauldron/construct-trade.ts)_

## `vegabch cauldron:fund-trade TRADE_FILE`

Fund a trade with your wallet.

```
USAGE
  $ vegabch cauldron:fund-trade TRADE_FILE [--json] [-c <value>] [-w <value>] [--txfee-per-byte <value>] [--broadcast]
    [--txoutput <value>] [--allow-mixed-payout] [--burn-dust-tokens]

ARGUMENTS
  TRADE_FILE  A path to a file contianing the trade, or pass "-" (minus sign) and send the trade (represented in json
              format) via stdin.

FLAGS
  -c, --vega-storage-file=<value>  [default: vega-storage.json] path to storage wallet file, VEGA_STORAGE_FILE
                                   environment variable can be used to set the flag.
  -w, --wallet=<wallet_name>       Select a wallet.
      --allow-mixed-payout         An output in BCH can contain the native bch & a token. Enabling this will allow the
                                   payout to mix a token payout and the bch payout in one output.
      --broadcast                  Broadcast the the trade's transaction, This flag will push the constructed
                                   transaction to the network after funding has been satisfied.
      --burn-dust-tokens           Burns dust tokens (instead of adding to payout) when enabled & allow-mixed-payout is
                                   disabled. Less than 800 sats worth of the token is considered as dust tokens. (The
                                   value of the token is based on the trades exchange rate).
      --txfee-per-byte=<value>     Specify the txfee per byte in sats, By default the suggested tx fee will be used.
      --txoutput=<value>           Will write the funded trade transaction in the txoutput. By default the transaction
                                   will be written to stdout if --json is enabled.

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

_See code: [src/commands/cauldron/fund-trade.ts](https://github.com/hosseinzoda/vegabch/blob/v0.0.11/src/commands/cauldron/fund-trade.ts)_

<!-- commandsstop -->
