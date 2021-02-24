import { AccountInfo, Connection, PublicKey } from '@solana/web3.js';
import * as BufferLayout from 'buffer-layout';
import * as Layout from './layout';
import { SolanaRpcResponse } from './types';

const MAX_CONTRACTS = 10;

export type OptionWriter = {
  underlyingAssetAcctAddress: string;
  quoteAssetAcctAddress: string;
  contractTokenAcctAddress: string;
};
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

export class Market {
  programId: PublicKey;

  pubkey: PublicKey;

  marketData: OptionMarket;

  constructor(programId: PublicKey, pubkey: PublicKey, accountData: Buffer) {
    this.programId = programId;
    this.pubkey = pubkey;
    this.marketData = OPTION_MARKET_LAYOUT.decode(accountData) as OptionMarket;
  }

  /**
   * Get all the Markets the program has created.
   *
   * TODO the RPC request to solana could have a massive response because the
   * buffer sizes for a market are huge. We will need to break them out and
   * refactor.
   * @param {Connection} connection
   * @param {PublicKey} programId
   */
  static getAllMarkets = async (
    connection: Connection,
    programId: PublicKey,
  ) => {
    const res = await connection.getProgramAccounts(
      programId,
      connection.commitment,
    );
    return res.map(
      // eslint-disable-next-line prettier/prettier
      ({ pubkey, account }) => new Market(programId, pubkey, account.data),
    );
  };

  /**
   * Takes in an array of supported assets and filters the options markets to
   * only one's where the underlying asset and quote asseta are supported.
   * @param {Connection} connection
   * @param {PublicKey} programId
   * @param {PublicKey[]} assets
   */
  static getAllMarketsBySplSupport = async (
    connection: Connection,
    programId: PublicKey,
    assets: PublicKey[],
  ) => {
    // convert assets to an array of strings
    const assetAddresses = assets.map((asset) => asset.toString());
    // Get all the markets the program has created
    const markets = await Market.getAllMarkets(connection, programId);
    return markets.filter(
      (market) =>
        // eslint-disable-next-line implicit-arrow-linebreak
        assetAddresses.includes(
          new PublicKey(
            market.marketData.underlyingAssetMintAddress,
          ).toString(),
        ) &&
        assetAddresses.includes(
          new PublicKey(market.marketData.quoteAssetMintAddress).toString(),
        ),
    );
  };
}
