use bincode::serialize;
use indicatif::{ProgressBar, ProgressStyle};
use solana_client::{
    client_error::ClientError,
    rpc_client::RpcClient,
    rpc_config::RpcSendTransactionConfig,
    rpc_request::MAX_GET_SIGNATURE_STATUSES_QUERY_ITEMS,
    rpc_response::{RpcContactInfo, RpcLeaderSchedule},
};
use solana_faucet::faucet::request_airdrop_transaction;
use solana_program::{loader_instruction, message::Message, system_instruction};
use solana_sdk::{
    bpf_loader,
    commitment_config::CommitmentConfig,
    instruction::Instruction,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    signers::Signers,
    slot_history::Slot,
    transaction::Transaction,
};
use std::{
    cmp::min,
    collections::HashMap,
    env,
    fs::File,
    io::Read,
    net::{IpAddr, Ipv4Addr, SocketAddr, UdpSocket},
    path::PathBuf,
    thread::sleep,
    time::Duration,
};

const DATA_CHUNK_SIZE: usize = 229;

/// Copy/Pasta'd from `send_and_confirm_transactions_with_spinner` in solana/cli/src/cli.rs
//////////////////////////////////

fn new_spinner_progress_bar() -> ProgressBar {
    let progress_bar = ProgressBar::new(42);
    progress_bar
        .set_style(ProgressStyle::default_spinner().template("{spinner:.green} {wide_msg}"));
    progress_bar.enable_steady_tick(100);
    progress_bar
}

fn get_leader_tpu(
    slot_index: u64,
    leader_schedule: Option<&RpcLeaderSchedule>,
    cluster_nodes: Option<&Vec<RpcContactInfo>>,
) -> Option<SocketAddr> {
    leader_schedule?
        .iter()
        .find(|(_pubkey, slots)| slots.iter().any(|slot| *slot as u64 == slot_index))
        .and_then(|(pubkey, _)| {
            cluster_nodes?
                .iter()
                .find(|contact_info| contact_info.pubkey == *pubkey)
                .and_then(|contact_info| contact_info.tpu)
        })
}

fn send_transaction_tpu(
    send_socket: &UdpSocket,
    tpu_address: &SocketAddr,
    wire_transaction: &[u8],
) {
    if let Err(err) = send_socket.send_to(wire_transaction, tpu_address) {
        println!("Failed to send transaction to {}: {:?}", tpu_address, err);
    }
}

