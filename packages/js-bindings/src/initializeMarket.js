import { TransactionInstruction } from '@solana/web3.js'

/*
// One way to convert to uint64 bytes if you can't find a better way:
const n = 123456789
const hex = n.toString(16) // e.g. 75bcd15
const padding = hex.length + hex.length % 2 // 1 or 0 depending on length
const hexBytes = hex
  .padStart(padding, '0')
  .padEnd(16, '0')
  .match(/.{2}/g)
  .map(hex => parseInt(hex, 16))
const leBytes = Uint8Array.from(hexBytes)

console.log(leBytes)
*/

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
  // Convert apc, strike price, expiration to byte arrays and push them to data
  const data = new Uint8Array(25)

  const instruction = new TransactionInstruction({
    keys: [
      underlyingAssetAccount,
      quoteAssetAccount,
      optionMintAccount,
      optionMarketDataAccount,
      optionMintAuthority,
      underlyingAssetPoolAccount,
    ],
    data, // must be turned into base58 before sending I think
    programId,
  })

  return instruction
}

export { initializeMarket }
