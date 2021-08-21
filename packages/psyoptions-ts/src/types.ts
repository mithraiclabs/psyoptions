export type SolanaRpcResponse = {
  pubkey: string;
  account: {
    data: string;
    executable: boolean;
    owner: string;
    lamports: string;
  };
};
