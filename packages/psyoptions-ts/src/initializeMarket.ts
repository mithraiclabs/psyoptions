import {
  PublicKey,
  Transaction,
  SystemProgram,
  Connection,
  Keypair,
} from '@solana/web3.js';
import {
  AccountLayout,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MintLayout,
  Token,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { FEE_OWNER_KEY } from './fees';

export const getOrAddAssociatedTokenAccountTx = async (
  associatedAddress: PublicKey,
  token: Token,
  payer: PublicKey,
  owner: PublicKey = FEE_OWNER_KEY,
) => {
  // This is the optimum logic, considering TX fee, client-side computation,
  // RPC roundtrips and guaranteed idempotent.
  // Sadly we can't do this atomically;
  try {
    await token.getAccountInfo(associatedAddress);
    return null;
  } catch (err) {
    // INVALID_ACCOUNT_OWNER can be possible if the associatedAddress has
    // already been received some lamports (= became system accounts).
    // Assuming program derived addressing is safe, this is the only case
    // for the INVALID_ACCOUNT_OWNER in this code-path
    if (
      err.message === 'Failed to find account' ||
      err.message === 'Invalid account owner'
    ) {
      // as this isn't atomic, it's possible others can create associated
      // accounts meanwhile
      return Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        token.publicKey,
        associatedAddress,
        owner,
        payer,
      );
    } else {
      throw err;
    }
  }
};
