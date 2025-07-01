import type ElectrumClientManager from '../electrum-client-manager.js';
import type { ModuleSchema, ModuleDependency, ModuleMethod } from '../types.js';
import { electrumClientSendRequest } from '../../util.js';
import { ElectrumClient, ElectrumClientEvents } from '@electrum-cash/network';

import { ValueError } from '../../exceptions.js';
import { initModuleMethodWrapper } from '../helpers.js';
import {
  Output, UTXO, TokenId, NATIVE_BCH_TOKEN_ID,
  uint8ArrayEqual, outputFromLibauthOutput, simpleJsonSerializer,
} from '@cashlab/common';
import {
  assertSuccess, binToNumberUint16LE, binToUtf8, utf8ToBin,
  hashTransactionUiOrder, decodeTransaction, hexToBin, binToHex,
  Transaction as libauthTransaction, Input as libauthInput, lockingBytecodeToCashAddress,
} from '@cashlab/common/libauth.js';

import { BCMROPReturnData, FetchAuthChainBCMRResult } from './types.js';

const methods_wrapper = initModuleMethodWrapper();

type TokenInputServices = {
  electrum_client_manager: ElectrumClientManager;
};

const parseOPReturnDataPushes = (bytecode: Uint8Array): Uint8Array[] => {
  if (bytecode[0] != 0x6a) {
    throw new ValueError(`Not a OP_RETURN bytecode!`);
  }
  const result: Uint8Array[] = [];
  let i = 1;
  while (bytecode.length > i) {
    const byte = bytecode[i++] as number;
    let push_size: number;
    if (byte == 0x4c) { // OP_PUSHDATA1
      push_size = bytecode[i++] as number;
      if (push_size > bytecode.length - i) {
        throw new ValueError(`Invalid push size, at: ${i-1}, value: ${push_size}`);
     }
    } else if (byte == 0x4d) { // OP_PUSHDATA2
      push_size = binToNumberUint16LE(bytecode.slice(i, i + 2));
      if (push_size > bytecode.length - i) {
        throw new ValueError(`Invalid push size, at: ${i-2}, value: ${push_size}`);
      }
      i += 2;
    } else if (byte == 0x4e) { // OP_PUSHDATA4
      throw new ValueError(`OP_PUSHDATA4 found in an OP_RETURN bytecode`);
    } else {
      if (byte > 0x00 && byte < 0x4c) {
        push_size = byte;
      } else {
        // not a push
        continue;
      }
    }
    result.push(bytecode.slice(i, i + push_size));
    i += push_size;
  }
  return result;
};


const BCMR_SIGNATURE = utf8ToBin('BCMR');
const parseBCMROPReturn = (bytecode: Uint8Array): BCMROPReturnData => {
  const chunks = parseOPReturnDataPushes(bytecode);
  if (chunks.length <= 1) {
    throw new ValueError(`At least two data push is required.`);
  }
  if (!uint8ArrayEqual(chunks[0] as Uint8Array, BCMR_SIGNATURE)) {
    throw new ValueError(`BCMR signature not found.`);
  }
  const content_hash = chunks[1] as Uint8Array;
  if (content_hash.length != 32) {
    throw new ValueError(`content_hash size is not 32 bytes.`);
  }
  return {
    content_hash,
    urls: chunks.slice(2).map(binToUtf8),
  };
};

const parseBCMRFromBytecodes = (bytecode_list: Uint8Array[]): BCMROPReturnData | null => {
  for (const bytecode of bytecode_list) {
    try {
      return parseBCMROPReturn(bytecode)
    } catch (err) {
      if (!(err instanceof ValueError)) {
        throw err;
      }
    }
  }
  return null;
};

type AuthChainMemItem = {
  txhash: Uint8Array;
  outputs: Output[];
  bcmr: BCMROPReturnData | null;
  height?: number;
};
// zeroth-input transaction id
type ZerothInputTxId = string;
type AuthChainMemTransaction = { txhash: Uint8Array, la_tx: libauthTransaction, height: number };
type AuthChainFetchMem = {
  bytecode_txmap: Map<string, Map<ZerothInputTxId, AuthChainMemTransaction>>;
  chain: Array<AuthChainMemItem>;
};

