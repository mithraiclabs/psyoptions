import { Connection, PublicKey } from '@solana/web3.js';
import { OptionWriterRegistry, OPTION_WRITER_REGISTRY_LAYOUT } from '../market';

/**
 * Fetch and decode the Option Market Data account
 */
export const getOptionWriterRegistry = async (
  connection: Connection,
  optionWriterRegistryKey: PublicKey,
): Promise<OptionWriterRegistry> => {
  const info = await connection.getAccountInfo(optionWriterRegistryKey);
  return OPTION_WRITER_REGISTRY_LAYOUT.decode(
    info.data,
  ) as OptionWriterRegistry;
};
