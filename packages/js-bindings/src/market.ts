import {
  AccountInfo,
  Connection,
  PublicKey,
  RpcResponseAndContext,
} from '@solana/web3.js';
import * as BufferLayout from 'buffer-layout';
import * as Layout from './layout';

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

type SolanaRpcResponse = {
  pubkey: string;
  account: {
    data: string;
    executable: boolean;
    owner: string;
    lamports: string;
  };
};

export class Market {
  programId: PublicKey;

  pubkey: PublicKey;

  marketData: OptionMarket;

  constructor(programId: PublicKey, pubkey: PublicKey, accountData: Buffer) {
    this.programId = programId;
    this.pubkey = pubkey;
    this.marketData = OPTION_MARKET_LAYOUT.decode(accountData) as OptionMarket;
  }

  static getAllMarkets = async (
    connection: Connection,
    programId: PublicKey,
  ) => {
    const res = await Market.getFilteredProgramAccounts(
      connection,
      programId,
      [],
    );
    return res.map(
      // eslint-disable-next-line prettier/prettier
      ({ publicKey, accountInfo }) => new Market(programId, publicKey, accountInfo.data),
    );
  };

  static getFilteredProgramAccounts = async (
    connection: Connection,
    programId: PublicKey,
    filters: any,
  ): Promise<{ publicKey: PublicKey; accountInfo: AccountInfo<Buffer> }[]> => {
    // @ts-ignore
    // eslint-disable-next-line no-underscore-dangle
    const resp = await connection._rpcRequest('getProgramAccounts', [
      programId.toBase58(),
      {
        commitment: connection.commitment,
        filters,
        encoding: 'base64',
      },
    ]);
    if (resp.error) {
      throw new Error(resp.error.message);
    }
    return resp.result.map(
      ({
        pubkey,
        account: { data, executable, owner, lamports },
      }: SolanaRpcResponse) => ({
        publicKey: new PublicKey(pubkey),
        accountInfo: {
          data: Buffer.from(data[0], 'base64'),
          executable,
          owner: new PublicKey(owner),
          lamports,
        },
      }),
    );
  };
}
