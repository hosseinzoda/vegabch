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
vegabch/0.0.1 linux-x64 node-v20.13.1
$ vegabch --help [COMMAND]
USAGE
  $ vegabch COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`vegabch wallet:balance`](#vegabch-walletbalance)
* [`vegabch wallet:bch-deposit-address`](#vegabch-walletbch-deposit-address)
* [`vegabch wallet:create NAME TYPE NETWORK`](#vegabch-walletcreate-name-type-network)
* [`vegabch wallet:generate NAME TYPE NETWORK`](#vegabch-walletgenerate-name-type-network)
* [`vegabch wallet:list`](#vegabch-walletlist)
* [`vegabch wallet:pin NAME`](#vegabch-walletpin-name)
* [`vegabch wallet:token-deposit-address`](#vegabch-wallettoken-deposit-address)
* [`vegabch wallet:unpin`](#vegabch-walletunpin)

* [`vegabch token:list`](#vegabch-tokenlist)
* [`vegabch token:register AUTHBASE NETWORK`](#vegabch-tokenregister-authbase-network)

* [`vegabch network:broadcast-transaction TRANSACTION NETWORK`](#vegabch-networkbroadcast-transaction-transaction-network)

* [`vegabch cauldron:construct-trade SUPPLY_TOKEN DEMAND_TOKEN DEMAND_AMOUNT [OUTPUT]`](#vegabch-cauldronconstruct-trade-supply_token-demand_token-demand_amount-output)
* [`vegabch cauldron:fund-trade TRADE_FILE`](#vegabch-cauldronfund-trade-trade_file)

* [`vegabch help [COMMAND]`](#vegabch-help-command)

## `vegabch wallet:balance`

view a balance of all tokens.

```
USAGE
  $ vegabch wallet:balance [--json] [-c <value>] [-w <value>]

FLAGS
  -c, --vega-storage-file=<value>  [default: vega-storage.json] path to storage wallet file,
                                   VEGA_STORAGE_FILE environment variable can be used to set the flag.
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

_See code: [src/commands/wallet/balance.ts](https://github.com/hosseinzoda/vegabch/blob/v0.0.1/src/commands/wallet/balance.ts)_

## `vegabch wallet:bch-deposit-address`

Get a bch deposit address for the given wallet.

```
USAGE
  $ vegabch wallet:bch-deposit-address [--json] [-c <value>] [-w <value>]

FLAGS
  -c, --vega-storage-file=<value>  [default: vega-storage.json] path to storage wallet file,
                                   VEGA_STORAGE_FILE environment variable can be used to set the flag.
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

_See code: [src/commands/wallet/bch-deposit-address.ts](https://github.com/hosseinzoda/vegabch/blob/v0.0.1/src/commands/wallet/bch-deposit-address.ts)_

## `vegabch wallet:create NAME TYPE NETWORK`

create a wallet

```
USAGE
  $ vegabch wallet:create NAME TYPE NETWORK [--json] [-c <value>] [-m <value>] [-p <value>] [-s
    <value>]

ARGUMENTS
  NAME     A unique name for referencing the wallet once saved.
  TYPE     (seed|wif) Type of the wallet.
  NETWORK  (mainnet|testnet|regtest) [default: mainnet] Wallet's target network.

FLAGS
  -c, --vega-storage-file=<value>  [default: vega-storage.json] path to storage wallet file,
                                   VEGA_STORAGE_FILE environment variable can be used to set the flag.
  --mnemonic=<value>               Wallet's mnemonic words, hd wallet's private key represented as
                                   mnemonic words.
  --derivation-path=<value>        Wallet's mnemonic words, hd wallet's private key represented as
                                   mnemonic words.
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

_See code: [src/commands/wallet/create.ts](https://github.com/hosseinzoda/vegabch/blob/v0.0.1/src/commands/wallet/create.ts)_

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
  -c, --vega-storage-file=<value>  [default: vega-storage.json] path to storage wallet file,
                                   VEGA_STORAGE_FILE environment variable can be used to set the flag.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  generate a wallet

EXAMPLES
  $ vegabch wallet:generate mywallet seed

  $ vegabch wallet:generate mywallet wif testnet
```

_See code: [src/commands/wallet/generate.ts](https://github.com/hosseinzoda/vegabch/blob/v0.0.1/src/commands/wallet/generate.ts)_

## `vegabch wallet:list`

get list of all wallets.

```
USAGE
  $ vegabch wallet:list [--json] [-c <value>] [-w <value>]

FLAGS
  -c, --vega-storage-file=<value>  [default: vega-storage.json] path to storage wallet file,
                                   VEGA_STORAGE_FILE environment variable can be used to set the flag.
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

_See code: [src/commands/wallet/list.ts](https://github.com/hosseinzoda/vegabch/blob/v0.0.1/src/commands/wallet/list.ts)_

## `vegabch wallet:pin NAME`

pin a wallet

```
USAGE
  $ vegabch wallet:pin NAME [--json] [-c <value>]

ARGUMENTS
  NAME  the wallet name to pin.

FLAGS
  -c, --vega-storage-file=<value>  [default: vega-storage.json] path to storage wallet file,
                                   VEGA_STORAGE_FILE environment variable can be used to set the flag.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  pin a wallet

EXAMPLES
  $ vegabch wallet:pin mywallet
```

_See code: [src/commands/wallet/pin.ts](https://github.com/hosseinzoda/vegabch/blob/v0.0.1/src/commands/wallet/pin.ts)_

## `vegabch wallet:token-deposit-address`

Get a token deposit address for the given wallet.

```
USAGE
  $ vegabch wallet:token-deposit-address [--json] [-c <value>] [-w <value>]

FLAGS
  -c, --vega-storage-file=<value>  [default: vega-storage.json] path to storage wallet file,
                                   VEGA_STORAGE_FILE environment variable can be used to set the flag.
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

_See code: [src/commands/wallet/token-deposit-address.ts](https://github.com/hosseinzoda/vegabch/blob/v0.0.1/src/commands/wallet/token-deposit-address.ts)_

## `vegabch wallet:unpin`

unpin the pinned wallet.

```
USAGE
  $ vegabch wallet:unpin [--json] [-c <value>]

FLAGS
  -c, --vega-storage-file=<value>  [default: vega-storage.json] path to storage wallet file,
                                   VEGA_STORAGE_FILE environment variable can be used to set the flag.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  unpin the pinned wallet.

EXAMPLES
  $ vegabch wallet:unpin
```

_See code: [src/commands/wallet/unpin.ts](https://github.com/hosseinzoda/vegabch/blob/v0.0.1/src/commands/wallet/unpin.ts)_

## `vegabch token:list`

Get the list of registered tokens.

```
USAGE
  $ vegabch token:list [--json] [-c <value>]

FLAGS
  -c, --vega-storage-file=<value>  [default: vega-storage.json] path to storage wallet file,
                                   VEGA_STORAGE_FILE environment variable can be used to set the flag.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Get the list of registered tokens.

EXAMPLES
  $ vegabch token:list
```

_See code: [src/commands/token/list.ts](https://github.com/hosseinzoda/vegabch/blob/v0.0.1/src/commands/token/list.ts)_

## `vegabch token:register AUTHBASE NETWORK`

Add a BCMR token record from its baseauth.

```
USAGE
  $ vegabch token:register AUTHBASE NETWORK [--json] [-c <value>]

ARGUMENTS
  AUTHBASE  The authbase txid for the token.
  NETWORK   (mainnet|testnet|regtest) [default: mainnet] Target network.

FLAGS
  -c, --vega-storage-file=<value>  [default: vega-storage.json] path to storage wallet file,
                                   VEGA_STORAGE_FILE environment variable can be used to set the flag.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Add a BCMR token record from its baseauth.

EXAMPLES
  $ vegabch token:register <authbase>
```

_See code: [src/commands/token/register.ts](https://github.com/hosseinzoda/vegabch/blob/v0.0.1/src/commands/token/register.ts)_


## `vegabch network:broadcast-transaction TRANSACTION NETWORK`

Broadcast the transaction.

```
USAGE
  $ vegabch network:broadcast-transaction TRANSACTION NETWORK [--json] [-c <value>]

ARGUMENTS
  TRANSACTION  A hexstring representation of the transaction.
  NETWORK      (mainnet|testnet|regtest) [default: mainnet] Target network.

FLAGS
  -c, --vega-storage-file=<value>  [default: vega-storage.json] path to storage wallet file,
                                   VEGA_STORAGE_FILE environment variable can be used to set the flag.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Broadcast the transaction.

EXAMPLES
  $ vegabch network:broadcast-transaction
```

_See code: [src/commands/network/broadcast-transaction.ts](https://github.com/hosseinzoda/vegabch/blob/v0.0.1/src/commands/network/broadcast-transaction.ts)_

## `vegabch cauldron:construct-trade SUPPLY_TOKEN DEMAND_TOKEN DEMAND_AMOUNT [OUTPUT]`

construct a cauldron trade, Uses multiple pools to acquire a target amount at the best rate. The trade demand will be equal or slightly greater than given demand-amount. The trade fee is deducted from trade demand if the BCH is demanded, In this case, To have a transaction with the demand amount to spend, the trade fee should be supplied.

```
USAGE
  $ vegabch cauldron:construct-trade SUPPLY_TOKEN DEMAND_TOKEN DEMAND_AMOUNT [OUTPUT]
    --cauldron-indexer-endpoint <value> [--json] [-c <value>]

ARGUMENTS
  SUPPLY_TOKEN   The token to offer for the trade, Expecting a token id or "BCH" for the native token.
  DEMAND_TOKEN   The token to request as the result of the trade, Expecting a token id or "BCH" for the
                 native token.
  DEMAND_AMOUNT  Amount of tokens to acquire, Expecting an integer.
  OUTPUT         The trade output file, By default the output will be written to stdout if --json is
                 enabled.

FLAGS
  -c, --vega-storage-file=<value>          [default: vega-storage.json] path to storage wallet file,
                                           VEGA_STORAGE_FILE environment variable can be used to set the
                                           flag.
      --cauldron-indexer-endpoint=<value>  (required) A url to the cauldron contracts indexer.
                                           CAULDRON_INDEXER_ENDPOINT environment variable can also be
                                           used to set it.
      --decimal-amounts                    Use the defined decimals when displaying (excluding json
                                           outputs) & taking an amount as arguments.
GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  construct a cauldron trade, Uses multiple pools to acquire a target amount at the best rate. The trade
  demand will be equal or slightly greater than given demand-amount. The trade fee is deducted from
  trade demand if the BCH is demanded, In this case, To have a transaction with the demand amount to
  spend, the trade fee should be supplied.

EXAMPLES
  $ vegabch cauldron:construct-trade
```

_See code: [src/commands/cauldron/construct-trade.ts](https://github.com/hosseinzoda/vegabch/blob/v0.0.1/src/commands/cauldron/construct-trade.ts)_

## `vegabch cauldron:fund-trade TRADE_FILE`

Fund a trade with your wallet.

```
USAGE
  $ vegabch cauldron:fund-trade TRADE_FILE [--json] [-c <value>] [-w <value>] [--txfee-per-byte <value>]
    [--broadcast] [--txoutput <value>]

ARGUMENTS
  TRADE_FILE  A path to a file contianing the trade, or pass "-" (minus sign) and send the trade
              (represented in json format) via stdin.

FLAGS
  -c, --vega-storage-file=<value>  [default: vega-storage.json] path to storage wallet file,
                                   VEGA_STORAGE_FILE environment variable can be used to set the flag.
  -w, --wallet=<wallet_name>       Select a wallet.
      --broadcast                  Broadcast the the trade's transaction, This flag will push the
                                   constructed transaction to the network after funding has been
                                   satisfied.
      --txfee-per-byte=<value>     Specify the txfee per byte in sats, By default the suggested tx fee
                                   will be used.
      --txoutput=<value>           Will write the funded trade transaction in the txoutput. By default
                                   the transaction will be written to stdout if --json is enabled.

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

_See code: [src/commands/cauldron/fund-trade.ts](https://github.com/hosseinzoda/vegabch/blob/v0.0.1/src/commands/cauldron/fund-trade.ts)_

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

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.0.22/src/commands/help.ts)_

<!-- commandsstop -->
