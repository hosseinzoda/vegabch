import { Args, Flags } from '@oclif/core';
import VegaCommand, { VegaCommandOptions } from '../../lib/vega-command.js';
import type { TokensIdentity } from '../../lib/main/vega-file-storage-provider.js';
import type { Registry, IdentitySnapshot } from '../../lib/schemas/bcmr-v2.schema.js';
import { hexToBin, fetchBlobWithHttpRequest } from '../../lib/util.js';
import { ValueError, InvalidProgramState } from '../../lib/exceptions.js';
import type { FetchAuthChainBCMRResult, BCMROPReturnData } from '../../lib/main/token/types.js';
import { simpleJsonSerializer, uint8ArrayEqual } from '@cashlab/common/util.js';

export default class TokenList extends VegaCommand<typeof TokenList> {
  static args = {
    token_id: Args.string({
      name: 'token_id',
      required: true,
      description: 'The authbase txid for the token.',
    }),
  };
  static flags = {
    'overwrite': Flags.boolean({
      description: `When enabled it will overwrite the identity if it does already exists.`
    }),
  };
  static vega_options: VegaCommandOptions = {
  };

  static description = 'Add a BCMR token record from its baseauth.';

  static examples = [
    `<%= config.bin %> <%= command.id %> <authbase>`,
  ];

  async run (): Promise<any> {
    const { args, flags } = this;
    const { sha256 } = await import('@cashlab/common/libauth.js');
    const token_id = args.token_id;
    const getHttpsUrl =  (urls: string[]): string | null => {
      const https_url = urls.find((a) => a.startsWith('https://'));
      if (https_url != null) {
        return https_url;
      }
      const url_with_no_protocol = urls.find((a) => a.indexOf('://') == -1);
      if (url_with_no_protocol != null) {
        return 'https://' + url_with_no_protocol;
      }
      return null;
    };
    const authbase_txhash = hexToBin(token_id);
    const result: FetchAuthChainBCMRResult = await this.callModuleMethod('token.fetch-bcmr-from-authchain-with-authbase', authbase_txhash);
    const chain = result.chain.filter((a) => a.bcmr != null);
    if (chain.length == 0) {
      throw new ValueError(`No BCMR found!`);
    }
    const current_bcmr = chain[chain.length - 1]?.bcmr as BCMROPReturnData;
    const content_https_url = getHttpsUrl(current_bcmr.urls);
    if (content_https_url == null) {
      throw new ValueError(`The bcmr has no https url!`);
    }
    const fetch_result = await fetchBlobWithHttpRequest({ url: content_https_url });
    if (fetch_result.response.statusCode != 200) {
      throw new Error(`Unexpected response from "${content_https_url}", status_code: ${fetch_result.response.statusCode}, response: ${Buffer.from(fetch_result.body.toString('utf8'))}`);
    }
    if (!uint8ArrayEqual(current_bcmr.content_hash, sha256.hash(fetch_result.body))) {
      throw new ValueError(`The content of http response does not match with the authenticated data (content_hash).`);
    }
    const output: {
      rows_affected: number;
      registered_tokens: Array<{ key: string; date: Date; snapshot: IdentitySnapshot; }>;
    } = { rows_affected: 0, registered_tokens: [] };
    let registry: Registry;
    try {
      registry = JSON.parse(fetch_result.body.toString('utf8'));
    } catch (err) {
      throw new Error(`Expecting json from the response, Failed to parse: ${(err as any).message}, output: ${Buffer.from(fetch_result.body.toString('utf8'))}`);
    }
    const current_date = new Date();
    const tokens_identity: TokensIdentity = await this.callModuleMethod('vega_storage.get_tokens_identity');
    // register tokens, requires that authbase to be equal category
    for (const [ authbase, history ] of Object.entries(registry.identities || {})) {
      for (const identity of Object.values(history)) {
        if (identity.token && identity.token.category != token_id) {
          throw new Error(`The retrived identity has one or more category that do not match with the input token_id.`);
        }
      }
      const history_entries: Array<{ key: string, date: Date, snapshot: IdentitySnapshot }> = Object.keys(history).map((key) => ({ key, date: new Date(key), snapshot: history[key] as IdentitySnapshot }))
        .filter((a) => a.snapshot != null)
        .sort((a, b) => b.date.getTime() - a.date.getTime());
      const current_entry = history_entries.filter((a) => a.date <= current_date)[0];
      if (!current_entry) {
        throw new Error('The identity does not have a current identity, This error may be caused by having an incorrect time in your local machine.');
      }
      const current_identity = current_entry.snapshot;
      if (!current_identity.token) {
        throw new Error('The current identity of the token has no token!');
      }
      if (current_identity.token.category != token_id) {
        throw new Error(`The defined identity.token.category does not match the input token_id!`);
      }
      if (!flags.overwrite && tokens_identity[current_identity.token.category] != null) {
        throw new Error(`The token is already registered in the vega storage file.`);
      }
      tokens_identity[current_identity.token.category] = {
        authbase, history,
      };
      this.log(`Token registered, token_id: ${current_identity.token.category}`);
      this.log(`name: ${current_identity.name}, symbol: ${current_identity.token.symbol}`);
      output.registered_tokens.push(current_entry);
      output.rows_affected++;
    }
    if (output.rows_affected > 0) {
      await this.callModuleMethod('vega_storage.store_tokens_identity', tokens_identity);
    }

    return output;
  }
}
