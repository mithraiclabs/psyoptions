
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, TokenAccount, Transfer};
use anchor_spl::dex::serum_dex;
use anchor_spl::dex::serum_dex::{instruction::SelfTradeBehavior as SerumSelfTradeBehavior, matching::{OrderType as SerumOrderType, Side as SerumSide}};
use psy_american::cpi::accounts::{InitializeMarket, ExerciseOption, MintOption};
use psy_american::OptionMarket;
use std::num::NonZeroU64;
use solana_program::msg;

declare_id!("Fk8QcXcNpf5chR5RcviUjgaLVtULgvovGXUXGPMwLioF");

// The external types do not implement the BorshSerialize and BorshDeserialize that is required by Anchor. 
// Below we create new types that can be cast into the original Serum types
#[derive(Debug, AnchorSerialize, AnchorDeserialize)]
pub enum SelfTradeBehavior {
    DecrementTake = 0,
    CancelProvide = 1,
    AbortTransaction = 2,
}
impl From<SelfTradeBehavior> for SerumSelfTradeBehavior {
    fn from(self_trade_behave: SelfTradeBehavior) -> SerumSelfTradeBehavior {
        match self_trade_behave {
            SelfTradeBehavior::DecrementTake => SerumSelfTradeBehavior::DecrementTake,
            SelfTradeBehavior::CancelProvide => SerumSelfTradeBehavior::CancelProvide,
            SelfTradeBehavior::AbortTransaction => SerumSelfTradeBehavior::AbortTransaction,
        }
    }
}

#[derive(Debug, AnchorSerialize, AnchorDeserialize)]
pub enum OrderType {
    Limit = 0,
    ImmediateOrCancel = 1,
    PostOnly = 2,
}
impl From<OrderType> for SerumOrderType {
    fn from(order_type: OrderType) -> SerumOrderType {
        match order_type {
            OrderType::Limit => SerumOrderType::Limit,
            OrderType::ImmediateOrCancel => SerumOrderType::ImmediateOrCancel,
            OrderType::PostOnly => SerumOrderType::PostOnly,
        }
    }
}

#[derive(Debug, AnchorSerialize, AnchorDeserialize)]
pub enum NewSide {
    Bid,
    Ask,
}

impl From<NewSide> for SerumSide {
    fn from(side: NewSide) -> SerumSide {
        match side {
            NewSide::Bid => SerumSide::Bid,
            NewSide::Ask => SerumSide::Ask,
        }
    }
}

#[program]
pub mod cpi_examples {    
    use super::*;

