import { Connection, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import * as BufferLayout from 'buffer-layout';
import * as Layout from './layout';

const MAX_CONTRACTS = 10;

export type OptionWriter = {
  underlyingAssetAcctAddress: PublicKey;
  quoteAssetAcctAddress: PublicKey;
  contractTokenAcctAddress: PublicKey;
};
export const optionWriterStructArray = [
  Layout.publicKey('underlyingAssetAcctAddress'),
  Layout.publicKey('quoteAssetAcctAddress'),
  Layout.publicKey('contractTokenAcctAddress'),
] as BufferLayout.Layout<any>[];

export const OPTION_WRITER_LAYOUT = BufferLayout.struct(
  optionWriterStructArray,
);

export type OptionWriterRegistry = {
  accountType: Layout.AccountType.Registry;
  optionMarketKey: PublicKey;
  registryLength: number;
  registry: OptionWriter[];
};

export type OptionMarket = {
  accountType: Layout.AccountType.Market;
  optionMintAddress: PublicKey;
  underlyingAssetMintAddress: PublicKey;
  quoteAssetMintAddress: PublicKey;
  amountPerContract: BN;
  quoteAmountPerContract: BN;
  expirationUnixTimestamp: number;
  underlyingAssetPoolAddress: PublicKey;
  writerRegistryAddress: PublicKey;
};

export const OPTION_MARKET_LAYOUT = BufferLayout.struct([
  Layout.accountType('accountType'),
  Layout.publicKey('optionMintAddress'),
  Layout.publicKey('underlyingAssetMintAddress'),
  Layout.publicKey('quoteAssetMintAddress'),
  Layout.uint64('amountPerContract'),
  Layout.uint64('quoteAmountPerContract'),
  BufferLayout.ns64('expirationUnixTimestamp'),
  Layout.publicKey('underlyingAssetPoolAddress'),
  Layout.publicKey('writerRegistryAddress'),
]);

export const OPTION_WRITER_REGISTRY_LAYOUT = BufferLayout.struct([
  Layout.accountType('accountType'),
  Layout.publicKey('optionMarketKey'),
  BufferLayout.u16('registryLength'),
  BufferLayout.seq(OPTION_WRITER_LAYOUT, MAX_CONTRACTS, 'registry'),
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
          market.marketData.underlyingAssetMintAddress.toString(),
        ) &&
        assetAddresses.includes(
          market.marketData.quoteAssetMintAddress.toString(),
        ),
    );
  };
}
