import { hexToBin, binToHex, hashTransactionUiOrder } from '@cashlab/common/libauth.js';

import type { ElectrumClient, ElectrumClientEvents, RPCNotification as ElectrumRPCNotification } from '@electrum-cash/network';

export default function broadcastTransaction (client: ElectrumClient<ElectrumClientEvents>, txbin: Uint8Array, wait_for_confirmation: boolean): Promise<{ txhash: string }>  {
  return new Promise(async (resolve, reject) => {
    try {
      const txhex = binToHex(txbin);
      const txhash = binToHex(hashTransactionUiOrder(txbin));
      if (wait_for_confirmation) {
        const onDisconnected = () => {
			    client.removeListener('disconnected', onDisconnected);
          client.removeListener('notification', onNotification);
          reject(new Error('Client disconnected before broadcast confirmation'));
        };
        const onNotification = (message: ElectrumRPCNotification): void  => {
          switch (message.method) {
            case 'blockchain.transaction.subscribe': {
              if (message.params == null) {
                return;
              }
              const notif_txhash: string = (message.params as any[])[0];
              if (notif_txhash == txhash) {
                if (message.params[1] == null) {
                  return
                }
                ;(async () => {
                  try {
                    await client.unsubscribe('blockchain.transaction.subscribe', txhash);
                  } catch (err) {
                    // pass
                  }
                })();
			          client.removeListener('disconnected', onDisconnected);
                client.removeListener('notification', onNotification);
                resolve({ txhash });
              }
              break;
            }
          }
        }
			  client.addListener('disconnected', onDisconnected);
        client.addListener('notification', onNotification);
        await client.subscribe('blockchain.transaction.subscribe', txhash);
        try {
          const result = await client.request('blockchain.transaction.broadcast', txhex);
          if (result instanceof Error) {
            reject(result);
          }
        } catch (err) {
          await client.unsubscribe('blockchain.transaction.subscribe', txhash);
          throw err;
        }
      } else {
        const result = await client.request('blockchain.transaction.broadcast', txhex);
        if (result instanceof Error) {
          reject(result);
        } else {
          resolve({ txhash });
        }
      }
    } catch (err) {
      reject(err);
    }
  });
}
