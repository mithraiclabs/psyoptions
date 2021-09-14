import * as anchor from "@project-serum/anchor";
import assert from "assert";
import { AccountInfo, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  DEX_PID,
  initMarket,
  marketLoader,
  openOrdersSeed,
} from "../../utils/serum";
import { OptionMarketV2 } from "../../packages/psyoptions-ts/src/types";
import {
  initNewTokenMint,
  initOptionMarket,
  initSetup,
} from "../../utils/helpers";
import { MarketProxy, OpenOrders } from "@project-serum/serum";

describe("initOpenOrders", () => {
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.PsyAmerican as anchor.Program;
  // Token client.
  let usdcClient;

  // Global DEX accounts and clients shared across all tests.
  let marketProxy: MarketProxy,
    tokenAccount,
    usdcMint: Keypair,
    usdcAccount: PublicKey;
  let openOrdersKey: PublicKey,
    openOrdersBump: number,
    openOrdersInitAuthority,
    openOrdersBumpinit;
  let usdcPosted;
  let referralTokenAddress;
  // Global PsyOptions accounts
  let optionMarket: OptionMarketV2;
  const mintAuthority = anchor.web3.Keypair.generate();
  before(async () => {
    const { mintAccount } = await initNewTokenMint(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer.publicKey,
      (provider.wallet as anchor.Wallet).payer
    );
    usdcMint = mintAccount;
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
    ({ marketA: marketProxy, godUsdc: usdcAccount } = await initMarket(
      provider,
      program,
      marketLoader(provider, program),
      optionMarket
    ));
  });

  before(() => {});
  it("Creates an open orders account", async () => {
    const tx = new Transaction();
    const dummy = new Keypair();
    const owner = program.provider.wallet.publicKey;
    [openOrdersKey, openOrdersBump] = await PublicKey.findProgramAddress(
      [
        openOrdersSeed,
        DEX_PID.toBuffer(),
        marketProxy.market.address.toBuffer(),
        owner.toBuffer(),
      ],
      program.programId
    );

    const ix = await marketProxy.instruction.initOpenOrders(
      owner,
      marketProxy.market.address,
      dummy.publicKey,
      dummy.publicKey
    );
    tx.add(ix);
    await provider.send(tx);

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
        owner: program.provider.wallet.publicKey,
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
    await provider.send(tx);

    // TODO: Validate that the new order is in the OpenOrders
    openOrders = OpenOrders.load(provider.connection, openOrdersKey, DEX_PID);
    orders = (await openOrders).orders;
    assert.equal(orders.filter((id) => !id.isZero()).length, 1);

    bids = await marketProxy.market.loadBids(provider.connection);
    const [p, s] = await bids.getL2(2)[0];
    assert.equal(price, p);
    assert.equal(size, s);
  });
});
