/* eslint-disable max-classes-per-file */
import * as BufferLayout from 'buffer-layout';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

class PublicKeyLayout extends BufferLayout.Blob {
  constructor(property: string) {
    super(32, property);
  }

  decode(b: Buffer, offset?: number) {
    return new PublicKey(super.decode(b, offset));
  }

  encode(src: any, b: Buffer, offset?: number) {
    return super.encode(src.toBuffer(), b, offset);
  }
}

class BNLayout extends BufferLayout.Blob {
  decode(b: Buffer, offset?: number) {
    return new BN(super.decode(b, offset), 10, 'le');
  }

  encode(src: any, b: Buffer, offset?: number) {
    return super.encode(src.toArrayLike(Buffer, 'le', this.span), b, offset);
  }
}
/**
 * Layout for a public key
 */
export const publicKey = (property: string) => new PublicKeyLayout(property);

/**
 * Layout for a 64bit unsigned value
 */
export const uint64 = (property: string) => new BNLayout(8, property);

/**
 * Layout for the OptionInstruction tag
 */
export const INTRUCTION_TAG_LAYOUT = BufferLayout.u16('instructionTag');