// TODO clean this up since it's copy/pasta'd
pub fn send_and_confirm_transactions_with_spinner<T: Signers>(
    rpc_client: &RpcClient,
    mut transactions: Vec<Transaction>,
    signer_keys: &T,
    commitment: CommitmentConfig,
    mut last_valid_slot: Slot,
) -> Result<(), Box<dyn std::error::Error>> {
    let progress_bar = new_spinner_progress_bar();
    let mut send_retries = 5;
    let mut leader_schedule: Option<RpcLeaderSchedule> = None;
    let mut leader_schedule_epoch = 0;
    let send_socket = UdpSocket::bind("0.0.0.0:0").unwrap();
    let cluster_nodes = rpc_client.get_cluster_nodes().ok();

    loop {
        let mut status_retries = 15;

        progress_bar.set_message("Finding leader node...");
        let epoch_info = rpc_client.get_epoch_info_with_commitment(commitment)?;
        if epoch_info.epoch > leader_schedule_epoch || leader_schedule.is_none() {
            leader_schedule = rpc_client
                .get_leader_schedule_with_commitment(Some(epoch_info.absolute_slot), commitment)?;
            leader_schedule_epoch = epoch_info.epoch;
        }
        let tpu_address = get_leader_tpu(
            min(epoch_info.slot_index + 1, epoch_info.slots_in_epoch),
            leader_schedule.as_ref(),
            cluster_nodes.as_ref(),
        );

        // Send all transactions
        let mut pending_transactions = HashMap::new();
        let num_transactions = transactions.len();
        for transaction in transactions {
            if let Some(tpu_address) = tpu_address {
                let wire_transaction =
                    serialize(&transaction).expect("serialization should succeed");
                send_transaction_tpu(&send_socket, &tpu_address, &wire_transaction);
            } else {
                let _result = rpc_client
                    .send_transaction_with_config(
                        &transaction,
                        RpcSendTransactionConfig {
                            preflight_commitment: Some(commitment.commitment),
                            ..RpcSendTransactionConfig::default()
                        },
                    )
                    .ok();
            }
            pending_transactions.insert(transaction.signatures[0], transaction);

            progress_bar.set_message(&format!(
                "[{}/{}] Total Transactions sent",
                pending_transactions.len(),
                num_transactions
            ));
        }

        // Collect statuses for all the transactions, drop those that are confirmed
        while status_retries > 0 {
            status_retries -= 1;

            progress_bar.set_message(&format!(
                "[{}/{}] Transactions confirmed",
                num_transactions - pending_transactions.len(),
                num_transactions
            ));

            let mut statuses = vec![];
            let pending_signatures = pending_transactions.keys().cloned().collect::<Vec<_>>();
            for pending_signatures_chunk in
                pending_signatures.chunks(MAX_GET_SIGNATURE_STATUSES_QUERY_ITEMS - 1)
            {
                statuses.extend(
                    rpc_client
                        .get_signature_statuses_with_history(pending_signatures_chunk)?
                        .value
                        .into_iter(),
                );
            }
            assert_eq!(statuses.len(), pending_signatures.len());

            for (signature, status) in pending_signatures.into_iter().zip(statuses.into_iter()) {
                if let Some(status) = status {
                    if status.confirmations.is_none() || status.confirmations.unwrap() > 1 {
                        let _ = pending_transactions.remove(&signature);
                    }
                }
                progress_bar.set_message(&format!(
                    "[{}/{}] Transactions confirmed",
                    num_transactions - pending_transactions.len(),
                    num_transactions
                ));
            }

            if pending_transactions.is_empty() {
                return Ok(());
            }

            let slot = rpc_client.get_slot_with_commitment(commitment)?;
            if slot > last_valid_slot {
                break;
            }

            // Retry twice a second
            sleep(Duration::from_millis(500));
        }

        if send_retries == 0 {
            return Err("Transactions failed".into());
        }
        send_retries -= 1;

        // Re-sign any failed transactions with a new blockhash and retry
        let (blockhash, _fee_calculator, new_last_valid_slot) = rpc_client
            .get_recent_blockhash_with_commitment(commitment)?
            .value;
        last_valid_slot = new_last_valid_slot;
        transactions = vec![];
        for (_, mut transaction) in pending_transactions.into_iter() {
            transaction.try_sign(signer_keys, blockhash)?;
            transactions.push(transaction);
        }
    }
}

/////////////////////////////////

fn create_bpf_path(name: &str) -> PathBuf {
    let mut pathbuf = {
        let current_exe = env::current_exe().unwrap();
        PathBuf::from(
            current_exe
                .parent()
                .unwrap()
                .parent()
                .unwrap()
                .parent()
                .unwrap(),
        )
    };
    pathbuf.push("deploy");
    pathbuf.push(name);
    pathbuf.set_extension("so");
    pathbuf
}

fn read_bpf_program(name: &str) -> Vec<u8> {
    let path = create_bpf_path(name);
    let mut file = File::open(&path).unwrap_or_else(|err| {
        panic!("Failed to open {}: {}", path.display(), err);
    });
    let mut elf = Vec::new();
    file.read_to_end(&mut elf).unwrap();

    elf
}

pub fn airdrop_lamports(client: &RpcClient, faucet_addr: &SocketAddr, id: &Keypair, amount: u64) {
    println!("attempt to airdrop to {}", id.pubkey());
    let (blockhash, _) = client.get_recent_blockhash().unwrap();

    if let Ok(transaction) =
        request_airdrop_transaction(&faucet_addr, &id.pubkey(), amount, blockhash)
    {
        client
            .send_and_confirm_transaction_with_spinner_and_commitment(
                &transaction,
                CommitmentConfig::processed(),
            )
            .unwrap();
    }
}

pub fn create_account_with_lamports(client: &RpcClient, lamports: u64) -> Keypair {
    let account = Keypair::new();
    let faucet_addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1)), 9900);
    airdrop_lamports(client, &faucet_addr, &account, lamports);

    account
}

