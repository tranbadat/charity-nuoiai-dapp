import { AnchorProvider, BN, Idl, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { NextResponse } from "next/server";
import idl from "../../../idl/nuoiai.json";

export const runtime = "nodejs";

const PROGRAM_ID = new PublicKey((idl as { address: string }).address);

function parseBn(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return new BN(0);
  }
  if (typeof value === "number") {
    return new BN(value);
  }
  if (typeof value === "string") {
    return new BN(value);
  }
  throw new Error("Invalid number input.");
}

function parseIndex(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new Error("Invalid request index.");
  }
  return numberValue;
}

function getRpcUrl() {
  return process.env.NEXT_PUBLIC_RPC_URL || process.env.RPC_URL || "http://127.0.0.1:8899";
}

function loadKeypair() {
  const raw = process.env.LOCAL_SIGNER_KEYPAIR||"[31,107,186,9,55,171,179,177,44,131,95,248,63,8,22,141,131,46,182,216,159,152,130,107,40,9,99,121,177,31,0,254,226,92,52,207,199,91,103,86,250,34,163,159,212,152,197,181,107,138,232,8,78,208,86,45,12,223,64,77,222,124,43,125]";
  if (!raw) {
    throw new Error("LOCAL_SIGNER_KEYPAIR is not set.");
  }
  let parsed: number[];
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("LOCAL_SIGNER_KEYPAIR must be a JSON array of numbers.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("LOCAL_SIGNER_KEYPAIR must be a JSON array of numbers.");
  }
  return Keypair.fromSecretKey(Uint8Array.from(parsed));
}

function createWallet(keypair: Keypair) {
  return {
    publicKey: keypair.publicKey,
    signTransaction: async (tx: Transaction) => {
      tx.partialSign(keypair);
      return tx;
    },
    signAllTransactions: async (txs: Transaction[]) => {
      txs.forEach((tx) => tx.partialSign(keypair));
      return txs;
    },
  };
}

function campaignPda(creator: PublicKey, campaignId: BN) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("campaign"), creator.toBuffer(), campaignId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  );
}

function vaultPda(campaign: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), campaign.toBuffer()],
    PROGRAM_ID
  );
}

function donationPda(campaign: PublicKey, donor: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("donation"), campaign.toBuffer(), donor.toBuffer()],
    PROGRAM_ID
  );
}

function withdrawPda(campaign: PublicKey, requestIndex: BN) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("withdraw"), campaign.toBuffer(), requestIndex.toArrayLike(Buffer, "le", 4)],
    PROGRAM_ID
  );
}

function votePda(withdrawRequest: PublicKey, voter: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vote"), withdrawRequest.toBuffer(), voter.toBuffer()],
    PROGRAM_ID
  );
}

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_USE_LOCAL_SIGNER !== "true") {
    return NextResponse.json({ error: "Local signer mode is disabled." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const action = String(body?.action || "");

    const connection = new Connection(getRpcUrl(), "confirmed");
    const keypair = loadKeypair();
    const wallet = createWallet(keypair);
    const provider = new AnchorProvider(connection, wallet, AnchorProvider.defaultOptions());
    const program = new Program(idl as Idl, provider);

    if (!action) {
      return NextResponse.json({ error: "Missing action." }, { status: 400 });
    }

    let signature = "";

    switch (action) {
      case "createCampaign": {
        const campaignId = parseBn(body.campaignId);
        const goalLamports = parseBn(body.goalLamports);
        const deadlineTs = parseBn(body.deadlineTs);
        const metadataCid = String(body.metadataCid || "");

        const [campaign] = campaignPda(wallet.publicKey, campaignId);
        const [vault] = vaultPda(campaign);

        signature = await program.methods
          .createCampaign(campaignId, goalLamports, deadlineTs, metadataCid)
          .accounts({
            creator: wallet.publicKey,
            campaign,
            vault,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        break;
      }
      case "donate": {
        const campaign = new PublicKey(String(body.campaign));
        const amount = parseBn(body.amount);

        const [vault] = vaultPda(campaign);
        const [donationRecord] = donationPda(campaign, wallet.publicKey);

        signature = await program.methods
          .donate(amount)
          .accounts({
            donor: wallet.publicKey,
            campaign,
            vault,
            donationRecord,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        break;
      }
      case "requestWithdraw": {
        const campaign = new PublicKey(String(body.campaign));
        const requestIndex = parseBn(body.requestIndex);
        const amount = parseBn(body.amount);
        const evidenceCid = String(body.evidenceCid || "");
        const voteDurationSeconds = parseBn(body.voteDurationSeconds);

        const [vault] = vaultPda(campaign);
        const [withdrawRequest] = withdrawPda(campaign, requestIndex);

        signature = await program.methods
          .requestWithdraw(amount, evidenceCid, voteDurationSeconds)
          .accounts({
            creator: wallet.publicKey,
            campaign,
            vault,
            withdrawRequest,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        break;
      }
      case "voteWithdraw": {
        const campaign = new PublicKey(String(body.campaign));
        const requestIndex = parseBn(body.requestIndex);
        const approve = Boolean(body.approve);

        const [withdrawRequest] = withdrawPda(campaign, requestIndex);
        const [donationRecord] = donationPda(campaign, wallet.publicKey);
        const [voteRecord] = votePda(withdrawRequest, wallet.publicKey);

        signature = await program.methods
          .voteWithdraw(approve)
          .accounts({
            donor: wallet.publicKey,
            campaign,
            withdrawRequest,
            donationRecord,
            voteRecord,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        break;
      }
      case "finalizeWithdraw": {
        const campaign = new PublicKey(String(body.campaign));
        const requestIndex = parseBn(body.requestIndex);
        const [withdrawRequest] = withdrawPda(campaign, requestIndex);

        signature = await program.methods
          .finalizeWithdraw()
          .accounts({
            campaign,
            withdrawRequest,
          })
          .rpc();
        break;
      }
      case "executeWithdraw": {
        const campaign = new PublicKey(String(body.campaign));
        const requestIndex = parseBn(body.requestIndex);

        const [withdrawRequest] = withdrawPda(campaign, requestIndex);
        const [vault] = vaultPda(campaign);

        signature = await program.methods
          .executeWithdraw()
          .accounts({
            creator: wallet.publicKey,
            campaign,
            withdrawRequest,
            vault,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        break;
      }
      case "claimRefund": {
        const campaign = new PublicKey(String(body.campaign));
        const requestIndex = parseIndex(body.requestIndex);

        const [vault] = vaultPda(campaign);
        const [donationRecord] = donationPda(campaign, wallet.publicKey);

        const builder = program.methods.claimRefund().accounts({
          donor: wallet.publicKey,
          campaign,
          vault,
          donationRecord,
          systemProgram: SystemProgram.programId,
        });

        if (requestIndex !== null) {
          const [withdrawRequest] = withdrawPda(campaign, new BN(requestIndex));
          builder.remainingAccounts([
            {
              pubkey: withdrawRequest,
              isSigner: false,
              isWritable: false,
            },
          ]);
        }

        signature = await builder.rpc();
        break;
      }
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    return NextResponse.json({ signature, signer: wallet.publicKey.toBase58() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
