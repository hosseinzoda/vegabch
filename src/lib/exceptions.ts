import {
  Exception, InternalError, NotFoundError,
  ValueError, NotImplemented, InvalidProgramState,
  BaseException, ExceptionRegistry, IBaseExceptionConstructor
} from '@cashlab/common/exceptions.js';
export * from '@cashlab/common/exceptions.js';

export class RPCHTTPError extends Exception {
  status_code: number;
  status_message: string;
  constructor (message: string, payload?: any) {
    super(message, payload);
    this.status_code = this.payload.status_code;
    this.status_message = this.payload.status_message;
  }
}

for (let [ name, exception ] of [
  [ 'RPCHTTPError', RPCHTTPError ],
]) {
  ExceptionRegistry.add(name as string, exception as IBaseExceptionConstructor)
}

