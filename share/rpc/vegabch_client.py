import json
from datetime import datetime
import requests
from requests.auth import HTTPBasicAuth

class VegaBCHException (BaseException):
    def __init__ (self, name, message, payload):
        super().__init__(message)
        self.name = name
        self.message = message
        self.payload = payload
    @classmethod
    def fromDict (cls, data):
        return cls(data['name'], data['message'], data['payload'])
    def toDict (self):
        return {
            'name': self.name,
            'message': self.message,
            'payload': self.payload,
        }

class VegaBCHError (BaseException):
    def __init__ (self, message):
        super().__init__(message)
        self.message = message

OBJECT_INTERNAL_KEYS = [ '_dict','_keys', 'items', 'keys', 'values', '__init__', '__getattribute__', '__dict__' '__setattr__', '__delattr__', '__str__', '__repr__', '__name__', '__class__' ]

class Object (object):
    def __init__ (self, data):
        self._keys = []
        self._dict = dict()
        for name, value in (data.items() if type(data) == dict else data):
            self._keys.append(name)
            self._dict[name] = value
    def __getattribute__ (self, name):
        if name in OBJECT_INTERNAL_KEYS:
            return super().__getattribute__(name)
        return self._dict.get(name, None)
    def __setattr__(self, name, value):
        if name in OBJECT_INTERNAL_KEYS:
            return super().__setattr__(name, value)
        if name not in self._keys:
            self._keys.append(name)
            self._dict[name] = value
    def __delattr__(self, name):
        try:
            self._keys.remove(name)
        except ValueError:
            pass
        try:
            del self._dict[name]
        except KeyError:
            pass
    def items (self):
        return map(lambda a: [ a, self._dict[a] ], self._keys)
    def keys (self):
        return self._keys
    def values (self):
        return map(lambda a: self._dict[a], self._keys)
    def __str__ (self):
        return f'<Object {object_as_dict(self)}>'
    def __repr__ (self):
        return f'<Object {object_as_dict(self)}>'

def object_as_dict (obj):
    return dict(map(lambda a: [ a[0], object_as_dict(a[1]) if isinstance(a[1], Object) else a[1] ], obj.items()))

def deserializeMessage (msg):
    msgtype = msg['type']
    if msgtype == 'number':
        if type(msg['payload']) in (int,float):
            return msg['payload']
        return float(msg['payload'])
    elif msgtype == 'string':
        return msg['payload']
    elif msgtype == 'boolean':
        return msg['payload']
    elif msgtype == 'object':
        return Object(map(lambda a: [ a[0], deserializeMessage(a[1]) ], msg['payload'].items()))
    elif msgtype == 'array':
        return list(map(lambda a: deserializeMessage(a), msg['payload']));
    elif msgtype == 'date':
        return datetime.fromtimestamp(msg['payload'] / 1000.0)
    elif msgtype == 'bigint':
        return int(msg['payload'])
    elif msgtype == 'uint8array':
        return bytes.fromhex(msg['payload'])
    elif msgtype == 'null':
        return None
    elif msgtype == 'undefined':
        return None
    elif msgtype == 'exception':
        return VegaBCHException.fromDict(msg['payload'])
    elif msgtype == 'error':
        return VegaBCHError(msg['payload']['message'])
    else:
        raise ValueError(f'Unknown msg type: {msg.get('type', 'UNKNOWN_TYPE')}');

def serializeMessage (data):
    if type(data) in (list,tuple):
        return {
            'type': 'array',
            'payload': list(map(serializeMessage, data))
        }
    elif isinstance(data, datetime):
        return { 'type': 'date', 'payload': int(data.timestamp() * 1000) }
    elif isinstance(data, (Object, dict)):
        return { 'type': 'object', 'payload': dict(map(lambda a: [ a[0], serializeMessage(a[1]) ], data.items())) }
    elif type(data) == bytes:
        return { 'type': 'uint8array', 'payload': data.hex() }
    elif isinstance(data, VegaBCHException):
        return { 'type': 'exception', 'payload': VegaBCHException.toDict() }
    elif isinstance(data, VegaBCHError):
        return { 'type': 'error', 'payload': { message: data.message } }
    elif data == None:
        return { 'type': 'null', 'payload': None }
    elif type(data) == int:
        return { 'type': 'bigint', 'payload': str(data) }
    elif type(data) == float:
        return { 'type': 'number', 'payload': data }
    elif type(data) == str:
        return { 'type': 'string', 'payload': data }
    elif type(data) == bool:
        return { 'type': 'boolean', 'payload': data }
    raise ValueError(f'Unknown type, {type(data)}')


class VegaBCHClient (object):
    def __init__ (self, **kwargs):
        self.endpoint = kwargs['endpoint']
        self.auth = HTTPBasicAuth(kwargs['username'], kwargs['password'])
    def invoke (self, name, *args):
        response = requests.post(self.endpoint, json=serializeMessage(( name, ) + args), auth=self.auth)
        error, result = deserializeMessage(response.json())
        if error is not None:
            raise error
        else:
            return result

if __name__ == '__main__':
    from os import environ
    client = VegaBCHClient(endpoint=environ['VEGABCH_ENDPOINT'], username=environ['VEGABCH_USERNAME'], password=environ['VEGABCH_PASSWORD'])
    for wallet in client.invoke('wallet.list'):
        print(f' - {wallet.name} (type: {wallet.type})')
