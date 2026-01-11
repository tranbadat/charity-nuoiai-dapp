import { BN } from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export function solToLamports(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.round(parsed * LAMPORTS_PER_SOL);
}

export function lamportsToSol(lamports: number) {
  return lamports / LAMPORTS_PER_SOL;
}

export function formatLamports(lamports: number) {
  return `${lamportsToSol(lamports).toLocaleString(undefined, {
    maximumFractionDigits: 6,
  })} SOL`;
}

export function bnToNumberSafe(value: BN) {
  const asString = value.toString();
  const asNumber = Number(asString);
  if (!Number.isSafeInteger(asNumber)) {
    return null;
  }
  return asNumber;
}
