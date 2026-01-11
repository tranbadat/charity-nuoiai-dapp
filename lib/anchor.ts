import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey } from "@solana/web3.js";
import idl from "../idl/nuoiai.json";

export const PROGRAM_ID = new PublicKey("Ctfz2Ksrytewrtgc6UF2WB6FAfHhPHJRmJFcBGe8r7qS");

export function getProvider(connection: Connection, wallet: AnchorWallet) {
  return new AnchorProvider(connection, wallet, AnchorProvider.defaultOptions());
}

export function getProgram(provider: AnchorProvider) {
  return new Program(idl as Idl, provider);
}
