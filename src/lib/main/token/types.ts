
export type BCMROPReturnData = {
  content_hash: Uint8Array;
  urls: string[];
};

export type FetchAuthChainBCMRResult = {
  chain: Array<{
    txhash: Uint8Array;
    bcmr: BCMROPReturnData| null;
  }>;
};
