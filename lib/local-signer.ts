"use client";

export type LocalTxResult = {
  signature: string;
  signer?: string;
};

export async function sendLocalTx(action: string, payload: Record<string, unknown>): Promise<LocalTxResult> {
  const response = await fetch("/api/tx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.error === "string" ? data.error : "Local signer transaction failed.";
    throw new Error(message);
  }
  return {
    signature: String(data?.signature || ""),
    signer: typeof data?.signer === "string" ? data.signer : undefined,
  };
}
