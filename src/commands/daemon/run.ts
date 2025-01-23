import { Args, Flags } from '@oclif/core';
import VegaCommand, { VegaCommandOptions } from '../../lib/vega-command.js';
import { deferredPromise } from '../../lib/util.js';
import crypto from 'node:crypto';
import http from 'node:http';

import { serializeMessage, deserializeMessage } from '../../lib/json-ipc-serializer.js';
import { RPCHTTPError, ValueError } from '../../lib/exceptions.js';

export default class DaemonRun extends VegaCommand<typeof DaemonRun> {
  static args = {
  };
  static flags = {
  };
  static vega_options: VegaCommandOptions = {
  };

  static description = ``;

  static examples = [
    `<%= config.bin %> <%= command.id %>`,
  ];

  async run (): Promise<any> {
    const mainModule = await import('../../lib/main/index.js');

    let { promise: exit_promise, resolve: exit } = await deferredPromise<{ error: any }>();

    const config = this.getConfig();
    if (config.type != 'daemon') {
      throw new Error('config.type should be equal to "daemon"');
    }
    if (!config.rpc_host) {
      throw new Error(`config.rpc_host is not defined!`);
    }
    try {
      const port = BigInt(config.rpc_port);
      if (!(port > 0n && port <= 65535)) {
        throw new Error('port not in range');
      }
    } catch (err) {
      throw new Error(`config.rpc_port should be a valid integer, ${err}`);
    }
    const rpc_host = config.rpc_host;
    const rpc_port = parseInt(config.rpc_port as any);

    { // validate rpcauth
      const [ rpcauth_username, rpcauth_pass ] = (config.rpcauth+'').split(':');
      const rpcauth_pass_parts = (rpcauth_pass||'').split('$');
      if (typeof rpcauth_username != 'string' || rpcauth_username == '' || typeof rpcauth_pass != 'string' || rpcauth_pass_parts.length != 2) {
        throw new Error('rpcauth should have the following format: <username>:<pass_salt>$<pass_hmac>, use rpcauth.py helper to generate the salt + hmac.');
      }
    }

    { // init server
      const BAD_REQUEST_PAYLOAD = { status_code: 400, status_message: 'Bad Request' };
      const [ rpcauth_username, rpcauth_pass ] = (config.rpcauth+'').split(':');
      const rpcauth_pass_parts = (rpcauth_pass||'').split('$');
      const rpcauth_salt = Buffer.from(rpcauth_pass_parts[0] as string, 'utf8');
      const rpcauth_hmac = Buffer.from(rpcauth_pass_parts[1] as string, 'hex');
      const verifyAValidAuth = (v: string): boolean => {
        const v_parts = v.split(':');
        const username = v_parts[0];
        const password = v_parts.slice(1).join(':');
        if (rpcauth_username != username) {
          return false;
        }
        try {
          return crypto.timingSafeEqual(crypto.createHmac('sha256', rpcauth_salt).update(Buffer.from(password, 'utf8')).digest(), rpcauth_hmac);
        } catch (err) {
          return false;
        }
      };
      const http_server = new http.Server((req, res) => {
        const auth_parts = typeof req.headers.authorization != 'string' ? null : req.headers.authorization.split(' ');
        const authorized: boolean = auth_parts != null && (auth_parts[0]+'').toLowerCase() == 'basic' && verifyAValidAuth(Buffer.from(auth_parts.slice(1).join(' '), 'base64').toString('utf8'));
        const respond = (response: any, code?: number, headers?: any) => {
          const body = JSON.stringify(serializeMessage(response));
          if (response instanceof RPCHTTPError) {
            res.writeHead(response.status_code, response.status_message, headers || {});
          } else {
            if (code == null) {
              throw new Error('respond code is not defined!');
            }
            res.writeHead(code, headers || {});
          }
          res.end(body);
        };
        try {
          if (req.method != 'POST') {
            throw new RPCHTTPError('Expecting a POST request!', BAD_REQUEST_PAYLOAD);
          }
          if (req.headers['content-type'] != 'application/json') {
            throw new RPCHTTPError(`Expecting a request's content type to be: "application/json"`, BAD_REQUEST_PAYLOAD);
          }
          if (!authorized) {
            throw new RPCHTTPError(`Access denied!`, { status_code: 401, status_message: 'Unauthorized' });
          }
          const MAX_POST_SIZE = 1024 * 1024 * 2; // 2MB
          let post_size = 0;
          let chunks: Buffer[] = [];
          req.on('data', (chunk) => {
            if (post_size > MAX_POST_SIZE) {
              respond(new RPCHTTPError('Request body is too big!', { status_code: 413, status_message: 'Payload Too Large' }));
              req.destroy();
              chunks = [];
              return;
            }
            chunks.push(chunk);
            post_size += chunk.length;
          });
          req.on('end', () => {
            let message;
            try {
              message = deserializeMessage(JSON.parse(Buffer.concat(chunks).toString('utf8')));
              chunks = [];
            } catch (err) {
              respond(new RPCHTTPError('Failed to parse the request body!', BAD_REQUEST_PAYLOAD));
              return;
            }
            if (!Array.isArray(message) || message.length == 0 || typeof message[0] != 'string') {
              respond(new RPCHTTPError(`Expecting the request message to be an array, And the first item in the array should be a string that represents the rpc method.`, BAD_REQUEST_PAYLOAD));
              return;
            }
            let method = mainModule.getMethod(message[0]);
            if (method == null) {
              respond(new ValueError(`Method not found, name: ${message[0]}`));
              return;
            }
            ;(async () => {
              try {
                respond([null, await method(...message.slice(1))], 200);
              } catch (err) {
                respond([err, null], 422);
              }
            })();
          });
        } catch (error) {
          respond(error, error instanceof RPCHTTPError ? undefined : 500);
          req.destroy();
        }
      });
      http_server.listen(rpc_port, rpc_host, () => {
        this.log('Accepting rpc requests on: http://' + rpc_host + ':' + rpc_port);
      });
    }

    const exit_result = await exit_promise;
    if (exit_result.error == null) {
      return null;
    } else {
      throw exit_result.error;
    }
  }
}
