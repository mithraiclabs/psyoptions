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
  initSerum,
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
  before(async () => {
    const { mintAccount } = await initNewTokenMint(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer.publicKey,
      (provider.wallet as anchor.Wallet).payer
    );
    usdcMint = mintAccount;
  });
  describe("OptionMarket is initialized", () => {
    let bids: Keypair, asks: Keypair, eventQueue: Keypair;
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

    it("Initializes new Serum market for OptionMarket", async () => {
      const { serumMarketKey, marketAuthority } = await initSerum(
        provider,
        program,
        optionMarket,
        usdcMint.publicKey,
        eventQueue.publicKey,
        bids.publicKey,
        asks.publicKey,
        DEX_PID
      );
      // Test that a Serum market is created with the proper authority
      const accounts = await provider.connection.getProgramAccounts(DEX_PID, {
        filters: [
          {
            memcmp: {
              /** offset into program account data to start comparison */
              offset: MARKET_STATE_LAYOUT_V3.offsetOf("authority"),
              /** data to match, as base-58 encoded string and limited to less than 129 bytes */
              bytes: marketAuthority.toBase58(),
            },
          },
        ],
      });
      assert.equal(accounts.length, 1);
      // Validate the OptionMarket updates with the Serum Market
      const optionMarketAcct = (await program.account.optionMarket.fetch(
        optionMarket.key
      )) as OptionMarketV2;
      assert.equal(
        optionMarketAcct.serumMarket?.toString(),
        serumMarketKey.toString()
      );
    });
  });
});
