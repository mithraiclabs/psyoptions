/**
 * This script is to benefit local development. 
 * It will create 2 SPL tokens and initialize and options market.
 */

import { Account, Connection, PublicKey, Transaction } from '@solana/web3.js';
import { Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { initializeMarket } from '../packages/js-bindings/src/index.js';

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
  try {
    await connection.requestAirdrop(payer.publicKey, 10**6);
  } catch (error) {
    console.error('Airdrop Error: ', error);
  }

  let underlyingAsset, quoteAsset;
  // Create the SPL tokens
  try {
    const res = await createSplAssets(connection, payer);
    underlyingAsset = res.underlyingAsset;
    quoteAsset = res.quoteAsset;
  } catch (error) {
    console.error('createSplAssets Error: ', error);
  }

  // The market will expire 2 weeks from now
  let expirationTimeStamp = new Date();
  expirationTimeStamp.setDate(expirationTimeStamp.getDate() + 14);

  try {
    initializeMarket(
      connection, 
      payer, 
      optionsProgramId, 
      underlyingAsset.publicKey, 
      quoteAsset.publicKey,
      100,
      5,
      expirationTimeStamp.getTime()
    )
  } catch (error) {
    console.error('initializeMarket Error: ', error);
  }
}

buildAndInitMarket('4Regns6jCJCpcc5qkTzKnxVV9AX5fZQgtmqhhaRj3tgi');