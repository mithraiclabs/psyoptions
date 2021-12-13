import * as anchor from "@project-serum/anchor";
import { BN, Provider } from "@project-serum/anchor";
import { serumUtils } from "@mithraic-labs/psy-american";
import {
  DexInstructions,
  Logger,
  Market,
  MarketProxy,
  MarketProxyBuilder,
  MARKET_STATE_LAYOUT_V3,
  Middleware,
  OpenOrdersPda,
  ReferralFees,
  TokenInstructions,
} from "@project-serum/serum";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import * as serumCmn from "@project-serum/common";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { OptionMarketV2 } from "../packages/psyoptions-ts/src/types";

const MARKET_MAKER = new Keypair();
export const DEX_PID = new PublicKey(
  "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"
);
export const REFERRAL_AUTHORITY = new PublicKey(
  "6c33US7ErPmLXZog9SyChQUYUrrJY51k4GmzdhrbhNnD"
);

type GetAuthority = (market: PublicKey) => Promise<PublicKey>;
type MarketLoader = (marketKey: PublicKey) => Promise<MarketProxy>;
type MarketMaker = {
  tokens: Record<string, any>;
  account: Keypair;
};

type Orders = number[][];

export const marketLoader =
  (
    provider: anchor.Provider,
    program: anchor.Program,
    optionMarketKey: PublicKey,
    marketAuthorityBump: number
  ) =>
  async (marketKey: PublicKey) => {
    return new MarketProxyBuilder()
      .middleware(
        new OpenOrdersPda({
          proxyProgramId: program.programId,
          dexProgramId: DEX_PID,
        })
      )
      .middleware(new Validation(optionMarketKey, marketAuthorityBump))
      .middleware(new Logger())
      .middleware(new ReferralFees())
      .load({
        connection: provider.connection,
        market: marketKey,
        dexProgramId: DEX_PID,
        proxyProgramId: program.programId,
        options: { commitment: "recent" },
      });
  };

export const initMarket = async (
  provider: Provider,
  /** The PsyOptions anchor.Program */
  program: anchor.Program,
  marketLoader: MarketLoader,
  optionMarket: OptionMarketV2,
  pcMint: PublicKey
) => {
  const [MARKET_A_USDC, vaultSigner, marketAuthority, marketAuthorityBump] =
    await setupMarket({
      provider,
      program,
      baseMint: optionMarket.optionMint,
      quoteMint: pcMint,
      marketLoader,
      optionMarket,
    });
  return {
    marketA: MARKET_A_USDC,
    vaultSigner,
    usdc: pcMint,
    marketAuthority,
    marketAuthorityBump,
  };
};

async function setupMarket({
  provider,
  program,
  baseMint,
  quoteMint,
  marketLoader,
  optionMarket,
}: {
  provider: anchor.Provider;
  program: anchor.Program;
  optionMarket: OptionMarketV2;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  marketLoader: MarketLoader;
}): Promise<
  [
    MarketProxy,
    anchor.web3.PublicKey | anchor.BN,
    anchor.web3.PublicKey,
    number
  ]
> {
  const {
    serumMarketKey: marketAPublicKey,
    vaultOwner,
    marketAuthority,
    marketAuthorityBump,
  } = await listMarket({
    provider,
    program,
    quoteMint: quoteMint,
    dexProgramId: DEX_PID,
    feeRateBps: 0,
    optionMarket,
  });
  const MARKET_A_USDC = await marketLoader(marketAPublicKey as PublicKey);
  return [MARKET_A_USDC, vaultOwner, marketAuthority, marketAuthorityBump];
}

const listMarket = async ({
  provider,
  program,
  quoteMint,
  dexProgramId,
  feeRateBps,
  optionMarket,
}: {
  provider: anchor.Provider;
  program: anchor.Program;
  quoteMint: PublicKey;
  dexProgramId: PublicKey;
  feeRateBps: number;
  optionMarket: OptionMarketV2;
}) => {
  const { connection, wallet } = provider;

  const { bids, asks, eventQueue } = await createFirstSetOfAccounts({
    connection: connection,
    wallet: wallet as anchor.Wallet,
    dexProgramId,
  });

  const { serumMarketKey, vaultOwner, marketAuthority, marketAuthorityBump } =
    await initSerum(
      provider,
      program,
      optionMarket,
      quoteMint,
      eventQueue.publicKey,
      bids.publicKey,
      asks.publicKey,
      dexProgramId
    );

  return { serumMarketKey, vaultOwner, marketAuthority, marketAuthorityBump };
};

export const createFirstSetOfAccounts = async ({
  connection,
  wallet,
  dexProgramId,
}: {
  connection: Connection;
  wallet: anchor.Wallet;
  dexProgramId: PublicKey;
}) => {
  const eventQueue = new Keypair();
  const bids = new Keypair();
  const asks = new Keypair();

  const tx2 = new Transaction();
  tx2.add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: eventQueue.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(262144 + 12),
      space: 262144 + 12,
      programId: dexProgramId,
    }),
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: bids.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(65536 + 12),
      space: 65536 + 12,
      programId: dexProgramId,
    }),
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: asks.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(65536 + 12),
      space: 65536 + 12,
      programId: dexProgramId,
    })
  );

  const transactions = [
    {
      transaction: tx2,
      signers: [eventQueue, bids, asks],
    },
  ];
  for (let tx of transactions) {
    await anchor.getProvider().send(tx.transaction, tx.signers);
  }

  return { eventQueue, bids, asks };
};

