import { Args } from '@oclif/core';
import VegaCommand, { VegaCommandOptions } from '../../lib/vega-command.js';
import type { TokensIdentity } from '../../lib/main/vega-file-storage-provider.js';
import type { Registry, IdentitySnapshot } from '../../lib/schemas/bcmr-v2.schema.js';

export default class TokenList extends VegaCommand<typeof TokenList> {
  static args = {
    authbase: Args.string({
      name: 'authbase',
      required: true,
      description: 'The authbase txid for the token.',
    }),
    network: Args.string({
      name: 'network',
      required: true,
      description: "Target network.",
      options: ['mainnet', 'testnet', 'regtest'],
      default: 'mainnet',
    }),
  };
  static flags = {
  };
  static vega_options: VegaCommandOptions = {
  };

  static description = 'Add a BCMR token record from its baseauth.';

  static examples = [
    `<%= config.bin %> <%= command.id %> <authbase>`,
  ];

  async run (): Promise<any> {
    throw new Error('token:register has been disabled in the beta version');
    /* TODO:: re-implement this command
    await requireMainnet();
    const authbase_arg = args.authbase
    const chain: AuthChain = await BCMR.buildAuthChain({
      transactionHash: authbase_arg,
      network: args.network as Network,
      resolveBase: false,
      followToHead: true,
    });
    // use the head element
    if (chain.length == 0) {
      throw new Error('The AuthChain has no elements!');
    }
    const head: AuthChainElement = chain[chain.length - 1] as AuthChainElement;
    if (!head.httpsUrl || !head.contentHash) {
      throw new Error('The authhead should contain an https url and content hash!');
    }
    const output: any = { rows_affected: 0, registered_tokens: [] };
    const registry = await BCMR.fetchMetadataRegistry(head.httpsUrl, head.contentHash);
    const current_date = new Date();
    const tokens_identity: TokensIdentity = await this.callModuleMethod('vega_storage.get_tokens_identity');
    // register tokens, requires that authbase to be equal category
    for (const [ authbase, history ] of Object.entries(registry.identities || {})) {
      for (const identity of Object.values(history)) {
        if (identity.token && identity.token.category != authbase_arg) {
          throw new Error(`The retrived identity has one or more defined token with its token.category not matching authbase, To register a token it's required to have the authbase match the token category`);
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
      if (tokens_identity[current_identity.token.category] != null) {
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
    */
  }
}
