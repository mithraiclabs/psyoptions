use solana_program::pubkey::Pubkey;

#[derive(Clone, Debug, PartialEq)]
/// Data structure that contains all the information needed to maintain an open
/// option market.
pub struct OptionMarket {
    /// The SPL Token Address that is held in the program's pool when a contract is written
    pub underlying_asset_address: Pubkey,
    /// The SPL Token Address that denominates the strike price
    pub quote_asset_address: Pubkey,
    /// The amount of the **underlying asset** that derives a single contract
    pub amount_per_contract: u64,
    /// The Unix timestamp at which the contracts in this market expire
    pub expiration_unix_timestamp: i64,
    /// The limit on the number of total contracts that can be in circulation
    pub contract_supply_limit: u64,
    /// Program Derived Address for the liquidity pool that contains the underlying assset
    pub asset_pool_address: Pubkey,
}


#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        assert_eq!(2 + 2, 4);
    }
}