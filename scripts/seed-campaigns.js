const anchor = require("@coral-xyz/anchor");
const { Connection, Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");
const idl = require("../idl/nuoiai.json");

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    count: 3,
    start: null,
    goalSol: 1,
    days: 7,
    cidPrefix: "nuoiai",
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === "--count" && next) {
      out.count = Number(next);
      i += 1;
    } else if (arg === "--start" && next) {
      out.start = Number(next);
      i += 1;
    } else if (arg === "--goal" && next) {
      out.goalSol = Number(next);
      i += 1;
    } else if (arg === "--days" && next) {
      out.days = Number(next);
      i += 1;
    } else if (arg === "--cid" && next) {
      out.cidPrefix = String(next);
      i += 1;
    }
  }

  if (!Number.isInteger(out.count) || out.count <= 0) {
    throw new Error("--count must be a positive integer.");
  }
  if (!Number.isFinite(out.goalSol) || out.goalSol <= 0) {
    throw new Error("--goal must be a positive number.");
  }
  if (!Number.isFinite(out.days) || out.days <= 0) {
    throw new Error("--days must be a positive number.");
  }

  return out;
}

function loadKeypair() {
  if (process.env.LOCAL_SIGNER_KEYPAIR) {
    const parsed = JSON.parse(process.env.LOCAL_SIGNER_KEYPAIR);
    if (!Array.isArray(parsed)) {
      throw new Error("LOCAL_SIGNER_KEYPAIR must be a JSON array.");
    }
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  }

  const keypairPath = "/home/user/.config/solana/id.json" || process.env.ANCHOR_WALLET;
  if (!keypairPath) {
    throw new Error("Set LOCAL_SIGNER_KEYPAIR or LOCAL_SIGNER_KEYPAIR_PATH.");
  }

  const resolved = path.resolve(keypairPath);
  const data = JSON.parse(fs.readFileSync(resolved, "utf8"));
  if (!Array.isArray(data)) {
    throw new Error("Keypair file must contain a JSON array.");
  }
  return Keypair.fromSecretKey(Uint8Array.from(data));
}

function campaignPda(programId, creator, campaignId) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("campaign"), creator.toBuffer(), campaignId.toArrayLike(Buffer, "le", 8)],
    programId
  )[0];
}

function vaultPda(programId, campaign) {
  return PublicKey.findProgramAddressSync([Buffer.from("vault"), campaign.toBuffer()], programId)[0];
}

async function main() {
  const options = parseArgs();
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || process.env.RPC_URL || "http://127.0.0.1:8899";
  const keypair = loadKeypair();
  const connection = new Connection(rpcUrl, "confirmed");
  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, anchor.AnchorProvider.defaultOptions());
  const program = new anchor.Program(idl, provider);

  const startId = Number.isFinite(options.start) ? options.start : Date.now();
  const now = Math.floor(Date.now() / 1000);
  const goalLamports = Math.round(options.goalSol * LAMPORTS_PER_SOL);
  const deadlineTs = now + Math.floor(options.days * 24 * 60 * 60);

  console.log("RPC:", rpcUrl);
  console.log("Creator:", wallet.publicKey.toBase58());
  console.log("Count:", options.count);
  console.log("Start ID:", startId);

  for (let i = 0; i < options.count; i += 1) {
    const campaignId = new anchor.BN(startId + i);
    const campaign = campaignPda(program.programId, wallet.publicKey, campaignId);
    const vault = vaultPda(program.programId, campaign);
    const metadataCid = `${options.cidPrefix}-${campaignId.toString()}`;

    console.log(`Creating campaign ${campaignId.toString()}...`);
    const signature = await program.methods
      .createCampaign(campaignId, new anchor.BN(goalLamports), new anchor.BN(deadlineTs), metadataCid)
      .accounts({
        creator: wallet.publicKey,
        campaign,
        vault,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("  signature:", signature);
    console.log("  campaign:", campaign.toBase58());
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
