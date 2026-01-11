import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./anchor";

export function campaignPda(creator: PublicKey, campaignId: BN) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("campaign"), creator.toBuffer(), campaignId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  );
}

export function vaultPda(campaign: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), campaign.toBuffer()],
    PROGRAM_ID
  );
}

export function donationPda(campaign: PublicKey, donor: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("donation"), campaign.toBuffer(), donor.toBuffer()],
    PROGRAM_ID
  );
}

export function withdrawPda(campaign: PublicKey, requestIndex: BN) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("withdraw"), campaign.toBuffer(), requestIndex.toArrayLike(Buffer, "le", 4)],
    PROGRAM_ID
  );
}

export function votePda(withdrawRequest: PublicKey, voter: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vote"), withdrawRequest.toBuffer(), voter.toBuffer()],
    PROGRAM_ID
  );
}
