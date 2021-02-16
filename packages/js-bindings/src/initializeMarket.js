import { struct, u16, nu64, ns64 } from 'buffer-layout';
import { 
  PublicKey, 
  TransactionInstruction, 
  SYSVAR_CLOCK_PUBKEY, 
  SYSVAR_RENT_PUBKEY, 
  Account, 
  Transaction,
  SystemProgram
} from '@solana/web3.js'
import { MintLayout, TOKEN_PROGRAM_ID } from '@solana/spl-token';

// TODO create struct for initialize market date
/**
 * 
 * OptionsInstruction::InitializeMarket {
 *      /// The amount of the **underlying asset** that derives a single contract
 *      amount_per_contract: u64,
 *      /// The strike price for the new market
 *      strike_price: u64,
 *      /// The Unix timestamp at which the contracts in this market expire
 *      expiration_unix_timestamp: UnixTimestamp,
 *  }
 * 
 * UnixTimestamp is really an alias for i64 type.
 */
export const INITIALIZE_MARKET_LAYOUT = struct([
  nu64('amountPerContract'),
  nu64('strikePrice'),
  ns64('expirationUnixTimestamp')
]);

export const INTRUCTION_TAG_LAYOUT = u16('instructionTag');


export const initializeMarketInstruction = async ({
  programId, // the deployed program account
  // The public key of the SPL Token Mint for the underlying asset
  underlyingAssetMint, 
  // The public key of the SPL Token Mint for the quote asset
  quoteAssetMint,
  // The public key of the SPL Token Mint for the new option SPL token
  optionMintAccount, 
  // The public key for a new Account that will store the data for the options market
  optionMarketDataAccount, 
  // The public key for a new Account that will be the underlying asset pool
  underlyingAssetPoolAccount,
  amountPerContract,
  strikePrice,
  expirationUnixTimestamp,
}) => {
  // Create a u8 buffer that conforms to the InitializeMarket structure
  const initializeMarketBuffer = Buffer.alloc(INITIALIZE_MARKET_LAYOUT.span)
  INITIALIZE_MARKET_LAYOUT.encode({
    amountPerContract,
    strikePrice,
    expirationUnixTimestamp
  }, initializeMarketBuffer, 0);

  /*
   * Generate the instruction tag. 0 is the tag that denotes the InitializeMarket instructions
   * The tags can be found the OptionInstruction.unpack function (instruction.rs)
   */
  const tagBuffer = Buffer.alloc(INTRUCTION_TAG_LAYOUT.span);
  INTRUCTION_TAG_LAYOUT.encode(0, tagBuffer, 0);

  // concatentate the tag with the data
  const data = Buffer.concat([tagBuffer, initializeMarketBuffer]);


  // Generate the program derived address needed
  const [optionsSplAuthorityPubkey, _bumpSeed] = await PublicKey.findProgramAddress([optionMintAccount.toBuffer()], programId);

  const instruction = new TransactionInstruction({
    // The order of the accounts must match the instruction.rs implementation
    keys: [
      { pubkey: underlyingAssetMint, isSigner: false, isWritable: false },
      { pubkey: quoteAssetMint, isSigner: false, isWritable: false },
      { pubkey: optionMintAccount, isSigner: false, isWritable: true },
      { pubkey: optionMarketDataAccount, isSigner: false, isWritable: true },
      { pubkey: optionsSplAuthorityPubkey, isSigner: false, isWritable: false },
      { pubkey: underlyingAssetPoolAccount, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
    programId,
  })

  return instruction
}

export const initializeMarket = (
  connection, 
  payer, 
  programId, // the deployed program account
  // The public key of the SPL Token Mint for the underlying asset
  underlyingAssetMint, 
  // The public key of the SPL Token Mint for the quote asset
  quoteAssetMint,
  amountPerContract,
  strikePrice,
  expirationUnixTimestamp,
  )  => {

    const optionMintAccount = new Account();
    const optionMarketDataAccount = new Account();
    const underlyingAssetPoolAccount = new Account();

    const transaction = new Transaction();

    // Create the Option Mint Account with rent exemption
    // Allocate memory for the account
    const optionMintRentBalance = await Token.getMinBalanceRentForExemptMint(
      connection,
    );
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: optionMintAccount.publicKey,
        lamports: optionMintRentBalance,
        space: MintLayout.span,
        programId: TOKEN_PROGRAM_ID
      })
    )

    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: optionMarketDataAccount.publicKey,
        lamports: 
      })
    )



}