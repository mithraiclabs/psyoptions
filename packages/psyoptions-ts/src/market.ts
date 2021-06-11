import { Connection, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import * as BufferLayout from 'buffer-layout';
import * as Layout from './layout';

type OptionMarketBufferData = {
  optionMintKey: PublicKey;
  writerTokenMintKey: PublicKey;
  underlyingAssetMintKey: PublicKey;
  quoteAssetMintKey: PublicKey;
  amountPerContract: BN;
  quoteAmountPerContract: BN;
  expiration: number;
  underlyingAssetPoolKey: PublicKey;
  quoteAssetPoolKey: PublicKey;
  mintFeeKey: PublicKey;
  exerciseFeeKey: PublicKey;
  bumpSeed: number;
  initialized: boolean;
};

export type OptionMarket = OptionMarketBufferData & {
  optionMarketKey: PublicKey;
};

export const OPTION_MARKET_LAYOUT = BufferLayout.struct([
  Layout.publicKey('optionMintKey'),
  Layout.publicKey('writerTokenMintKey'),
  Layout.publicKey('underlyingAssetMintKey'),
  Layout.publicKey('quoteAssetMintKey'),
  Layout.uint64('amountPerContract'),
  Layout.uint64('quoteAmountPerContract'),
  BufferLayout.ns64('expiration'),
  Layout.publicKey('underlyingAssetPoolKey'),
  Layout.publicKey('quoteAssetPoolKey'),
  Layout.publicKey('mintFeeKey'),
  Layout.publicKey('exerciseFeeKey'),
  BufferLayout.u8('bumpSeed'),
  BufferLayout.u8('initialized'),
]);

export class Market {
  programId: PublicKey;

  pubkey: PublicKey;

  marketData: OptionMarket;

  constructor(programId: PublicKey, pubkey: PublicKey, accountData: Buffer) {
    this.programId = programId;
    this.pubkey = pubkey;

    const bufferData = OPTION_MARKET_LAYOUT.decode(
      accountData,
    ) as OptionMarketBufferData;

    this.marketData = {
      ...bufferData,
      optionMarketKey: pubkey,
    };
  }

  /**
   * Get all the Markets the program has created.
   *
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
          market.marketData.underlyingAssetMintKey.toString(),
        ) &&
        assetAddresses.includes(market.marketData.quoteAssetMintKey.toString()),
    );
  };
}
