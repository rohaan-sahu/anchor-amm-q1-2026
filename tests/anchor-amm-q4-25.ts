import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AnchorAmmQ425 } from "../target/types/anchor_amm_q4_25";
import {
  createMint,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import { assert } from "chai";
import { SystemProgram } from "@solana/web3.js";

describe("anchor-amm-q4-25", () => {

  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.anchorAmmQ425 as Program<AnchorAmmQ425>;

  //* The word 'Global/global' here after shall be used to refer to the scope of 'describe' *//

  // Create all that will be needed in the Global-scope (i.e. within the scope of 'describe')
  // Things in the scope of 'before' are not 'Global'
  const initializer = provider.wallet.payer;

  const seed = new anchor.BN("1234");

  // Deriving config address here, as it is to be used globally.
  // and  doesn't require to be created in the 'before' scope with async calls
  const config_seeds = [Buffer.from("config"),seed.toArrayLike(Buffer,"le",8)];
  const [configAddress, _configBump] = anchor.web3.PublicKey.findProgramAddressSync(
      config_seeds,
      program.programId,
  );


  // Deriving "mint_ls == mintLp" address
  // It will be initialized by our 'initialize' call
  const mint_lp_seeds = [Buffer.from("lp"),configAddress.toBuffer()];
  const [mintLpAddress,_mintLpBump] = anchor.web3.PublicKey.findProgramAddressSync(
    mint_lp_seeds,
    program.programId
  );

  // Declaring the Token Mints & ATAs here so that they have Global scope
  // They shall get initialized as they receive their value in the scope of 'before'
  // Using 'let' because, 'const' declarations must be initialized. Didn't know that.
  // SPL Mints
  let mintX: anchor.web3.PublicKey;
  let mintY: anchor.web3.PublicKey;
  let mintLP: anchor.web3.PublicKey;

  // SPL ATAs
  let vaultX: anchor.web3.PublicKey;
  let vaultY: anchor.web3.PublicKey;


  before(async () =>{

    // Airdrop for payer of feer
    await provider.connection.requestAirdrop(
      initializer.publicKey,
      10*(anchor.web3.LAMPORTS_PER_SOL)
    )

    // createMint() returns a publicKey asynchronously AFTER the mint is created.
    // Hence these will be valid account addresses
    mintX = await createMint(
      provider.connection,
      initializer,
      initializer.publicKey,
      null,
      0
    );

    mintY = await createMint(
      provider.connection,
      initializer,
      initializer.publicKey,
      null,
      0
    );

    // This mint "mint_lp == mintLp" is to be derived not created.
    // Will be done in the top part of 'describe' scope, right below 'config's derivation
    // It will be initialized by our program with or after 'init' of 'config'
    // This is a PDA that takes 'confog.key().as_ref()' as a seed
    // mintLP = await createMint(
    //   provider.connection,
    //   initializer,
    //   initializer.publicKey,
    //   null,
    //   0
    // );

    
  })

  // By this point we have the valid address of:
  // 1. System and SPL programs account addresses
  // 2. mintX, mintY, mintLP address from "createMint()"

  it("Is initialized!", async () => {
    // Add your test here.
    
    let fees:number = 100;

    // Deriving the vault addresses with  STILL NOT VALIDATED 'configAddress'
    const vaultXAddressDerived = getAssociatedTokenAddressSync(
      mintX,
      configAddress,
      true,
      program.programId
    );

    const vaultYAddressDerived = getAssociatedTokenAddressSync(
      mintX,
      configAddress,
      true,
      program.programId
    );

    const tx = await program.methods.initialize(seed,fees,null)
      .accountsStrict({
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        initializer: initializer.publicKey,
        mintX: mintX,
        mintY: mintY,
        config: configAddress,
        mintLp: mintLpAddress,
        vaultX: vaultXAddressDerived,
        vaultY: vaultYAddressDerived
      })
      .signers([initializer])
      .rpc();


    // Validity of 'config' will be check only after it has been initallized
    // This could be a problem
    // Verify account exists 
    
    const configAccountInfo = await program.provider.connection.getAccountInfo(configAddress);

    // if "configAccountInfo" is valid . Good news.
    assert.isNotNull(configAccountInfo,"Config account not initialized");
    assert.equal(configAccountInfo.owner.toString(),program.programId.toString(),"Config account's owner is not our program");

    // Validity check for 'mint_lp == mintLp'

    const mintLpAccountInfo = await program.provider.connection.getAccountInfo(mintLpAddress);

    assert.isNotNull(mintLpAccountInfo,"MintLp account not initialized");
    assert.equal(mintLpAccountInfo.owner.toString(),program.programId.toString(),"MintLp account's owner is not our program");

    // Now that we hopefully know the valid onChain address of 'config'
    // We can now go ahead create the vault accounts that use it as 'owner/authority'.
    // Although, I am not sure it is necessasy. But better safe than fail tests.
    const vaultXAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      initializer,
      mintX,
      configAddress,
      true
    );

    const vaultYAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      initializer,
      mintY,
      configAddress
    );

    // getOrCreateAssociatedTokenAccount() returns an 'Account' type, when resolved
    // This ensures that the address is received AFTER the account is created
    // Hence it is valid
    vaultX = vaultXAccount.address;
    vaultY = vaultYAccount.address;

    // By this time the validity of the remaining accounts is confirmed
    // 3. config, vaultX & vaultY address are valid
    // and the test should pass with the console log

    // Just the console logging of transaction signature.
    console.log("Your transaction signature", tx);
  });
});
