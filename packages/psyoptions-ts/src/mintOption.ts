import * as anchor from '@project-serum/anchor';
import { struct } from 'buffer-layout';
import {
  AccountMeta,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SystemProgram,
  Keypair,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { feeAmountPerContract, FEE_OWNER_KEY } from './fees';
import { uint64 } from './layout';
import { OptionMarketV2 } from './types';

export const MINT_COVERED_CALL_LAYOUT = struct([uint64('size')]);

export const mintOptionsTx = async (
  program: anchor.Program,
  minter: Keypair,
  minterOptionAcct: Keypair,
  minterWriterAcct: Keypair,
  minterUnderlyingAccount: Keypair,
  size: anchor.BN,
  optionMarket: OptionMarketV2,
) => {
  let mintFeeKey: PublicKey,
    remainingAccounts: AccountMeta[] = [];
  const mintFee = feeAmountPerContract(
    optionMarket.underlyingAmountPerContract,
  );
  if (mintFee.gtn(0)) {
    mintFeeKey = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      optionMarket.underlyingAssetMint,
      FEE_OWNER_KEY,
    );
    remainingAccounts.push({
      pubkey: mintFeeKey,
      isWritable: true,
      isSigner: false,
    });
  }
  await program.rpc.mintOption(size, {
    accounts: {
      userAuthority: minter.publicKey,
      underlyingAssetMint: optionMarket.underlyingAssetMint,
      underlyingAssetPool: optionMarket.underlyingAssetPool,
      underlyingAssetSrc: minterUnderlyingAccount.publicKey,
      optionMint: optionMarket.optionMint,
      mintedOptionDest: minterOptionAcct.publicKey,
      writerTokenMint: optionMarket.writerTokenMint,
      mintedWriterTokenDest: minterWriterAcct.publicKey,
      optionMarket: optionMarket.key,
      feeOwner: FEE_OWNER_KEY,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      clock: SYSVAR_CLOCK_PUBKEY,
      rent: SYSVAR_RENT_PUBKEY,
      systemProgram: SystemProgram.programId,
    },
    remainingAccounts,
    signers: [minter],
  });
};
