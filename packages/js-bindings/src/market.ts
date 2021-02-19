import * as BufferLayout from 'buffer-layout';
import * as Layout from './layout';

const MAX_CONTRACTS = 10;

export const optionWriterStructArray = [
  Layout.publicKey('underlyingAssetAcctAddress'),
  Layout.publicKey('quoteAssetAcctAddress'),
  Layout.publicKey('contractTokenAcctAddress'),
];

export const OPTION_WRITER_LAYOUT = BufferLayout.struct(
  optionWriterStructArray,
);

export const OPTION_MARKET_LAYOUT = BufferLayout.struct([
  Layout.publicKey('underlyingAssetMintAddress'),
  Layout.publicKey('quoteAssetMintAddress'),
  Layout.uint64('amountPerContract'),
  Layout.uint64('strikePrice'),
  BufferLayout.ns64('expirationUnixTimestamp'),
  Layout.publicKey('assetPoolAddress'),
  BufferLayout.u16('registryLength'),
  BufferLayout.seq(OPTION_WRITER_LAYOUT, MAX_CONTRACTS, 'optionWriterRegistry'),
]);
