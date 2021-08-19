import * as anchor from "@project-serum/anchor";

describe("initialize", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  it('Is initialized!', async () => {
    // Add your test here.
    console.log('** workspace', anchor.workspace)
    const program = anchor.workspace.PsyAmerican;
    console.log('** after set program', program._programId.toString())
    const tx = await program.rpc.initializeMarket();
    console.log("Your transaction signature", tx);
  });
});
