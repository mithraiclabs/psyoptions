import * as anchor from "@project-serum/anchor";
import assert from "assert";
import { AccountInfo, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { DEX_PID } from "../../utils/serum";

describe("initOpenOrders", () => {
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.PsyAmerican as anchor.Program;

  let openOrders: PublicKey,
    openOrdersBump,
    openOrdersInitAuthority,
    openOrdersBumpinit;
  it("Creates an open orders account", async () => {
    const tx = new Transaction();
    const dummyAddress = new Keypair();
    tx.add(
      await program.instruction.initOpenOrders(
        program.provider.wallet.publicKey,
        dummyAddress.publicKey,
        dummyAddress.publicKey, // Dummy. Replaced by middleware.
        dummyAddress.publicKey // Dummy. Replaced by middleware.
      )
    );
    await provider.send(tx);

    const account = (await provider.connection.getAccountInfo(
      openOrders
    )) as AccountInfo<Buffer>;
    assert.ok(account.owner.toString() === DEX_PID.toString());
  });
});
