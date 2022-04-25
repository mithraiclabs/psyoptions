import * as anchor from "@project-serum/anchor";
import assert from "assert";
import { MARKET_STATE_LAYOUT_V3 } from "@project-serum/serum";
import { Keypair, PublicKey } from "@solana/web3.js";
import { OptionMarketV2 } from "../../packages/psyoptions-ts/src/types";
import {
  initNewTokenMint,
  initOptionMarket,
  initSetup,
} from "../../utils/helpers";
import {
  createFirstSetOfAccounts,
  DEX_PID,
  initSerum,
} from "../../utils/serum";
import { AnchorError, Program } from "@project-serum/anchor";
import { PsyAmerican } from "../../target/types/psy_american";

describe("permissioned-markets", () => {
  // Anchor client setup.
  const payer = anchor.web3.Keypair.generate();
  const program = anchor.workspace.PsyAmerican as Program<PsyAmerican>;
  const provider = program.provider;
  let usdcMint: Keypair;
  // Global PsyOptions accounts
  let optionMarket: OptionMarketV2;
  const mintAuthority = anchor.web3.Keypair.generate();
  before(async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(payer.publicKey, 10_000_000_000),
      "confirmed"
    );
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
      console.log("** optionMarket", optionMarket);
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
          {
            memcmp: {
              /** offset into program account data to start comparison */
              offset: MARKET_STATE_LAYOUT_V3.offsetOf("pruneAuthority"),
              /** data to match, as base-58 encoded string and limited to less than 129 bytes */
              bytes: marketAuthority.toBase58(),
            },
          },
        ],
      });
      assert.equal(accounts.length, 1);
    });
    describe("Coin mint is not the Option mint", () => {
      beforeEach(async () => {
        const { mintAccount } = await initNewTokenMint(
          provider.connection,
          payer.publicKey,
          payer
        );
        optionMarket.optionMint = mintAccount.publicKey;
      });

      it("should error", async () => {
        try {
          await initSerum(
            provider,
            program,
            optionMarket,
            usdcMint.publicKey,
            eventQueue.publicKey,
            bids.publicKey,
            asks.publicKey,
            DEX_PID
          );
          assert.ok(false);
        } catch (err) {
          const errMsg = "Coin mint must match option mint";
          assert.equal((err as AnchorError).error.errorMessage, errMsg);
        }
      });
    });
  });
});
