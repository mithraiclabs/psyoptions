import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

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
  underlyingAmountPerContract: BN;
  quoteAmountPerContract: BN;
  expirationUnixTimestamp: BN;
  serumMarket?: PublicKey;
  bumpSeed: number;
};
