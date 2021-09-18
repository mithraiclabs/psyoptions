import * as anchor from '@project-serum/anchor';
import { PublicKey } from '@solana/web3.js';

export type SolanaRpcResponse = {
  pubkey: string;
  account: {
    data: string;
    executable: boolean;
    owner: string;
    lamports: string;
  };
};

export type OptionMarketV2 = {
  key: PublicKey;
  optionMint: PublicKey;
  writerTokenMint: PublicKey;
  underlyingAssetMint: PublicKey;
  quoteAssetMint: PublicKey;
  underlyingAssetPool: PublicKey;
  quoteAssetPool: PublicKey;
  mintFeeAccount: PublicKey;
  exerciseFeeAccount: PublicKey;
  underlyingAmountPerContract: anchor.BN;
  quoteAmountPerContract: anchor.BN;
  expirationUnixTimestamp: anchor.BN;
  expired: boolean;
  bumpSeed: number;
};
