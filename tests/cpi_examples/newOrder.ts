import * as anchor from "@project-serum/anchor";
import { MarketProxy, OpenOrders } from "@project-serum/serum";
import { MintInfo, Token, TOKEN_PROGRAM_ID, u64 } from "@solana/spl-token";
import * as serumCmn from "@project-serum/common";
import {
  AccountInfo,
  AccountMeta,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import { assert } from "chai";
import { FEE_OWNER_KEY } from "../../packages/psyoptions-ts/src/fees";
import { OptionMarketV2 } from "../../packages/psyoptions-ts/src/types";
import { initOptionMarket, initSetup } from "../../utils/helpers";
import {
  DEX_PID,
  getMarketAndAuthorityInfo,
  initMarket,
  marketLoader,
  openOrdersSeed,
} from "../../utils/serum";
import { Program } from "@project-serum/anchor";
import { CpiExamples } from "../../target/types/cpi_examples";
import { PsyAmerican } from "../../target/types/psy_american";

const Side = {
  Bid: { bid: {} },
  Ask: { ask: {} },
};
const OrderType = {
  Limit: { limit: {} },
  ImmediateOrCancel: { immediateOrCancel: {} },
  PostOnly: { postOnly: {} },
};
const SelfTradeBehavior = {
  DecrementTake: { decremenTtake: {} },
  CancelProvide: { cancelProvide: {} },
  AbortTransaction: { abortTransaction: {} },
};

const textEncoder = new TextEncoder();
describe("cpi_examples newOrder", () => {
  const program = anchor.workspace.CpiExamples as Program<CpiExamples>;
  const provider = program.provider;
  const americanOptionsProgram = anchor.workspace
    .PsyAmerican as Program<PsyAmerican>;

  const wallet = provider.wallet as anchor.Wallet;
  const mintAuthority = anchor.web3.Keypair.generate();
  let underlyingToken: Token, usdcToken: Token, optionToken: Token;
  // Global PsyOptions variables
  let optionMarket: OptionMarketV2;
  // Global DEX variables
  let marketProxy: MarketProxy,
    marketAuthority: anchor.web3.PublicKey,
    marketAuthorityBump: number,
    usdcMint: anchor.web3.PublicKey,
    usdcMintInfo: MintInfo,
    referral: anchor.web3.PublicKey,
    openOrders: PublicKey,
    openOrdersBump: number,
    vault: anchor.web3.PublicKey,
    vaultBumpSeed: number,
    vaultAuthority: anchor.web3.PublicKey,
    vaultAuthBump: number;
  before(async () => {
    // Setup - Create an OptionMarket
    const {
      optionMarket: newOptionMarket,
      remainingAccounts,
      instructions,
    } = await initSetup(
      provider,
      wallet.payer,
      mintAuthority,
      americanOptionsProgram
    );
    optionMarket = newOptionMarket;
    await initOptionMarket(
      americanOptionsProgram,
      wallet.payer,
      optionMarket,
      remainingAccounts,
      instructions
    );
    [usdcMint] = await serumCmn.createMintAndVault(
      provider,
      new anchor.BN("1000000000000000000"),
      undefined,
      6
    );
    // Initialize a permissioned Serum Market
    ({ marketAuthority, marketAuthorityBump } = await getMarketAndAuthorityInfo(
      americanOptionsProgram,
      optionMarket,
      DEX_PID,
      usdcMint
    ));
    // Setup - Create a Serum market for the OptionMarket's option tokens
    ({ marketA: marketProxy } = await initMarket(
      provider,
      americanOptionsProgram,
      marketLoader(provider, program, optionMarket.key, marketAuthorityBump),
      optionMarket,
      usdcMint
    ));
    // Set the token variables for use in later tests
    underlyingToken = new Token(
      provider.connection,
      optionMarket.underlyingAssetMint,
      TOKEN_PROGRAM_ID,
      wallet.payer
    );
    optionToken = new Token(
      provider.connection,
      optionMarket.optionMint,
      TOKEN_PROGRAM_ID,
      wallet.payer
    );
    usdcToken = new Token(
      provider.connection,
      usdcMint,
      TOKEN_PROGRAM_ID,
      wallet.payer
    );
    referral = await usdcToken.createAssociatedTokenAccount(FEE_OWNER_KEY);
  });

  describe("cpi_examples initNewOrderVault", () => {
    it("should create a USDC vault owned by the program", async () => {
      // Generate a PDA for the USDC vault
      [vault, vaultBumpSeed] = await anchor.web3.PublicKey.findProgramAddress(
        [usdcToken.publicKey.toBuffer(), textEncoder.encode("vault")],
        program.programId
      );
      [vaultAuthority, vaultAuthBump] =
        await anchor.web3.PublicKey.findProgramAddress(
          [vault.toBuffer(), textEncoder.encode("vaultAuthority")],
          program.programId
        );
      try {
        await program.rpc.initNewOrderVault({
          accounts: {
            authority: provider.wallet.publicKey,
            usdcMint: usdcMint,
            vault,
            vaultAuthority,
            tokenProgram: TOKEN_PROGRAM_ID,
            rent: SYSVAR_RENT_PUBKEY,
            systemProgram: SystemProgram.programId,
          },
        });
      } catch (err) {
        console.log((err as Error).toString());
        throw err;
      }

      // validate that the vault was initialized and owned by the program
      const vaultAcct = await usdcToken.getAccountInfo(vault);
      assert.ok(vaultAcct.owner.equals(vaultAuthority));
    });
  });

  describe("place newOrder", () => {
    before(async () => {
      // Vault is already initialized because these tests run sequentially
      // transfer USDC to that vault so it can place an order
      usdcMintInfo = await usdcToken.getMintInfo();
      await usdcToken.mintTo(
        vault,
        provider.wallet.publicKey,
        [],
        new u64(10_000_000 * usdcMintInfo.decimals)
      );
      // Get the open orders account that needs to be optionally created
      [openOrders, openOrdersBump] = await PublicKey.findProgramAddress(
        [
          openOrdersSeed,
          marketProxy.dexProgramId.toBuffer(),
          marketProxy.market.address.toBuffer(),
          // NOTE: For other developers, this should be changed to be the User or Vault that has the authority over the account.
          vaultAuthority.toBuffer(),
        ],
        americanOptionsProgram.programId
      );
    });

    it("should create an open orders account and place an order on the Serum market", async () => {
      // test the vault contains USDC
      const vaultAcct = await usdcToken.getAccountInfo(vault);
      assert.equal(
        vaultAcct.amount.toString(),
        new u64(10_000_000 * usdcMintInfo.decimals).toString()
      );
      // test the order book is blank
      let bids = await marketProxy.market.loadBids(provider.connection);
      let l2 = await bids.getL2(3);
      assert.equal(l2.length, 0);

      const price = 1;
      const size = 22;

      // Run placeOrder instruction for vault
      try {
        await program.rpc.placeOrder(
          vaultAuthBump,
          openOrdersBump,
          marketAuthorityBump,
          Side.Bid, // Side
          marketProxy.market.priceNumberToLots(price), // liimit_price
          marketProxy.market.baseSizeNumberToLots(size), // max_coin_qty
          OrderType.PostOnly, // order_type
          new anchor.BN(999), // client_order_id
          SelfTradeBehavior.AbortTransaction, // self_trade_behavior
          new anchor.BN(65535), // limit - no idea what this is
          new anchor.BN(
            // @ts-ignore: serum
            marketProxy.market._decoded.quoteLotSize.toNumber()
          ).mul(
            marketProxy.market
              .baseSizeNumberToLots(size)
              .mul(marketProxy.market.priceNumberToLots(price))
          ), // max_native_pc_qty_including_fees - no idea what exactly this is
          {
            accounts: {
              userAuthority: provider.wallet.publicKey,
              psyAmericanProgram: americanOptionsProgram.programId,
              dexProgram: DEX_PID,
              openOrders,
              market: marketProxy.market.address,
              psyMarketAuthority: marketAuthority,
              vault,
              vaultAuthority,
              // @ts-ignore: Dumb serum stuff
              requestQueue: marketProxy.market._decoded.requestQueue,
              // @ts-ignore: Dumb serum stuff
              eventQueue: marketProxy.market._decoded.eventQueue,
              marketBids: marketProxy.market.bidsAddress,
              marketAsks: marketProxy.market.asksAddress,
              // @ts-ignore: Dumb serum stuff
              coinVault: marketProxy.market._decoded.baseVault,
              // @ts-ignore: Dumb serum stuff
              pcVault: marketProxy.market._decoded.quoteVault,

              systemProgram: SystemProgram.programId,
              tokenProgram: TOKEN_PROGRAM_ID,
              rent: SYSVAR_RENT_PUBKEY,
            },
          }
        );
      } catch (err) {
        console.log("*** error", (err as Error).toString());
        throw err;
      }
      // Test that a new open orders account was created
      const openOrdersAcct = await OpenOrders.load(
        provider.connection,
        openOrders,
        DEX_PID
      );
      assert.ok(openOrdersAcct.owner.equals(openOrders));

      // test that the order book contains the new order.
      bids = await marketProxy.market.loadBids(provider.connection);
      l2 = await bids.getL2(3);
      assert.equal(l2.length, 1);
      assert.equal(l2[0][0], price);
      assert.equal(l2[0][1], size);
    });

    describe("Open orders account exists", () => {
      it("should place the order without fail", async () => {
        // Test that the open orders account already exists
        const openOrdersAcct = await OpenOrders.load(
          provider.connection,
          openOrders,
          DEX_PID
        );
        assert.ok(openOrdersAcct.owner.equals(openOrders));
        // test that the order book contains the new order.
        let bids = await marketProxy.market.loadBids(provider.connection);
        let l2 = await bids.getL2(3);
        assert.equal(l2.length, 1);

        const price = 2;
        const size = 1;

        // Run placeOrder instruction for vault
        try {
          await program.rpc.placeOrder(
            vaultAuthBump,
            openOrdersBump,
            marketAuthorityBump,
            Side.Bid, // Side
            marketProxy.market.priceNumberToLots(price), // liimit_price
            marketProxy.market.baseSizeNumberToLots(size), // max_coin_qty
            OrderType.PostOnly, // order_type
            new anchor.BN(998), // client_order_id
            SelfTradeBehavior.AbortTransaction, // self_trade_behavior
            new anchor.BN(65535), // limit
            new anchor.BN(
              // @ts-ignore: serum
              marketProxy.market._decoded.quoteLotSize.toNumber()
            ).mul(
              marketProxy.market
                .baseSizeNumberToLots(size)
                .mul(marketProxy.market.priceNumberToLots(price))
            ), // max_native_pc_qty_including_fees
            {
              accounts: {
                userAuthority: provider.wallet.publicKey,
                psyAmericanProgram: americanOptionsProgram.programId,
                dexProgram: DEX_PID,
                openOrders,
                market: marketProxy.market.address,
                psyMarketAuthority: marketAuthority,
                vault,
                vaultAuthority,
                // @ts-ignore: Dumb serum stuff
                requestQueue: marketProxy.market._decoded.requestQueue,
                // @ts-ignore: Dumb serum stuff
                eventQueue: marketProxy.market._decoded.eventQueue,
                marketBids: marketProxy.market.bidsAddress,
                marketAsks: marketProxy.market.asksAddress,
                // @ts-ignore: Dumb serum stuff
                coinVault: marketProxy.market._decoded.baseVault,
                // @ts-ignore: Dumb serum stuff
                pcVault: marketProxy.market._decoded.quoteVault,

                systemProgram: SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
                rent: SYSVAR_RENT_PUBKEY,
              },
            }
          );
        } catch (err) {
          console.log("*** error", (err as Error).toString());
          throw err;
        }
        bids = await marketProxy.market.loadBids(provider.connection);
        l2 = await bids.getL2(3);
        assert.equal(l2.length, 2);
      });
    });
  });
});
