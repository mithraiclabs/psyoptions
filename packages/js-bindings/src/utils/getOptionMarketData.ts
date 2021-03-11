import { Connection, PublicKey } from '@solana/web3.js';
import { OptionMarket, OPTION_MARKET_LAYOUT } from '../market';

/**
 * Fetch and decode the Option Market Data account
 */
export const getOptionMarketData = async (
  connection: Connection,
  optionMarket: PublicKey,
): Promise<OptionMarket> => {
  const info = await connection.getAccountInfo(optionMarket);
  return OPTION_MARKET_LAYOUT.decode(info.data) as OptionMarket;
};
