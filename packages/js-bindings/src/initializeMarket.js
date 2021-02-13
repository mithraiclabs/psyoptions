import { struct, u16, nu64, ns64 } from 'buffer-layout';
import { PublicKey, TransactionInstruction } from '@solana/web3.js'

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


const initializeMarket = ({
  programId, // the deployed program account
  underlyingAssetAccount, // user's account to get underlying asset from
  quoteAssetAccount, // user's account to get quote asset from
  optionMintAccount, // user's account to send minted tokens to
  optionMarketDataAccount, // ??? - the program's data account...?
  optionMintAuthority, // ??? - need to ask
  underlyingAssetPoolAccount, // ??? - need to ask
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

  const instruction = new TransactionInstruction({
    keys: [
      underlyingAssetAccount,
      quoteAssetAccount,
      optionMintAccount,
      optionMarketDataAccount,
      optionMintAuthority,
      underlyingAssetPoolAccount,
    ],
    data,
    programId,
  })

  return instruction
}

export { initializeMarket }