pub fn load_bpf_program(client: &RpcClient, name: &str) -> Pubkey {
    let elf = read_bpf_program(name);
    let data_len = elf.len() * 2;

    let payer_keys = create_account_with_lamports(client, 69000000000);

    // Account that will hold the program
    let account_to_init = Keypair::new();

    let min_balance = client
        .get_minimum_balance_for_rent_exemption(data_len)
        .unwrap();

    let instructions = vec![system_instruction::create_account(
        &payer_keys.pubkey(),
        &account_to_init.pubkey(),
        min_balance,
        data_len as u64,
        &bpf_loader::id(),
    )];

    let initial_message = Message::new(&instructions, Some(&payer_keys.pubkey()));

    let mut messages = vec![&initial_message];

    // must send program data in chunks
    let mut write_messages = vec![];
    for (chunk, i) in elf.chunks(DATA_CHUNK_SIZE).zip(0..) {
        let instruction = loader_instruction::write(
            &account_to_init.pubkey(),
            &bpf_loader::id(),
            (i * DATA_CHUNK_SIZE) as u32,
            chunk.to_vec(),
        );
        let message = Message::new(&[instruction], Some(&payer_keys.pubkey()));
        write_messages.push(message);
    }

    let mut write_message_refs = vec![];
    for message in write_messages.iter() {
        write_message_refs.push(message);
    }

    messages.append(&mut write_message_refs);

    let final_message = Message::new(
        &[loader_instruction::finalize(
            &account_to_init.pubkey(),
            &bpf_loader::id(),
        )],
        Some(&payer_keys.pubkey()),
    );

    messages.push(&final_message);

    println!("Preparing program account {}", account_to_init.pubkey());
    let (blockhash, _, _) = client
        .get_recent_blockhash_with_commitment(CommitmentConfig::processed())
        .unwrap()
        .value;
    let mut initial_transaction = Transaction::new_unsigned(initial_message.clone());
    initial_transaction
        .try_sign(&[&payer_keys, &account_to_init], blockhash)
        .unwrap();
    client
        .send_and_confirm_transaction_with_spinner_and_commitment(
            &initial_transaction,
            CommitmentConfig::processed(),
        )
        .unwrap();

    println!("Writing program data (this may take a while)...");
    let (blockhash, _, last_valid_slot) = client
        .get_recent_blockhash_with_commitment(CommitmentConfig::processed())
        .unwrap()
        .value;
    let mut write_transactions = vec![];
    for message in write_messages.iter() {
        let mut tx = Transaction::new_unsigned(message.clone());
        tx.try_sign(&[&payer_keys, &account_to_init], blockhash)
            .unwrap();
        write_transactions.push(tx);
    }

    send_and_confirm_transactions_with_spinner(
        &client,
        write_transactions,
        &[&payer_keys, &account_to_init],
        CommitmentConfig::processed(),
        last_valid_slot,
    )
    .unwrap();

    println!("Done loading data to account!");

    println!("Finalizing program");
    let (blockhash, _, _) = client
        .get_recent_blockhash_with_commitment(CommitmentConfig::processed())
        .unwrap()
        .value;
    let mut final_tx = Transaction::new_unsigned(final_message.clone());
    final_tx
        .try_sign(&[&payer_keys, &account_to_init], blockhash)
        .unwrap();
    client
        .send_and_confirm_transaction_with_spinner_and_commitment(
            &final_tx,
            CommitmentConfig::processed(),
        )
        .unwrap();
    println!("Loaded program {}", account_to_init.pubkey());

    account_to_init.pubkey()
}

pub fn send_and_confirm_transaction(
    client: &RpcClient,
    instruction: Instruction,
    payer_key: &Pubkey,
    signers: Vec<&Keypair>,
) -> Result<(), ClientError> {
    let message = Message::new(&[instruction], Some(&payer_key));

    let (blockhash, _, _) = client
        .get_recent_blockhash_with_commitment(CommitmentConfig::processed())?
        .value;

    let mut transaction = Transaction::new_unsigned(message.clone());
    transaction.try_sign(&signers, blockhash)?;

    client.send_and_confirm_transaction_with_spinner_and_commitment(
        &transaction,
        CommitmentConfig::processed(),
    )?;
    Ok(())
}
