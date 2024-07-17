import * as https from 'node:https';
import * as http from 'node:http';
import type { IncomingMessage } from 'node:http';
import * as child_process from 'node:child_process';

export type ActivePoolEntry = {
  owner_p2pkh_addr: string;
  owner_pkh: string;
  sats: number;
  token_id: string;
  tokens: number;
  tx_pos: number;
  txid: string;
};
export type ActivePoolsResult = {
  active: Array<ActivePoolEntry>;
};

const curlGet = (link: string) => {
  return new Promise((resolve, reject) => {
    const headers = [
      'User-Agent: Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
      'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language: en-US,en;q=0.5',
      'Connection: keep-alive',
      'Upgrade-Insecure-Requests: 1',
      'Sec-Fetch-Dest: document',
      'Sec-Fetch-Mode: navigate',
      'Sec-Fetch-Site: none',
      'Sec-Fetch-User: ?1',
    ];
    const args = [ link, '-i', '--compressed', '--keepalive' ];
    for (const header of headers) {
      args.push('-H');
      args.push(header);
    }
    const cproc = child_process.spawn('curl', args);
    const data_chunks: Buffer[] = [];
    const err_chunks: Buffer[] = [];
    cproc.stdout.on('data', (chunk) => { data_chunks.push(chunk) });
    cproc.stderr.on('data', (chunk) => { err_chunks.push(chunk) });
    cproc.on('exit', (code) => {
      if (code == 0) {
        const data = Buffer.concat(data_chunks).toString('utf8');
        const components = data.split('\r\n\r\n');
        try {
          if (components.length > 1) {
            const headers = (components[0] as string).split('\r\n');
            const body = components.slice(1).join('\r\n\r\n');
            const first_line_pieces = (headers[0] as string).split(' ');
            const status_text = first_line_pieces[2];
            const status_code = parseInt(first_line_pieces[1] || '');
            if (isNaN(status_code)) {
              throw new Error('failed to read header from curl (status code is not an integer), url: ' + link)
            }
            resolve({
              http_version: headers[0],
              status_code,
              status_text,
              headers,
              body,
            });
          } else {
            throw new Error('failed to read header from curl, url: ' + link);
          }
        } catch (err) {
          reject(err);
        }
      } else {
        reject(new Error('Request failed, url: ' + link + ', ' + Buffer.concat(err_chunks).toString('utf8')));
      }
    })
  });
}

export default class CauldronIndexerRPCClient {

  _endpoint: string;
  _agent: http.Agent;
  constructor (endpoint: string) {
    this._endpoint = endpoint.replace(/\/+$/, '');
    this._agent = new http.Agent({
      keepAlive: true,
    });
  }

  _getRequest (path: string, queries: Array<[ string, string ]>): Promise<{ status_code: number, body_text: string, body: any, response: IncomingMessage }> {
    const queries_str: string = queries.map((a) => encodeURIComponent(a[0]) + '=' + encodeURIComponent(a[1])).join('&');
    const link: string = this._endpoint + path  + (queries_str ? ((path.indexOf('?') == -1 ? '?' : '&')) + queries_str : '');
    if (process.env['VEGABCH_USE_CURL'] == '1') {
      return curlGet(link)
        .then((result: any) => {
          let body;
          try {
            body = JSON.parse(result.body as string);
          } catch (err) {
            // pass
          }
          return { ...result, body_text: result.body, body };
        });
    } else {
      return new Promise((resolve, reject) => {
        const conn = (link.startsWith('https://' ) ? https : http).request(link, {
          agent: this._agent,
        });
        conn.end();
        conn.on('response', (resp: IncomingMessage) => {
          const chunks: Buffer[] = [];
          let error: any;;
          resp.on('error', (err) => {
            error = err;
          });
          resp.on('data', (chunk) => chunks.push(chunk));
          resp.on('close', () => {
            if (error) {
              reject(error);
            } else {
              const body_text = Buffer.concat(chunks).toString('utf8');
              let body;
              try {
                body = JSON.parse(body_text);
              } catch (err) {
                // pass
              }
              if (resp.statusCode != null && resp.statusCode >= 200 && resp.statusCode < 300) {
                resolve({ status_code: resp.statusCode, body, body_text, response: resp });
              } else {
                const error: any = new Error(body && body.error ? body.error : body_text);
                error.body = body;
                error.status_code = resp.statusCode;
                error.response = resp;
                reject(error);
              }
            }
          });
        });
        
      });
    }
  }

  async getActivePoolsForToken (token_id: string): Promise<ActivePoolsResult> {
    const { body } = await this._getRequest('/pool/active', [ ['token', token_id] ]);
    return body as ActivePoolsResult;
  }

}


