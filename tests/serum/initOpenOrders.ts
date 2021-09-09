import * as anchor from "@project-serum/anchor";
import assert from "assert";
import { AccountInfo, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { DEX_PID, initMarket, marketLoader } from "../../utils/serum";
import { OptionMarketV2 } from "../../packages/psyoptions-ts/src/types";
import {
  initNewTokenMint,
  initOptionMarket,
  initSetup,
} from "../../utils/helpers";
import { MarketProxy } from "@project-serum/serum";

// TODO: create PsyOptions OptionMarket
// TODO: intialize permissioned Serum market

describe("initOpenOrders", () => {
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.PsyAmerican as anchor.Program;
  // Token client.
  let usdcClient;
  let usdcMint: Keypair;

  // Global DEX accounts and clients shared across all tests.
  let marketProxy: MarketProxy, tokenAccount, usdcAccount;
  let openOrders: PublicKey,
    openOrdersBump,
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
    ({ marketA: marketProxy } = await initMarket(
      provider,
      program,
      marketLoader(provider, program),
      optionMarket
    ));
  });

  before(() => {});
  it("Creates an open orders account", async () => {
    const tx = new Transaction();
    const dummyAddress = new Keypair();
    tx.add(
      await marketProxy.instruction.initOpenOrders(
        program.provider.wallet.publicKey,
        marketProxy.market.address,
        marketProxy.market.address, // Dummy. Replaced by middleware.
        marketProxy.market.address // Dummy. Replaced by middleware.
      )
    );
    await provider.send(tx);

    const account = (await provider.connection.getAccountInfo(
      openOrders
    )) as AccountInfo<Buffer>;
    assert.ok(account.owner.toString() === DEX_PID.toString());
  });
});
