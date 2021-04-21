

/// The fee_owner_key will own all of the associated accounts where token fees are paid to.
/// In the future this should be a program derived address owned by a fully decntralized 
/// fee sweeping program.
pub mod fee_owner_key {
  use solana_program::declare_id;
  declare_id!("7XbrrKfaoEbdSXksZ98ST1Wv6gATVAvFGcZEvxhdKAt2");
}
