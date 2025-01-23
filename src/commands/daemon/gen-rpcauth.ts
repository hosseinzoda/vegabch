import { Command, Args, Flags } from '@oclif/core';
import crypto from 'node:crypto';

export default class DaemonGenRPCAuth extends Command {
  static args = {
    username: Args.string({
      name: 'username',
      required: true,
      description: `A path to the daemon's config.`,
      ignoreStdin: true,
    }),
  };
  static flags = {
    password: Flags.string({
      required: false,
      description: `If defined, the given password will be used to print out the rpcauth.`,
      default: undefined,
      allowStdin: false,
    }),
  };

  static description = ``;

  static examples = [
    `<%= config.bin %> <%= command.id %> <username>`,
    `<%= config.bin %> <%= command.id %> <username> --password <pre-defined-password>`,
  ];

  async run (): Promise<any> {
    const { args, flags } = await this.parse(DaemonGenRPCAuth);
    const username = args.username;
    const password = flags.password || crypto.randomBytes(32).toString('base64url');
    const salt = crypto.randomBytes(16).toString('hex');
    const hmac = crypto.createHmac('sha256', Buffer.from(salt, 'utf8')).update(Buffer.from(password, 'utf8')).digest('hex');
    this.log(`Password: ${password}`);
    this.log('The config parameter to be used in the daemon-config.json -----');
    this.log(`  "rpcauth": "${username}:${salt}\$${hmac}"`)
    this.log('-----');
    this.log('The config parameters to be used in the client-config.json -----');
    this.log(`  "rpc_username": "${username}",`)
    this.log(`  "rpc_password": "${password}"`)
    this.log('-----');
    return {
      username, password,
      rpcauth: `${username}:${salt}\$${hmac}`,
    };
  }
}
