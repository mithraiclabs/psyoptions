import { Connection, PublicKey } from '@solana/web3.js';
import { DecodedOptionMarket, OptionWriter } from '../market';
import { getOptionMarketData } from './getOptionMarketData';
import { getOptionWriterRegistry } from './getOptionWriterRegistry';

/**
 * Returns a tuple containing a random option writer and the Option Market data
 *
 * @param connection solana web3 connection
 * @param optionMarketKey Pubkey of the Option Market data account
 */
export const getRandomOptionWriter = async (
  connection: Connection,
  optionMarketKey: PublicKey,
): Promise<[OptionWriter, DecodedOptionMarket]> => {
  const optionMarketData = await getOptionMarketData(
    connection,
    optionMarketKey,
  );
  const optionWriterRegistry = await getOptionWriterRegistry(
    connection,
    optionMarketData.writerRegistryAddress,
  );
  const randRegistryIndex = Math.floor(
    Math.random() * (optionWriterRegistry.registryLength - 1),
  );

  return [optionWriterRegistry.registry[randRegistryIndex], optionMarketData];
};