export const getVaultOwnerAndNonce = async (
  marketPublicKey: PublicKey,
  dexProgramId = DEX_PID
) => {
  const nonce = new BN(0);
  while (nonce.toNumber() < 255) {
    try {
      const vaultOwner = await PublicKey.createProgramAddress(
        [marketPublicKey.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
        dexProgramId
      );
      return [vaultOwner, nonce];
    } catch (e) {
      nonce.iaddn(1);
    }
  }
  throw new Error("Unable to find nonce");
};

// b"open-orders"
export const openOrdersSeed = Buffer.from([
  111, 112, 101, 110, 45, 111, 114, 100, 101, 114, 115,
]);

// b"open-orders-init"
const openOrdersInitSeed = Buffer.from([
  111, 112, 101, 110, 45, 111, 114, 100, 101, 114, 115, 45, 105, 110, 105, 116,
]);

export class Validation implements Middleware {
  optionMarketKey: PublicKey;
  marketAuthorityBump: number;

  constructor(optionMarketKey: PublicKey, marketAuthorityBump: number) {
    this.optionMarketKey = optionMarketKey;
    this.marketAuthorityBump = marketAuthorityBump;
  }
  initOpenOrders(ix: TransactionInstruction) {
    ix.data = Buffer.concat([Buffer.from([0]), ix.data]);
  }
  newOrderV3(ix: TransactionInstruction) {
    ix.data = Buffer.concat([Buffer.from([1]), ix.data]);
  }
  cancelOrderV2(ix: TransactionInstruction) {
    ix.data = Buffer.concat([Buffer.from([2]), ix.data]);
  }
  cancelOrderByClientIdV2(ix: TransactionInstruction) {
    ix.data = Buffer.concat([Buffer.from([3]), ix.data]);
  }
  settleFunds(ix: TransactionInstruction) {
    ix.data = Buffer.concat([Buffer.from([4]), ix.data]);
  }
  closeOpenOrders(ix: TransactionInstruction) {
    ix.data = Buffer.concat([Buffer.from([5]), ix.data]);
  }
  prune(ix: TransactionInstruction) {
    // prepend a discriminator and the marketAuthorityBump
    const bumpBuffer = new anchor.BN(this.marketAuthorityBump).toBuffer(
      "le",
      1
    );
    ix.data = Buffer.concat([Buffer.from([6]), bumpBuffer, ix.data]);
    // prepend the optionMarket key
    ix.keys = [
      { pubkey: this.optionMarketKey, isWritable: false, isSigner: false },
      ...ix.keys,
    ];
  }
}

export const initSerum = async (
  provider: anchor.Provider,
  program: anchor.Program,
  optionMarket: OptionMarketV2,
  pcMint: PublicKey,
  eventQueue: PublicKey,
  bids: PublicKey,
  asks: PublicKey,
  dexProgramId: PublicKey
) => {
  const [requestQueue, _requestQueueBump] = await serumUtils.deriveRequestQueue(
    program,
    optionMarket.key,
    pcMint
  );

  const [coinVault, _coinVaultBump] = await serumUtils.deriveCoinVault(
    program,
    optionMarket.key,
    pcMint
  );
  const [pcVault, _pcVaultBump] = await serumUtils.derivePCVault(
    program,
    optionMarket.key,
    pcMint
  );

  const { serumMarketKey, marketAuthority, marketAuthorityBump } =
    await getMarketAndAuthorityInfo(
      program,
      optionMarket,
      dexProgramId,
      pcMint
    );

  const [vaultOwner, vaultSignerNonce] = await getVaultOwnerAndNonce(
    serumMarketKey,
    DEX_PID
  );

  const coinLotSize = new anchor.BN(1);
  const pcLotSize = new anchor.BN(100);
  const pcDustThreshold = new anchor.BN(100);
  await program.rpc.initSerumMarket(
    new anchor.BN(MARKET_STATE_LAYOUT_V3.span),
    vaultSignerNonce,
    coinLotSize,
    pcLotSize,
    pcDustThreshold,
    {
      accounts: {
        userAuthority: (provider.wallet as anchor.Wallet).payer.publicKey,
        optionMarket: optionMarket.key,
        serumMarket: serumMarketKey,
        dexProgram: DEX_PID,
        pcMint,
        optionMint: optionMarket.optionMint,
        requestQueue,
        eventQueue,
        bids,
        asks,
        coinVault,
        pcVault,
        vaultSigner: vaultOwner,
        marketAuthority,
        rent: SYSVAR_RENT_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      },
      signers: [(provider.wallet as anchor.Wallet).payer],
    }
  );
  return { serumMarketKey, vaultOwner, marketAuthority, marketAuthorityBump };
};

export const getMarketAndAuthorityInfo = async (
  program: anchor.Program,
  optionMarket: OptionMarketV2,
  dexProgramId: anchor.web3.PublicKey,
  serumQuoteAsset: PublicKey
) => {
  const textEncoder = new TextEncoder();
  const [serumMarketKey, _serumMarketBump] =
    await serumUtils.deriveSerumMarketAddress(
      program,
      optionMarket.key,
      serumQuoteAsset
    );
  const [marketAuthority, marketAuthorityBump] =
    await PublicKey.findProgramAddress(
      [
        textEncoder.encode("open-orders-init"),
        dexProgramId.toBuffer(),
        serumMarketKey.toBuffer(),
      ],
      program.programId
    );

  return { serumMarketKey, marketAuthority, marketAuthorityBump };
};
