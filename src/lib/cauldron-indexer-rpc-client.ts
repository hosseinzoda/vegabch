import * as https from 'node:https';
import type { IncomingMessage } from 'node:http';

export type ActivePoolsResult = {
  active: Array<{
    owner_p2pkh_addr: string;
    owner_pkh: string;
    sats: number;
    token_id: string;
    tokens: number;
    tx_pos: number;
    txid: string;
  }>;
};

export default class CauldronIndexerRPCClient {

  _endpoint: string;
  _agent: https.Agent;
  constructor (endpoint: string) {
    this._endpoint = endpoint.replace(/\/+$/, '');
    this._agent = new https.Agent({
      keepAlive: true,
    });
  }

  _getRequest (path: string, queries: Array<[ string, string ]>): Promise<{ status_code: number, body_text: string, body: any, response: IncomingMessage }> {
    return new Promise((resolve, reject) => {
      const queries_str: string = queries.map((a) => encodeURIComponent(a[0]) + '=' + encodeURIComponent(a[1])).join('&');
      const link: string = this._endpoint + path  + (queries_str ? ((path.indexOf('?') == -1 ? '?' : '&')) + queries_str : '');
      const conn = https.request(link, {
        agent: this._agent,
        uniqueHeaders: [
          'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        ],
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

  async getActivePoolsForToken (token_id: string): Promise<ActivePoolsResult> {
    const { body } = await this._getRequest('/pool/active', [ ['token', token_id] ]);
    return body as ActivePoolsResult;
  }

}