async function fetchBCMRFromAuthChainWithAuthBase (client: ElectrumClient<ElectrumClientEvents>, authbase_txhash: Uint8Array, mem?: AuthChainFetchMem): Promise<FetchAuthChainBCMRResult> {
  mem = mem || {
    bytecode_txmap: new Map(),
    chain: [],
  };

  let authbase_index = mem.chain.findIndex((a) => uint8ArrayEqual(authbase_txhash, a.txhash));
  if (authbase_index == -1) {
    const txbin = hexToBin(await electrumClientSendRequest(client, 'blockchain.transaction.get', binToHex(authbase_txhash), false) as string);
    const authbase_tx = assertSuccess(decodeTransaction(txbin));
    const outputs: Output[] = authbase_tx.outputs.map(outputFromLibauthOutput);
    // reset the chain
    mem.chain = [ {
      txhash: authbase_txhash,
      outputs,
      bcmr: parseBCMRFromBytecodes(outputs.map((a) => a.locking_bytecode)),
      height: undefined,
    } ];
    authbase_index = 0;
  }

  let tmp = mem.chain[mem.chain.length - 1];
  if (tmp == null) {
    throw new ValueError(`Invalid bcmr auth chain mem.`);
  }
  while (true) {
    const txid = binToHex(tmp.txhash)
    const first_locking_bytecode = tmp.outputs[0]?.locking_bytecode;
    if (first_locking_bytecode == null) {
      throw new ValueError(`A transaction with null locking at output#0, txid: ${txid}`);
    }
    const first_locking_bytecode_hex = binToHex(first_locking_bytecode);
    let txmap = mem.bytecode_txmap.get(first_locking_bytecode_hex);
    if (txmap == null) {
      // fetch locking_bytecode history
      txmap = new Map<string, AuthChainMemTransaction>;
      const cashaddr = assertSuccess(lockingBytecodeToCashAddress({ bytecode: first_locking_bytecode })).address;
      let transactions: Array<{ txid: string, txbin: Uint8Array, height: number }>;
      { // fetch all transactions
        const response: Array<{ tx_hash: string, height: number }>  = await electrumClientSendRequest(client, 'blockchain.address.get_history', cashaddr, tmp.height ? tmp.height : 0, -1) as any;
        const promises: Promise<{ txid: string, txbin: Uint8Array, height: number }>[] = [];
        for (const response_item of response) {
          promises.push((async () => {
            const txbin = hexToBin(await electrumClientSendRequest(client, 'blockchain.transaction.get', response_item.tx_hash, false) as string);
            return { txid: response_item.tx_hash, txbin, height: response_item.height };
          })());
        }
        transactions = await Promise.all(promises);
      }
      for (const { txid, txbin, height } of transactions) {
        const la_tx = assertSuccess(decodeTransaction(txbin));
        const zeroth_input_txhash = (la_tx.inputs[0] as libauthInput).outpointTransactionHash;
        txmap.set(binToHex(zeroth_input_txhash), {
          txhash: hexToBin(txid),
          la_tx,
          height,
        });
      }
      mem.bytecode_txmap.set(first_locking_bytecode_hex, txmap);
    }
    const tx = txmap.get(txid);
    if (tx == null) {
      // first output is unspent
      break;
    }
    const outputs: Output[] = tx.la_tx.outputs.map(outputFromLibauthOutput);
    tmp = {
      txhash: tx.txhash,
      outputs,
      bcmr: parseBCMRFromBytecodes(outputs.map((a) => a.locking_bytecode)),
      height: tx.height > 0 ? tx.height : undefined,
    };
    mem.chain.push(tmp);
  }

  return { chain: mem.chain.slice(authbase_index).map((a) => ({ txhash: a.txhash, bcmr: a.bcmr })) };
}

methods_wrapper.add('fetch-bcmr-from-authchain-with-authbase', async ({ electrum_client_manager }: TokenInputServices, authbase_txhash: Uint8Array): Promise<FetchAuthChainBCMRResult> => {
  const client = electrum_client_manager.getClient();
  if (client == null) {
    throw new Error('No active connect to an electrum node!');
  }
  return await fetchBCMRFromAuthChainWithAuthBase(client, authbase_txhash);
});

export function getSchema (): ModuleSchema {
  return {
    methods: Object.keys(methods_wrapper.methods).map((name) => ({ name })),
  };
}

export function getDependencies (): ModuleDependency[] {
  return [
    { name: 'electrum_client_manager' },
  ];
}

export async function init (services: TokenInputServices): Promise<void> {
  methods_wrapper.defineServices(services);
}

export async function destroy (): Promise<void> {
  // pass
}

export function getMethod (name: string): ModuleMethod | undefined {
  return methods_wrapper.methods[name];
}

