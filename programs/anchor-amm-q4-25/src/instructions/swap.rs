use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer, Mint, Token, TokenAccount, Transfer,},
};
use constant_product_curve::{ConstantProduct, LiquidityPair};

use crate::{errors::AmmError, state::Config};

#[derive(Accounts)]
pub struct Swap<'info> {
    pub system_program: Program<'info,System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    
    #[account(mut)]
    pub swapper: Signer<'info>,

    pub mint_x: Account<'info, Mint>,
    pub mint_y: Account<'info, Mint>,

    #[account(
        has_one = mint_x,
        has_one = mint_y,
        seeds = [b"config", config.seed.to_le_bytes().as_ref()],
        bump = config.config_bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        associated_token::mint = mint_x,
        associated_token::authority = config,
    )]
    pub vault_x_ata: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint_y,
        associated_token::authority = config,
    )]
    pub vault_y_ata: Account<'info, TokenAccount>,

     #[account(
        mut,
        associated_token::mint = mint_x,
        associated_token::authority = swapper,
    )]
    pub swapper_x_ata: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint_y,
        associated_token::authority = swapper,
    )]
    pub swapper_y_ata: Account<'info, TokenAccount>,
}

impl<'info> Swap<'info> {
    
    pub fn deposit_tokens(&mut self, is_x: bool, amount: u64) -> Result<()> {
        let (from, to) = match is_x {
            true => (
                self.swapper_x_ata.to_account_info(),
                self.vault_x_ata.to_account_info(),
            ),
            false => (
                self.swapper_y_ata.to_account_info(),
                self.vault_y_ata.to_account_info(),
            ),
        };

        
        let cpi_program = self.token_program.to_account_info();

        let cpi_accounts = Transfer {
            from,
            to,
            authority: self.swapper.to_account_info(),
        };

        let ctx = CpiContext::new(cpi_program, cpi_accounts);

        transfer(ctx, amount)
    }

    pub fn withdraw_tokens(&mut self, is_x: bool, amount: u64) -> Result<()> {
         let (from, to) = match is_x {
            true => (
                self.vault_y_ata.to_account_info(),
                self.swapper_y_ata.to_account_info(),
            ),
            false => (
                self.vault_x_ata.to_account_info(),
                self.swapper_x_ata.to_account_info(),
            ),
        };

        let cpi_program = self.token_program.to_account_info();

        let config_seed_bytes:[u8;8] = self.config.seed.to_le_bytes();

        let cpi_signer_seeds: &[&[&[u8]]] = &[&[
            b"config",
            &config_seed_bytes,
            &[self.config.config_bump]
        ]];

        let cpi_accounts = Transfer {
            from,
            to,
            authority: self.config.to_account_info(),
        };

        let ctx = CpiContext::new_with_signer(
            cpi_program,
            cpi_accounts,
            cpi_signer_seeds
        );

        transfer(ctx, amount)

    }

    pub fn swap(&mut self, is_x: bool, amount: u64, min: u64) -> Result<()> {
        require!(self.config.locked == false, AmmError::PoolLocked);
        require!(amount != 0, AmmError::InvalidAmount);

        let x = self.vault_x_ata.amount;
        let y = self.vault_y_ata.amount;

        let delta_y = ConstantProduct::delta_y_from_x_swap_amount(
            x,
            y,
            amount
        );

        let delta_x = ConstantProduct::delta_x_from_y_swap_amount(
            x,
            y,
            amount
        );

        if is_x {

            require!(delta_x.unwrap() >= min, AmmError::SlippageExceeded);

            // Deposit X into vault_x_ata
            self.deposit_tokens(is_x, amount)?;

            // Withdraw Delta Y into swapper_y_ata
            self.withdraw_tokens(is_x, delta_y.unwrap())
        }
        else{

            require!(delta_y.unwrap() >= min, AmmError::SlippageExceeded);

            // Deposit Y into vault_y_ata
            self.deposit_tokens(is_x, amount)?;

            // Withdraw Delta X into swapper_x_ata
            self.withdraw_tokens(is_x, delta_x.unwrap())
        }

    }

}
