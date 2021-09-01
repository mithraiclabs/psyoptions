import * as anchor from "@project-serum/anchor";
import assert from "assert";
import {
  Logger,
  MarketProxyBuilder,
  OpenOrdersPda,
  ReferralFees,
} from "@project-serum/serum";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { OptionMarketV2 } from "../../packages/psyoptions-ts/src/types";
import { initOptionMarket, initSetup } from "../../utils/helpers";
import {
  DEX_PID,
  Identity,
  initMarket,
  REFERRAL_AUTHORITY,
} from "../../utils/serum";

describe("permissioned-markets", () => {
  // Anchor client setup.
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.PsyAmerican as anchor.Program;
  // Token client.
  let usdcClient;

  // Global DEX accounts and clients shared across all tests.
  let marketProxy, tokenAccount, usdcAccount;
  let openOrders, openOrdersBump, openOrdersInitAuthority, openOrdersBumpinit;
  let usdcPosted;
  let referralTokenAddress;
  // Global PsyOptions accounts
  let optionMarket: OptionMarketV2;
  const mintAuthority = anchor.web3.Keypair.generate();
  describe("OptionMarket is initialized", () => {
    before(async () => {
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
    });

    it("Initializes an orderbook", async () => {
      const marketLoader = async (market: PublicKey) => {
        return new MarketProxyBuilder()
          .middleware(
            new OpenOrdersPda({
              proxyProgramId: program.programId,
              dexProgramId: DEX_PID,
            })
          )
          .middleware(new ReferralFees())
          .middleware(new Identity())
          .middleware(new Logger())
          .load({
            connection: provider.connection,
            market,
            dexProgramId: DEX_PID,
            proxyProgramId: program.programId,
            options: { commitment: "recent" },
          });
      };
      const { marketA, godA, godUsdc, usdc } = await initMarket(
        provider,
        optionMarket.key,
        program.programId,
        marketLoader
      );
      marketProxy = marketA;
      usdcAccount = godUsdc;
      tokenAccount = godA;

      usdcClient = new Token(
        provider.connection,
        usdc,
        TOKEN_PROGRAM_ID,
        (provider.wallet as anchor.Wallet).payer
      );

      const referral = await usdcClient.createAccount(REFERRAL_AUTHORITY);
      assert.ok(true);
    });
  });
});
