import { TransferErrorCodes } from './TransferErrorCodes.js';

export class TransferError extends Error {
  code: TransferErrorCodes;

  constructor(code: TransferErrorCodes) {
    super();

    this.code = code;
  }
}
