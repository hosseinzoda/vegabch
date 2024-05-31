import VegaCommand, { VegaCommandOptions } from '../../lib/vega-command.js';
import { TokensIdentity, buildTokensBCMRFromTokensIdentity } from '../../lib/vega-file-storage-provider.js';
import type { Registry, IdentitySnapshot, TokenCategory } from '../../lib/schemas/bcmr-v2.schema.js';

export default class TokenList extends VegaCommand<typeof TokenList> {
  static args = {
  };
  static flags = {
  };
  static vega_options: VegaCommandOptions = {
  };

  static description = 'Get the list of registered tokens.';

  static examples = [
    `<%= config.bin %> <%= command.id %>`,
  ];

  async run (): Promise<any> {
    const tokens_identity: TokensIdentity = await this.getTokensIdentity();
    const tokens_registry: Registry = buildTokensBCMRFromTokensIdentity(tokens_identity);
    const output: Array<IdentitySnapshot> = [];
    if (!tokens_registry.identities) {
      throw new Error('Invalid token registry, identities is not defined');
    }
    for (const [ authbase, history ] of Object.entries(tokens_registry.identities)) {
      const history_entries: Array<{ key: string, date: Date, snapshot: IdentitySnapshot }> = Object.keys(history).map((key) => ({ key, date: new Date(key), snapshot: history[key] as IdentitySnapshot }))
        .sort((a, b) => b.date.getTime() - a.date.getTime());
      const current_entry = history_entries[0];
      if (!current_entry) {
        continue; // skip
      }
      const current_identity = current_entry.snapshot;
      const token_info: TokenCategory  = current_identity.token as TokenCategory;
      this.log(`-------- ${token_info.symbol} --------`);
      this.log(`token_id: ${token_info.category}`);
      this.log(`name: ${current_identity.name}, symbol: ${token_info.symbol}`);
      this.log(`${current_identity.description}`);
      if (current_identity.uris) {
        this.log(`links::`)
        for (const [ name, link ] of Object.entries(current_identity.uris)) {
          this.log(` - ${name}: ${link}`);
        }
      }
      this.log('');
      output.push(current_identity);
    }
    return { result: output };
  }
}