    pub fn initialize_option_market<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, InitOptionMarket<'info>>,
        underlying_amount_per_contract: u64,
        quote_amount_per_contract: u64,
        expiration_unix_timestamp: i64,
        bump_seed: u8
    ) -> ProgramResult {
        let cpi_program = ctx.accounts.psy_american_program.clone();

        let cpi_accounts = InitializeMarket {
            authority: ctx.accounts.user.to_account_info().clone(),
            // The Mint of the underlying asset for the contracts. Also the mint that is in the vault.
            underlying_asset_mint: ctx.accounts.underlying_asset_mint.to_account_info().clone(),
            quote_asset_mint: ctx.accounts.quote_asset_mint.to_account_info().clone(),
            // The mint of the option
            option_mint: ctx.accounts.option_mint.to_account_info().clone(),
            // The Mint of the writer token for the OptionMarket
            writer_token_mint: ctx.accounts.writer_token_mint.to_account_info().clone(),
            quote_asset_pool: ctx.accounts.quote_asset_pool.to_account_info().clone(),
            // The underlying asset pool for the OptionMarket
            underlying_asset_pool: ctx.accounts.underlying_asset_pool.to_account_info().clone(),
            // The PsyOptions OptionMarket to mint from
            option_market: ctx.accounts.option_market.to_account_info().clone(),
            // The fee_owner that is a constant in the PsyAmerican contract
            fee_owner: ctx.accounts.fee_owner.to_account_info().clone(),
            // The rest are self explanatory, we can't spell everything out for you ;)
            token_program: ctx.accounts.token_program.to_account_info().clone(),
            rent: ctx.accounts.rent.to_account_info().clone(),
            system_program: ctx.accounts.system_program.to_account_info().clone(),
        };

        // msg!("cpi_accounts {:?}", cpi_accounts);
        let mut account_infos = vec![
            ctx.accounts.user.to_account_info().clone(),
            ctx.accounts.underlying_asset_mint.to_account_info().clone(),
            ctx.accounts.quote_asset_mint.to_account_info().clone(),
            ctx.accounts.option_mint.to_account_info().clone(),
            ctx.accounts.writer_token_mint.to_account_info().clone(),
            ctx.accounts.quote_asset_pool.to_account_info().clone(),
            ctx.accounts.underlying_asset_pool.to_account_info().clone(),
            ctx.accounts.option_market.to_account_info().clone(),
            ctx.accounts.fee_owner.to_account_info().clone(),
            ctx.accounts.token_program.to_account_info().clone(),
            ctx.accounts.rent.to_account_info().clone(),
            ctx.accounts.system_program.to_account_info().clone(),
        ];
        for remaining_account in ctx.remaining_accounts {
            account_infos.push(remaining_account.clone());
        }
        let mut cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        cpi_ctx.remaining_accounts = ctx.remaining_accounts.to_vec();

        psy_american::cpi::initialize_market(cpi_ctx, underlying_amount_per_contract, quote_amount_per_contract, expiration_unix_timestamp, bump_seed)
    }

    pub fn initialize(ctx: Context<Initialize>, amount: u64) -> ProgramResult {
        let cpi_accounts = Transfer {
            from: ctx.accounts.option_source.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.authority.clone(),
        };
        let cpi_token_program = ctx.accounts.token_program.clone();
        let cpi_ctx = CpiContext::new(cpi_token_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;
        Ok(())
    }

    pub fn exercise<'a, 'b, 'c, 'info>(ctx: Context<'a, 'b, 'c, 'info, Exercise<'info>>, vault_authority_bump: u8) -> ProgramResult {
        msg!("before CPI");
        let cpi_program = ctx.accounts.psy_american_program.clone();
        let cpi_accounts = ExerciseOption {
            user_authority: ctx.accounts.authority.to_account_info(),
            option_authority: ctx.accounts.vault_authority.to_account_info(),
            option_market: ctx.accounts.option_market.to_account_info(),
            option_mint: ctx.accounts.option_mint.to_account_info(),
            exerciser_option_token_src: ctx.accounts.exerciser_option_token_src.to_account_info(),
            underlying_asset_pool: ctx.accounts.underlying_asset_pool.to_account_info(),
            underlying_asset_dest: ctx.accounts.underlying_asset_dest.to_account_info(),
            quote_asset_pool: ctx.accounts.quote_asset_pool.to_account_info(),
            quote_asset_src: ctx.accounts.quote_asset_src.to_account_info(),
            fee_owner: ctx.accounts.fee_owner.clone(),
            token_program: ctx.accounts.token_program.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        };
        let key = ctx.accounts.option_market.key();

        let seeds = &[
            key.as_ref(),
            b"vaultAuthority",
            &[vault_authority_bump]
        ];
        let signer = &[&seeds[..]];
        let mut cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        cpi_ctx.remaining_accounts = ctx.remaining_accounts.to_vec();
        psy_american::cpi::exercise_option(cpi_ctx, ctx.accounts.exerciser_option_token_src.amount)
    }

    pub fn init_mint_vault(_ctx: Context<InitMintVault>) -> ProgramResult {
        Ok(())
    }

    pub fn mint<'a, 'b, 'c, 'info>(ctx: Context<'a, 'b, 'c, 'info, MintCtx<'info>>, size: u64, vault_authority_bump: u8) -> ProgramResult {
        let cpi_program = ctx.accounts.psy_american_program.clone();
        let cpi_accounts = MintOption {
            // The authority that has control over the underlying assets. In this case it's the 
            // vault authority set in _init_mint_vault_
            user_authority: ctx.accounts.vault_authority.to_account_info(),
            // The Mint of the underlying asset for the contracts. Also the mint that is in the vault.
            underlying_asset_mint: ctx.accounts.underlying_asset_mint.to_account_info(),
            // The underlying asset pool for the OptionMarket
            underlying_asset_pool: ctx.accounts.underlying_asset_pool.to_account_info(),
            // The source account where the underlying assets are coming from. In this case it's the vault.
            underlying_asset_src: ctx.accounts.vault.to_account_info(),
            // The mint of the option
            option_mint: ctx.accounts.option_mint.to_account_info(),
            // The destination for the minted options
            minted_option_dest: ctx.accounts.minted_option_dest.to_account_info(),
            // The Mint of the writer token for the OptionMarket
            writer_token_mint: ctx.accounts.writer_token_mint.to_account_info(),
            // The destination for the minted WriterTokens
            minted_writer_token_dest: ctx.accounts.minted_writer_token_dest.to_account_info(),
            // The PsyOptions OptionMarket to mint from
            option_market: ctx.accounts.option_market.to_account_info(),
            // The fee_owner that is a constant in the PsyAmerican contract
            fee_owner: ctx.accounts.fee_owner.to_account_info(),
            // The rest are self explanatory, we can't spell everything out for you ;)
            token_program: ctx.accounts.token_program.to_account_info(),
        };
        let key = ctx.accounts.underlying_asset_mint.key();

        let seeds = &[
            key.as_ref(),
            b"vaultAuthority",
            &[vault_authority_bump]
        ];
        let signer = &[&seeds[..]];
        let mut cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        cpi_ctx.remaining_accounts = ctx.remaining_accounts.to_vec();
        psy_american::cpi::mint_option(cpi_ctx, size)
    }

    pub fn init_new_order_vault(_ctx: Context<InitNewOrderVault>) -> ProgramResult {
        Ok(())
    }
    pub fn place_order(
        ctx: Context<PlaceOrder>,
        vault_authority_bump: u8,
        open_order_bump: u8,
        open_order_bump_init: u8,
        side: NewSide,
        limit_price: u64,
        max_coin_qty: u64,
        order_type: OrderType,
        client_order_id: u64,
        self_trade_behavior: SelfTradeBehavior,
        limit: u16,
        max_native_pc_qty_including_fees: u64
    ) -> ProgramResult {
        // **optionally** create the open orders program with CPI to PsyOptions
        let cpi_program = ctx.accounts.psy_american_program.clone();
        if ctx.accounts.open_orders.data_is_empty() {
            // NOTE: Not sure if this is the best way to handle this. But the InitAccount::try_accounts
            //  was failing because the vault_authority did not have any SOL. 
            // Send some SOL to the authority
            solana_program::program::invoke(
                &solana_program::system_instruction::transfer(
                    &ctx.accounts.user_authority.key,
                    &ctx.accounts.vault_authority.key,
                    23357760
                ),
            &[
                ctx.accounts.user_authority.to_account_info(),
                ctx.accounts.vault_authority.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            )?;
    //////////////// The following is constructed following the JS client middleware for permissioned markets /////////
            // Basic Serum DEX InitOpenOrders instruction
            let mut ix = serum_dex::instruction::init_open_orders(
                &ctx.accounts.dex_program.key,
                ctx.accounts.open_orders.key,
                ctx.accounts.vault_authority.key,
                ctx.accounts.market.key,
                Some(ctx.accounts.psy_market_authority.key),
            )?;
            ix.program_id = *cpi_program.key;
            // TODO: Wrap the necessary Psy American middleware updates to the instruction. 
            //  Note: only the OpenOrdersPda manipulates this instruction
            // Override the open orders account and market authority.
            ix.accounts[0].pubkey = ctx.accounts.open_orders.key();
            ix.accounts[4].pubkey = ctx.accounts.psy_market_authority.key();
            ix.accounts[4].is_signer = false;
            // Writable because it must pay for the PDA initialization.
            ix.accounts[1].is_writable = true;
            // Prepend to the account list extra accounts needed for PDA initialization.
            ix.accounts.insert(0, ctx.accounts.system_program.to_account_metas(Some(false))[0].clone());
            ix.accounts.insert(0, ctx.accounts.dex_program.to_account_metas(Some(false))[0].clone());
            // Prepend the ix discriminator, bump, and bumpInit to the instruction data,
            // which saves the program compute by avoiding recalculating them in the
            // program.
            ix.data.insert(0, open_order_bump_init);
            ix.data.insert(0, open_order_bump);
            ix.data.insert(0, 0 as u8);
            // PsyOptions Validation discriminator
            ix.data.insert(0, 0 as u8);

            // Handle the insertion of the dex program id one for time for the general proxy IX
            ix.accounts.insert(0, ctx.accounts.dex_program.to_account_metas(Some(false))[0].clone());

            let vault_key = ctx.accounts.vault.key();
            let vault_authority_seeds =  &[
                vault_key.as_ref(),
                b"vaultAuthority",
                &[vault_authority_bump]
            ];
            // send initOpenOrders instruction to PsyOptions
            solana_program::program::invoke_signed(
                &ix,
                &[
                    ctx.accounts.psy_american_program.to_account_info(),
                    ctx.accounts.dex_program.to_account_info(),
                    ctx.accounts.open_orders.to_account_info(),
                    ctx.accounts.vault_authority.to_account_info(),
                    ctx.accounts.market.to_account_info(),
                    ctx.accounts.psy_market_authority.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                    ctx.accounts.rent.to_account_info()
                ],
                &[vault_authority_seeds],
            )?;
        }

//////////////////// TODO place new order CPI ///////////////////////
        // Note: struggled to get BorshSerialize implemented for the external structs (.e.g Side, OrderType, etc)
        //  so passing in the byte data an deserializing was the next best move
        // deserialize the new order data
        let mut new_order_ix = serum_dex::instruction::new_order(
            ctx.accounts.market.key,
            ctx.accounts.open_orders.key,
            ctx.accounts.request_queue.key,
            ctx.accounts.event_queue.key,
            ctx.accounts.market_bids.key,
            ctx.accounts.market_asks.key,
            &ctx.accounts.vault.key(),
            ctx.accounts.vault_authority.key,
            ctx.accounts.coin_vault.key,
            ctx.accounts.pc_vault.key,
            ctx.accounts.token_program.key,
            &ctx.accounts.rent.key(),
            None, // optional Serum discount pubkey?
            ctx.accounts.dex_program.key,
            side.into(),
            NonZeroU64::new(limit_price).unwrap(),
            NonZeroU64::new(max_coin_qty).unwrap(),
            order_type.into(),
            client_order_id,
            self_trade_behavior.into(),
            limit,
            NonZeroU64::new(max_native_pc_qty_including_fees).unwrap()
        )?;
        new_order_ix.program_id = *cpi_program.key;
        // insert data for the OpenOrdersPDA middleware
        new_order_ix.data.insert(0, 1 as u8);
        // insert data for the PsyOptions Validation middleware
        new_order_ix.data.insert(0, 1 as u8);
        // Handle the insertion of the dex program id one for time for the general proxy IX
        new_order_ix.accounts.insert(0, ctx.accounts.dex_program.to_account_metas(Some(false))[0].clone());
        // execute the CPI
        let vault_key = ctx.accounts.vault.key();
        let vault_authority_seeds =  &[
            vault_key.as_ref(),
            b"vaultAuthority",
            &[vault_authority_bump]
        ];
        // send initOpenOrders instruction to PsyOptions
        solana_program::program::invoke_signed(
            &new_order_ix,
            &[
                ctx.accounts.market.to_account_info(),
                ctx.accounts.open_orders.to_account_info(),
                ctx.accounts.request_queue.to_account_info(),
                ctx.accounts.event_queue.to_account_info(),
                ctx.accounts.market_bids.to_account_info(),
                ctx.accounts.market_asks.to_account_info(),
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.vault_authority.to_account_info(),
                ctx.accounts.coin_vault.to_account_info(),
                ctx.accounts.pc_vault.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.rent.to_account_info(),
            ],
            &[vault_authority_seeds],
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitOptionMarket<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    pub psy_american_program: AccountInfo<'info>,
    /////// Init OptionMarket accounts
    pub underlying_asset_mint: Box<Account<'info, Mint>>,
    pub quote_asset_mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub option_mint: AccountInfo<'info>,
    #[account(mut)]
    pub writer_token_mint: AccountInfo<'info>,
    #[account(mut)]
    pub quote_asset_pool: AccountInfo<'info>,
    #[account(mut)]
    pub underlying_asset_pool: AccountInfo<'info>,
    #[account(mut)]
    pub option_market: AccountInfo<'info>,
    pub fee_owner: AccountInfo<'info>,

    pub token_program: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: AccountInfo<'info>,
    pub clock: Sysvar<'info, Clock>,
}


#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut, signer)]
    pub authority: AccountInfo<'info>,
    #[account(mut)]
    pub option_source: Box<Account<'info, TokenAccount>>,
    pub option_mint: AccountInfo<'info>,
    #[account(init,
        seeds = [&option_mint.key().to_bytes()[..], b"vault"],
        bump,
        payer = authority,    
        token::mint = option_mint,
        token::authority = vault_authority,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    pub vault_authority: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
    rent: Sysvar<'info, Rent>,
    system_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct Exercise<'info> {
    #[account(mut, signer)]
    pub authority: AccountInfo<'info>,
    pub psy_american_program: AccountInfo<'info>,
    #[account(mut)]
    pub vault_authority: AccountInfo<'info>,
    // Exercise CPI accounts
    option_market: Box<Account<'info, OptionMarket>>,
    #[account(mut)]
    option_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    exerciser_option_token_src: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    underlying_asset_pool: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    underlying_asset_dest: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    quote_asset_pool: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    quote_asset_src: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    fee_owner: AccountInfo<'info>,

    token_program: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
    clock: Sysvar<'info, Clock>,
}


#[derive(Accounts)]
pub struct InitMintVault<'info> {
    #[account(mut, signer)]
    pub authority: AccountInfo<'info>,
    pub underlying_asset: Box<Account<'info, Mint>>,
    #[account(init,
        seeds = [&underlying_asset.key().to_bytes()[..], b"vault"],
        bump,
        payer = authority,    
        token::mint = underlying_asset,
        token::authority = vault_authority,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    pub vault_authority: AccountInfo<'info>,

    pub token_program: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct MintCtx<'info> {
    #[account(mut, signer)]
    pub authority: AccountInfo<'info>,
    pub psy_american_program: AccountInfo<'info>,
    /// The vault where the underlying assets are held. This is the PsyAmerican 
    /// `underlying_asset_src`
    #[account(mut)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub vault_authority: AccountInfo<'info>,

    /// Mint CPI acounts
    pub underlying_asset_mint: AccountInfo<'info>,
    #[account(mut)]
    pub underlying_asset_pool: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub option_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub minted_option_dest: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub writer_token_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub minted_writer_token_dest: Box<Account<'info, TokenAccount>>,
    pub option_market: Box<Account<'info, OptionMarket>>,
    #[account(mut)]
    pub fee_owner: AccountInfo<'info>,


    pub token_program: AccountInfo<'info>,
    pub clock: Sysvar<'info, Clock>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct InitNewOrderVault<'info> {
    authority: Signer<'info>,
    usdc_mint: Box<Account<'info, Mint>>,
    #[account(init,
        seeds = [&usdc_mint.key().to_bytes()[..], b"vault"],
        bump,
        payer = authority,    
        token::mint = usdc_mint,
        token::authority = vault_authority,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    pub vault_authority: AccountInfo<'info>,

    pub token_program: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct PlaceOrder<'info> {
    /// The user who signed and sent the TX from the client
    user_authority: Signer<'info>,
    /// The PsyOptions American program ID
    psy_american_program: AccountInfo<'info>,
    /// The Serum DEX program ID
    dex_program: AccountInfo<'info>,
    /// The vault's OpenOrders account
    #[account(mut)]
    open_orders: AccountInfo<'info>,
    /// The Serum Market
    #[account(mut)]
    market: AccountInfo<'info>,
    /// The Serum Market market authority
    psy_market_authority: AccountInfo<'info>,
    /// The USDC vault account
    #[account(mut)]
    vault: Box<Account<'info, TokenAccount>>,
    /// The vault authority that also has authority over the OpenOrders account
    #[account(mut)]
    vault_authority: AccountInfo<'info>,

    //// other new_order accounts
    #[account(mut)]
    request_queue: AccountInfo<'info>,
    #[account(mut)]
    event_queue: AccountInfo<'info>,
    #[account(mut)]
    market_bids: AccountInfo<'info>,
    #[account(mut)]
    market_asks: AccountInfo<'info>,
    #[account(mut)]
    coin_vault: AccountInfo<'info>,
    #[account(mut)]
    pc_vault: AccountInfo<'info>,

    system_program: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
}
