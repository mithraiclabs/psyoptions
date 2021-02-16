/**
 * This script is to benefit local development. 
 * It will create 2 SPL tokens and initialize and options market.
 */

import { Account, Connection, PublicKey, Transaction } from '@solana/web3.js';
import { Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { initializeMarket } from '../packages/js-bindings/src/index.js';
const readline = require('readline');

const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

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
  // Generate the payer / authority account that will set everything up (with 1,000 SOL)
  const payer = new Account();
  const lamports = 10**12;
  try {
    await connection.requestAirdrop(payer.publicKey, lamports);
  } catch (error) {
    console.error('Airdrop Error: ', error);
  }
  let retries = 10;
  for (;;) {
    await sleep(500);
    if (lamports == (await connection.getBalance(payer.publicKey))) {
      return account;
    }
    if (--retries <= 0) {
      break;
    }
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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Please paste your options program address\n', (optionsProgramId) => {
  buildAndInitMarket(optionsProgramId);
});
