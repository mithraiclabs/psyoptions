import * as anchor from "@project-serum/anchor";
import assert from "assert";
import { AccountInfo, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  createMintAndVault,
  DEX_PID,
  getMarketAndAuthorityInfo,
  initMarket,
  marketLoader,
  openOrdersSeed,
} from "../../utils/serum";
import { OptionMarketV2 } from "../../packages/psyoptions-ts/src/types";
import { createMinter, initOptionMarket, initSetup } from "../../utils/helpers";
import { MarketProxy, OpenOrders } from "@project-serum/serum";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { FEE_OWNER_KEY } from "../../packages/psyoptions-ts/src/fees";
import { mintOptionsTx } from "../../packages/psyoptions-ts/src";
import { PsyAmerican } from "../../target/types/psy_american";
import { Program } from "@project-serum/anchor";

describe("proxyTests", () => {
  const program = anchor.workspace.PsyAmerican as Program<PsyAmerican>;
  const provider = program.provider;
  // @ts-ignore: TODO: Remove when anchor PR released
  const wallet = provider.wallet as anchor.Wallet;
  let underlyingToken: Token, usdcToken: Token, optionToken: Token;

  // Global DEX accounts and clients shared across all tests.
  let marketProxy: MarketProxy,
    optionAccount: Keypair,
    usdcMint: PublicKey,
    usdcAccount: PublicKey,
    referral: PublicKey;
  let openOrdersKey: PublicKey,
    openOrdersBump: number,
    marketAuthority: anchor.web3.PublicKey,
    marketAuthorityBump: number,
    openOrdersInitAuthority,
    openOrdersBumpinit;
  let usdcPosted: anchor.BN;
  let referralTokenAddress;
  // Global PsyOptions accounts
  let optionMarket: OptionMarketV2;
  const mintAuthority = anchor.web3.Keypair.generate();
  before(async () => {
    // Set up and initialize a new OptionMarket
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
    [usdcMint, usdcAccount] = await createMintAndVault(
      provider,
      new anchor.BN("1000000000000000000"),
      undefined,
      6
    );
    ({ marketAuthority, marketAuthorityBump } = await getMarketAndAuthorityInfo(
      program,
      optionMarket,
      DEX_PID,
      usdcMint
    ));
    ({ marketA: marketProxy, marketAuthorityBump } = await initMarket(
      provider,
      program,
      marketLoader(provider, program, optionMarket.key, marketAuthorityBump),
      optionMarket,
      usdcMint
    ));
    [openOrdersKey, openOrdersBump] = await PublicKey.findProgramAddress(
      [
        openOrdersSeed,
        DEX_PID.toBuffer(),
        marketProxy.market.address.toBuffer(),
        wallet.publicKey.toBuffer(),
      ],
      program.programId
    );
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
    // create minter and mint options to them
    let underlyingAccount: Keypair, writerTokenAccount: Keypair;
    ({ optionAccount, underlyingAccount, writerTokenAccount } =
      await createMinter(
        provider.connection,
        wallet.payer,
        mintAuthority,
        underlyingToken,
        optionMarket.underlyingAmountPerContract.muln(100).toNumber(),
        optionMarket.optionMint,
        optionMarket.writerTokenMint,
        usdcToken
      ));

    await mintOptionsTx(
      program,
      wallet.payer,
      optionAccount,
      writerTokenAccount,
      underlyingAccount,
      new anchor.BN(25),
      optionMarket
    );
  });

  before(() => {});
  it("Creates an open orders account", async () => {
    const tx = new Transaction();
    const dummy = new Keypair();
    const owner = wallet.publicKey;

    const ix = await marketProxy.instruction.initOpenOrders(
      owner,
      marketProxy.market.address,
      dummy.publicKey,
      dummy.publicKey
    );
    tx.add(ix);
    await provider.sendAndConfirm!(tx);

    const account = (await provider.connection.getAccountInfo(
      openOrdersKey
    )) as AccountInfo<Buffer>;
    assert.ok(account.owner.toString() === DEX_PID.toString());

    const decoded = OpenOrders.getLayout(DEX_PID).decode(account.data);
    const openOrders = new OpenOrders(openOrdersKey, decoded, DEX_PID);
    assert.equal(openOrders.owner.toString(), openOrdersKey.toString());
  });

  it("Posts a bid on the orderbook", async () => {
    const size = 1;
    const price = 1;
    usdcPosted = new anchor.BN(
      // @ts-ignore
      marketProxy.market._decoded.quoteLotSize.toNumber()
    ).mul(
      marketProxy.market
        .baseSizeNumberToLots(size)
        .mul(marketProxy.market.priceNumberToLots(price))
    );
    let openOrders = OpenOrders.load(
      provider.connection,
      openOrdersKey,
      DEX_PID
    );
    let orders = (await openOrders).orders;
    assert.equal(orders.filter((id) => !id.isZero()).length, 0);

    let bids = await marketProxy.market.loadBids(provider.connection);
    let l2 = await bids.getL2(2);
    assert.equal(l2.length, 0);

    const tx = new Transaction();
    tx.add(
      marketProxy.instruction.newOrderV3({
        owner: wallet.publicKey,
        payer: usdcAccount,
        side: "buy",
        price,
        size,
        orderType: "postOnly",
        clientId: new anchor.BN(999),
        openOrdersAddressKey: openOrdersKey,
        selfTradeBehavior: "abortTransaction",
      })
    );
    await provider.sendAndConfirm!(tx);

    // Validate that the new order is in the open orders
    openOrders = OpenOrders.load(provider.connection, openOrdersKey, DEX_PID);
    orders = (await openOrders).orders;
    assert.equal(orders.filter((id) => !id.isZero()).length, 1);

    // Validate that the new order is on the market's orderbook
    bids = await marketProxy.market.loadBids(provider.connection);
    const [p, s] = await bids.getL2(2)[0];
    assert.equal(price, p);
    assert.equal(size, s);
  });

  it("Cancels a bid on the orderbook", async () => {
    // Given.
    const beforeOoAccount = await OpenOrders.load(
      provider.connection,
      openOrdersKey,
      DEX_PID
    );

    // When.
    const tx = new Transaction();
    tx.add(
      await marketProxy.instruction.cancelOrderByClientId(
        wallet.publicKey,
        openOrdersKey,
        new anchor.BN(999)
      )
    );
    await provider.sendAndConfirm!(tx);

    // Then.
    const afterOoAccount = await OpenOrders.load(
      provider.connection,
      openOrdersKey,
      DEX_PID
    );
    assert.ok(beforeOoAccount.quoteTokenFree.eq(new anchor.BN(0)));
    assert.ok(beforeOoAccount.quoteTokenTotal.eq(usdcPosted));
    assert.ok(afterOoAccount.quoteTokenFree.eq(usdcPosted));
    assert.ok(afterOoAccount.quoteTokenTotal.eq(usdcPosted));

    let bids = await marketProxy.market.loadBids(provider.connection);
    let l2 = await bids.getL2(2);
    assert.equal(l2.length, 0);
  });

  // Need to crank the cancel so that we can close later.
  it("Cranks the cancel transaction", async () => {
    // TODO: can do this in a single transaction if we covert the pubkey bytes
    //       into a [u64; 4] array and sort. I'm lazy though.
    let eq = await marketProxy.market.loadEventQueue(provider.connection);
    while (eq.length > 0) {
      const tx = new Transaction();
      tx.add(
        marketProxy.market.makeConsumeEventsInstruction([eq[0].openOrders], 1)
      );
      await provider.sendAndConfirm!(tx);
      eq = await marketProxy.market.loadEventQueue(provider.connection);
    }
  });

  it("Settles funds on the orderbook", async () => {
    // Given.
    const beforeUsdcTokenAcct = await usdcToken.getAccountInfo(usdcAccount);

    // When.
    const tx = new Transaction();
    tx.add(
      await marketProxy.instruction.settleFunds(
        openOrdersKey,
        wallet.publicKey,
        optionAccount.publicKey,
        usdcAccount,
        referral
      )
    );
    await provider.sendAndConfirm!(tx);

    // Then.
    const afterUSdcTokenAcct = await usdcToken.getAccountInfo(usdcAccount);
    assert.ok(
      afterUSdcTokenAcct.amount.sub(beforeUsdcTokenAcct.amount).toNumber() ===
        usdcPosted.toNumber()
    );
  });

  it("Closes an open orders account", async () => {
    // Given.
    const beforeAccount = await program.provider.connection.getAccountInfo(
      wallet.publicKey
    );

    // When.
    const tx = new Transaction();
    tx.add(
      marketProxy.instruction.closeOpenOrders(
        openOrdersKey,
        wallet.publicKey,
        wallet.publicKey
      )
    );
    await provider.sendAndConfirm!(tx);

    // Then.
    const afterAccount = await program.provider.connection.getAccountInfo(
      wallet.publicKey
    );
    const closedAccount = await program.provider.connection.getAccountInfo(
      openOrdersKey
    );
    assert.ok(
      23352768 ===
        (afterAccount?.lamports || 0) - (beforeAccount?.lamports || 0)
    );
    assert.ok(closedAccount === null);
  });
});
