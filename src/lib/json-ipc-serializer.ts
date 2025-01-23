import { hexToBin, binToHex } from './util.js';
import { BaseException } from './exceptions.js';

export type SerializedMessage = {
  type: 'bigint' | 'uint8array' | 'number' | 'string' | 'object' | 'array' | 'date' | 'null' | 'undefined' | 'boolean' | 'exception' | 'error';
  payload: any;
};

export const deserializeMessage = (msg: SerializedMessage): any => {
  if (msg.type == 'number') {
    return +msg.payload;
  } else if (msg.type == 'string') {
    return msg.payload;
  } else if (msg.type == 'boolean') {
    return msg.payload;
  } else if (msg.type == 'object') {
    return Object.fromEntries(Object.entries(msg.payload).map((a: any) => [ a[0], deserializeMessage(a[1]) ]));
  } else if (msg.type == 'array') {
    return msg.payload.map((a: any) => deserializeMessage(a));
  } else if (msg.type == 'date') {
    return new Date(msg.payload);
  } else if (msg.type == 'bigint') {
    return BigInt(msg.payload);
  } else if (msg.type == 'uint8array') {
    return hexToBin(msg.payload);
  } else if (msg.type == 'null') {
    return null;
  } else if (msg.type == 'undefined') {
    return undefined;
  } else if (msg.type == 'exception') {
    return BaseException.fromObject(msg.payload);
  } else if (msg.type == 'error') {
    return new Error(msg.payload.message);
  } else {
    throw new Error('Unknown msg type: ' + (typeof msg.type == 'string' ? msg.type : 'UNKNOWN_TYPE'));
  }
};

export const serializeMessage = (data: any): SerializedMessage => {
  if (Array.isArray(data)) {
    return {
      type: 'array',
      payload: Array.prototype.map.call(data, (a, i) => {
        try {
          return serializeMessage(a);
        } catch (err) {
          (err as any).message = (err as any).message + `\ntrying to serialize: array item at index: ${i}`;
          throw err;
        }
      }),
    };
  } else if (typeof data == 'object') {
    if (data instanceof Date) {
      return { type: 'date', payload: data.getTime() };
    } else if (data instanceof Uint8Array) {
      return { type: 'uint8array', payload: binToHex(data) };
    } else if (data instanceof BaseException) {
      return { type: 'exception', payload: data.toObject() };
    } else if (data instanceof Error) {
      return { type: 'error', payload: { message: data.message + '\n###STACK\n' + data.stack } };
    } else if (data == null) {
      return { type: 'null', payload: null };
    }
    return { type: 'object', payload: Object.fromEntries(Object.entries(data).map(([ name, value ]) =>{
      try {
        return [ name, serializeMessage(value) ]
      } catch (err) {
        (err as any).message = (err as any).message + `\ntrying to serialize: an object property named: ${name}`;
        throw err;
      }
    })) };
  } else if (typeof data == 'bigint') {
    return { type: 'bigint', payload: data+'' };
  } else if (typeof data == 'string') {
    return { type: 'string', payload: data };
  } else if (typeof data == 'boolean') {
    return { type: 'boolean', payload: !!data };
  } else if (typeof data == 'number') {
    return { type: 'number', payload: data+'' };
  } else if (typeof data == 'undefined') {
    return { type: 'undefined', payload: undefined };
  }
  throw new Error('Unknown type, ' + typeof data);
};
