import * as anchor from "@project-serum/anchor";
import assert from "assert";
import { MARKET_STATE_LAYOUT_V3 } from "@project-serum/serum";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { OptionMarketV2 } from "../../packages/psyoptions-ts/src/types";
import {
  initNewTokenMint,
  initOptionMarket,
  initSetup,
} from "../../utils/helpers";
import {
  createFirstSetOfAccounts,
  DEX_PID,
  getVaultOwnerAndNonce,
} from "../../utils/serum";

describe("permissioned-markets", () => {
  // Anchor client setup.
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.PsyAmerican as anchor.Program;
  // Token client.
  let usdcClient;
  let usdcMint: Keypair;

  // Global DEX accounts and clients shared across all tests.
  let marketProxy, tokenAccount, usdcAccount;
  let openOrders, openOrdersBump, openOrdersInitAuthority, openOrdersBumpinit;
  let usdcPosted;
  let referralTokenAddress;
  // Global PsyOptions accounts
  let optionMarket: OptionMarketV2;
  const mintAuthority = anchor.web3.Keypair.generate();
  describe("OptionMarket is initialized", () => {
    let bids: Keypair, asks: Keypair, eventQueue: Keypair;

    before(async () => {
      const { mintAccount } = await initNewTokenMint(
        provider.connection,
        (provider.wallet as anchor.Wallet).payer.publicKey,
        (provider.wallet as anchor.Wallet).payer
      );
      usdcMint = mintAccount;
    });

    beforeEach(async () => {
      // Set up and initialize a new OptionMarket
      const {
        optionMarket: newOptionMarket,
        remainingAccounts,
        instructions,
      } = await initSetup(
        provider,
        (provider.wallet as anchor.Wallet).payer,
        mintAuthority,
        program
      );
      optionMarket = newOptionMarket;
      await initOptionMarket(
        program,
        (provider.wallet as anchor.Wallet).payer,
        optionMarket,
        remainingAccounts,
        instructions
      );
      ({ bids, asks, eventQueue } = await createFirstSetOfAccounts({
        connection: provider.connection,
        wallet: provider.wallet as anchor.Wallet,
        dexProgramId: DEX_PID,
      }));
    });

    // it("Initializes an orderbook", async () => {
    //   const marketLoader = async (market: PublicKey) => {
    //     return new MarketProxyBuilder()
    //       .middleware(
    //         new OpenOrdersPda({
    //           proxyProgramId: program.programId,
    //           dexProgramId: DEX_PID,
    //         })
    //       )
    //       .middleware(new ReferralFees())
    //       .middleware(new Identity())
    //       .middleware(new Logger())
    //       .load({
    //         connection: provider.connection,
    //         market,
    //         dexProgramId: DEX_PID,
    //         proxyProgramId: program.programId,
    //         options: { commitment: "recent" },
    //       });
    //   };
    //   const { marketA, godA, godUsdc, usdc } = await initMarket(
    //     provider,
    //     optionMarket.key,
    //     program.programId,
    //     marketLoader
    //   );
    //   marketProxy = marketA;
    //   usdcAccount = godUsdc;
    //   tokenAccount = godA;

    //   usdcClient = new Token(
    //     provider.connection,
    //     usdc,
    //     TOKEN_PROGRAM_ID,
    //     (provider.wallet as anchor.Wallet).payer
    //   );

    //   const referral = await usdcClient.createAccount(REFERRAL_AUTHORITY);
    //   assert.ok(true);
    // });

    it("Initializes new Serum market for OptionMarket", async () => {
      try {
        const textEncoder = new TextEncoder();
        const [serumMarketKey, _serumMarketBump] =
          await PublicKey.findProgramAddress(
            [optionMarket.key.toBuffer(), textEncoder.encode("serumMarket")],
            DEX_PID
          );
        const [requestQueue, _requestQueueBump] =
          await PublicKey.findProgramAddress(
            [optionMarket.key.toBuffer(), textEncoder.encode("requestQueue")],
            DEX_PID
          );
        const [coinVault, _coinVaultBump] = await PublicKey.findProgramAddress(
          [optionMarket.key.toBuffer(), textEncoder.encode("coinVault")],
          DEX_PID
        );
        const [pcVault, _pcVaultBump] = await PublicKey.findProgramAddress(
          [optionMarket.key.toBuffer(), textEncoder.encode("pcVault")],
          DEX_PID
        );
        const [vaultOwner, vaultSignerNonce] = await getVaultOwnerAndNonce(
          serumMarketKey,
          DEX_PID
        );
        await program.rpc.initSerumMarket(
          new anchor.BN(MARKET_STATE_LAYOUT_V3.span),
          vaultSignerNonce,
          {
            accounts: {
              userAuthority: (provider.wallet as anchor.Wallet).payer.publicKey,
              optionMarket: optionMarket.key,
              serumMarket: serumMarketKey,
              dexProgram: DEX_PID,
              usdcMint: usdcMint.publicKey,
              optionMint: optionMarket.optionMint,
              requestQueue,
              eventQueue: eventQueue.publicKey,
              bids: bids.publicKey,
              asks: asks.publicKey,
              coinVault,
              pcVault,
              vaultSigner: vaultOwner,
              rent: SYSVAR_RENT_PUBKEY,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            },
            signers: [(provider.wallet as anchor.Wallet).payer],
          }
        );
      } catch (err) {
        console.error(err.toString());
        throw err;
      }
      // Test that a Serum market is created with the proper authority
      const accounts = await provider.connection.getProgramAccounts(DEX_PID, {
        filters: [
          {
            memcmp: {
              /** offset into program account data to start comparison */
              offset: MARKET_STATE_LAYOUT_V3.offsetOf("authority"),
              /** data to match, as base-58 encoded string and limited to less than 129 bytes */
              bytes: optionMarket.key.toBase58(),
            },
          },
        ],
      });
      assert.equal(accounts.length, 1);
    });
  });
});
