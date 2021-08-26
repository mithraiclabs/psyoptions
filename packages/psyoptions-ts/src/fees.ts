import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

export const FEE_OWNER_KEY = new PublicKey(
  '6c33US7ErPmLXZog9SyChQUYUrrJY51k4GmzdhrbhNnD',
);

export const feeAmount = (assetQuantity: BN) => {
  return assetQuantity.div(new BN(10_000 / 5))
}