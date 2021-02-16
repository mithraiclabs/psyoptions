/**
 * This script is to benefit local development. 
 * It will create 2 SPL tokens and initialize and options market.
 */

import { Account, Connection, PublicKey, Transaction } from '@solana/web3.js';
import { Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';

const createSplAssets = async (connection, payer) => {
  const underlyingAssetAccount = new PublicKey();
  const quoteAssetAccount = new PublicKey();

  const underlyingAsset = await Token.createMint(connection, payer, underlyingAssetAccount, null, 16, TOKEN_PROGRAM_ID);
  const quoteAsset = await Token.createMint(connection, payer, quoteAssetAccount, null, 16, TOKEN_PROGRAM_ID);
  return { underlyingAsset, quoteAsset };
}

const buildAndInitMarket = async (optionsProgramId) => {
  // Create a connection to the local Solana cluster
  const connection = new Connection('http://localhost:8899');
  // Generate the payer / authority account that will set everything up
  const payer = new Account();
  await connection.requestAirdrop(payer.publicKey, 10**18);

  // Create the SPL tokens
  const { underlyingAsset, quoteAsset } = await createSplAssets(connection, payer);

  
}