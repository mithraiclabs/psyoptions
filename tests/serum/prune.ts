/**
 * Test that the permissioned OptionMarket and only the permissioned OptionMarket can prune the
 * order book.
 */
import { assert, expect } from "chai";
import * as anchor from "@project-serum/anchor";
import * as serumCmn from "@project-serum/common";
import { initOptionMarket, initSetup, wait } from "../../utils/helpers";
import { OptionMarketV2 } from "../../packages/psyoptions-ts/src/types";
import {
  DEX_PID,
  getMarketAndAuthorityInfo,
  initMarket,
  marketLoader,
  openOrdersSeed,
} from "../../utils/serum";
import { MarketProxy, OpenOrders } from "@project-serum/serum";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { FEE_OWNER_KEY } from "../../packages/psyoptions-ts/src/fees";
import { Program } from "@project-serum/anchor";
import { PsyAmerican } from "../../target/types/psy_american";

describe("Serum Prune", () => {
  const program = anchor.workspace.PsyAmerican as Program<PsyAmerican>;
  const provider = program.provider;

  const wallet = provider.wallet as anchor.Wallet;
  const mintAuthority = anchor.web3.Keypair.generate();
  let underlyingToken: Token, usdcToken: Token, optionToken: Token;
  // Global PsyOptions variables
  let optionMarket: OptionMarketV2;
  // Global DEX variables
  let marketProxy: MarketProxy,
    optionAccount: anchor.web3.Keypair,
    marketAuthority: anchor.web3.PublicKey,
    marketAuthorityBump: number,
    usdcMint: anchor.web3.PublicKey,
    usdcAccount: anchor.web3.PublicKey,
    referral: anchor.web3.PublicKey,
    openOrdersKey: anchor.web3.PublicKey,
    openOrdersOwner: anchor.web3.PublicKey,
    openOrdersBump: number;
  describe("option market is not expired", () => {
    before(async () => {
      // create PsyOptions OptionMarket
      const {
        optionMarket: newOptionMarket,
        remainingAccounts,
        instructions,
      } = await initSetup(provider, wallet.payer, mintAuthority, program);
      optionMarket = newOptionMarket;
      await initOptionMarket(
        program,
        wallet.payer,
        optionMarket,
        remainingAccounts,
        instructions
      );
      [usdcMint, usdcAccount] = await serumCmn.createMintAndVault(
        provider,
        new anchor.BN("1000000000000000000"),
        undefined,
        6
      );
      // Initialize a permissioned Serum Market
      ({ marketAuthority, marketAuthorityBump } =
        await getMarketAndAuthorityInfo(
          program,
          optionMarket,
          DEX_PID,
          usdcMint
        ));
      ({ marketA: marketProxy } = await initMarket(
        provider,
        program,
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
      // Create an OpenOrders account for a user
      openOrdersOwner = program.provider.wallet.publicKey;
      [openOrdersKey, openOrdersBump] =
        await anchor.web3.PublicKey.findProgramAddress(
          [
            openOrdersSeed,
            DEX_PID.toBuffer(),
            marketProxy.market.address.toBuffer(),
            openOrdersOwner.toBuffer(),
          ],
          program.programId
        );
      const dummy = new anchor.web3.Keypair();
      const tx = new anchor.web3.Transaction();
      tx.add(
        await marketProxy.instruction.initOpenOrders(
          openOrdersOwner,
          marketProxy.market.address,
          dummy.publicKey,
          dummy.publicKey
        )
      );
      await provider.send(tx);
      // place a bunch of bids on the order book
      const tx2 = new anchor.web3.Transaction();
      tx2.add(
        marketProxy.instruction.newOrderV3({
          owner: program.provider.wallet.publicKey,
          payer: usdcAccount,
          side: "buy",
          price: 1,
          size: 1,
          orderType: "postOnly",
          clientId: new anchor.BN(999),
          openOrdersAddressKey: openOrdersKey,
          selfTradeBehavior: "abortTransaction",
        })
      );
      tx2.add(
        marketProxy.instruction.newOrderV3({
          owner: program.provider.wallet.publicKey,
          payer: usdcAccount,
          side: "buy",
          price: 2,
          size: 1,
          orderType: "postOnly",
          clientId: new anchor.BN(1000),
          openOrdersAddressKey: openOrdersKey,
          selfTradeBehavior: "abortTransaction",
        })
      );
      tx2.add(
        marketProxy.instruction.newOrderV3({
          owner: program.provider.wallet.publicKey,
          payer: usdcAccount,
          side: "buy",
          price: 3,
          size: 1,
          orderType: "postOnly",
          clientId: new anchor.BN(1001),
          openOrdersAddressKey: openOrdersKey,
          selfTradeBehavior: "abortTransaction",
        })
      );
      await provider.send(tx2);
    });
    it("should error trying to prune", async () => {
      let openOrders = OpenOrders.load(
        provider.connection,
        openOrdersKey,
        DEX_PID
      );
      let orders = (await openOrders).orders;
      assert.equal(orders.filter((id) => !id.isZero()).length, 3);

      let bids = await marketProxy.market.loadBids(provider.connection);
      let l2 = await bids.getL2(3);
      const expectedBids = [
        [3, 1],
        [2, 1],
        [1, 1],
      ];
      l2.forEach((bid, index) => {
        expect(bid.slice(0, 2)).eql(expectedBids[index]);
      });

      const tx = new anchor.web3.Transaction();
      tx.add(
        await marketProxy.instruction.prune(openOrdersKey, marketAuthority)
      );
      try {
        await provider.send(tx);
        assert.ok(false);
      } catch (err) {
        // const errMsg = "Cannot prune the market while it's still active";
        const errMsg =
          "Error: failed to send transaction: Transaction simulation failed: Error processing Instruction 0: custom program error: 0x146";
        assert.equal((err as AnchorError).error.errorMessage, errMsg);
      }

      // Assert that the order book has not changed
      bids = await marketProxy.market.loadBids(provider.connection);
      l2 = await bids.getL2(3);
      assert.equal(l2.length, 3);
    });
  });

  describe("option market is expired", () => {
    before(async () => {
      // create PsyOptions OptionMarket
      const {
        optionMarket: newOptionMarket,
        remainingAccounts,
        instructions,
      } = await initSetup(provider, wallet.payer, mintAuthority, program, {
        expiration: new anchor.BN(new Date().getTime() / 1000 + 1),
      });
      optionMarket = newOptionMarket;
      await initOptionMarket(
        program,
        wallet.payer,
        optionMarket,
        remainingAccounts,
        instructions
      );
      [usdcMint, usdcAccount] = await serumCmn.createMintAndVault(
        provider,
        new anchor.BN("1000000000000000000"),
        undefined,
        6
      );
      // Initialize a permissioned Serum Market
      ({ marketAuthority, marketAuthorityBump } =
        await getMarketAndAuthorityInfo(
          program,
          optionMarket,
          DEX_PID,
          usdcMint
        ));
      ({ marketA: marketProxy } = await initMarket(
        provider,
        program,
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
      // Create an OpenOrders account for a user
      openOrdersOwner = program.provider.wallet.publicKey;
      [openOrdersKey, openOrdersBump] =
        await anchor.web3.PublicKey.findProgramAddress(
          [
            openOrdersSeed,
            DEX_PID.toBuffer(),
            marketProxy.market.address.toBuffer(),
            openOrdersOwner.toBuffer(),
          ],
          program.programId
        );
      const dummy = new anchor.web3.Keypair();
      const tx = new anchor.web3.Transaction();
      tx.add(
        await marketProxy.instruction.initOpenOrders(
          openOrdersOwner,
          marketProxy.market.address,
          dummy.publicKey,
          dummy.publicKey
        )
      );
      await provider.send(tx);
      // place a bunch of bids on the order book
      const tx2 = new anchor.web3.Transaction();
      tx2.add(
        marketProxy.instruction.newOrderV3({
          owner: program.provider.wallet.publicKey,
          payer: usdcAccount,
          side: "buy",
          price: 1,
          size: 1,
          orderType: "postOnly",
          clientId: new anchor.BN(999),
          openOrdersAddressKey: openOrdersKey,
          selfTradeBehavior: "abortTransaction",
        })
      );
      tx2.add(
        marketProxy.instruction.newOrderV3({
          owner: program.provider.wallet.publicKey,
          payer: usdcAccount,
          side: "buy",
          price: 2,
          size: 1,
          orderType: "postOnly",
          clientId: new anchor.BN(1000),
          openOrdersAddressKey: openOrdersKey,
          selfTradeBehavior: "abortTransaction",
        })
      );
      tx2.add(
        marketProxy.instruction.newOrderV3({
          owner: program.provider.wallet.publicKey,
          payer: usdcAccount,
          side: "buy",
          price: 3,
          size: 1,
          orderType: "postOnly",
          clientId: new anchor.BN(1001),
          openOrdersAddressKey: openOrdersKey,
          selfTradeBehavior: "abortTransaction",
        })
      );
      await provider.send(tx2);
      // Make sure the option market is expired
      wait(1_000);
    });
    it("should prune the market", async () => {
      let openOrders = OpenOrders.load(
        provider.connection,
        openOrdersKey,
        DEX_PID
      );
      let orders = (await openOrders).orders;
      assert.equal(orders.filter((id) => !id.isZero()).length, 3);

      let bids = await marketProxy.market.loadBids(provider.connection);
      let l2 = await bids.getL2(3);
      const expectedBids = [
        [3, 1],
        [2, 1],
        [1, 1],
      ];
      l2.forEach((bid, index) => {
        expect(bid.slice(0, 2)).eql(expectedBids[index]);
      });

      const tx = new anchor.web3.Transaction();
      tx.add(
        await marketProxy.instruction.prune(openOrdersKey, marketAuthority)
      );
      try {
        await provider.send(tx);
      } catch (err) {
        console.log((err as AnchorError).error.errorMessage);
      }

      // Assert that the order book has not changed
      bids = await marketProxy.market.loadBids(provider.connection);
      l2 = await bids.getL2(3);
      assert.equal(l2.length, 0);
    });
  });
});
