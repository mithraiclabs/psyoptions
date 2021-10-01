import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { BN } from '@project-serum/anchor';

export const FEE_OWNER_KEY = new PublicKey(
  '6c33US7ErPmLXZog9SyChQUYUrrJY51k4GmzdhrbhNnD',
);

export const NFT_MINT_LAMPORTS = LAMPORTS_PER_SOL / 2;

export const feeAmountPerContract = (assetQuantity: BN) => {
  return assetQuantity.div(new BN(10_000 / 5));
};
