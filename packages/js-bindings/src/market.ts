import * as BufferLayout from 'buffer-layout';
import * as Layout from './layout';

const MAX_CONTRACTS = 10;

export type OptionWriter = {
  underlyingAssetAcctAddress: string;
  quoteAssetAcctAddress: string;
  contractTokenAcctAddress: string;
}
export const optionWriterStructArray = [
  Layout.publicKey('underlyingAssetAcctAddress'),
  Layout.publicKey('quoteAssetAcctAddress'),
  Layout.publicKey('contractTokenAcctAddress'),
];

export const OPTION_WRITER_LAYOUT = BufferLayout.struct(
  optionWriterStructArray,
);

export type OptionMarket = {
  optionMintAddress: string;
  underlyingAssetMintAddress: string;
  quoteAssetMintAddress: string;
  amountPerContract: number;
  strikePrice: number;
  expirationUnixTimestamp: number;
  underlyingAssetPoolAddress: string;
  registryLength: number;
  optionWriterRegistry: OptionWriter[];
};
export const OPTION_MARKET_LAYOUT = BufferLayout.struct([
  Layout.publicKey('optionMintAddress'),
  Layout.publicKey('underlyingAssetMintAddress'),
  Layout.publicKey('quoteAssetMintAddress'),
  Layout.uint64('amountPerContract'),
  Layout.uint64('strikePrice'),
  BufferLayout.ns64('expirationUnixTimestamp'),
  Layout.publicKey('underlyingAssetPoolAddress'),
  BufferLayout.u16('registryLength'),
  BufferLayout.seq(OPTION_WRITER_LAYOUT, MAX_CONTRACTS, 'optionWriterRegistry'),
]);
