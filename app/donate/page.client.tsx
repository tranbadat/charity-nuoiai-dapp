"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BN } from "@coral-xyz/anchor";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { useRouter } from "next/navigation";
import PageShell from "../../components/PageShell";
import StatusNotices from "../../components/StatusNotices";
import ActionModal from "../../components/ActionModal";
import { getProgram, getProvider } from "../../lib/anchor";
import { solToLamports } from "../../lib/format";
import { sendLocalTx } from "../../lib/local-signer";
import { campaignPda, donationPda, vaultPda } from "../../lib/pdas";

export default function DonatePage() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const searchParams = useSearchParams();
  const useLocalSigner = process.env.NEXT_PUBLIC_USE_LOCAL_SIGNER === "true";
  const router = useRouter();

  const program = useMemo(() => {
    if (!wallet) {
      return null;
    }
    return getProgram(getProvider(connection, wallet));
  }, [connection, wallet]);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ title: string; message: string } | null>(null);
  const [redirectTarget, setRedirectTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [localSignerPubkey, setLocalSignerPubkey] = useState<string | null>(null);

  const [creator, setCreator] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [campaignAddress, setCampaignAddress] = useState("");
  const [vaultAddress, setVaultAddress] = useState("");
  const [amount, setAmount] = useState("");

  function resetMessages() {
    setMessage(null);
    setError(null);
  }

  function handleModalClose() {
    setModal(null);
    if (redirectTarget) {
      router.push(redirectTarget);
    }
  }

  useEffect(() => {
    const creatorParam = searchParams.get("creator") || "";
    const campaignIdParam = searchParams.get("campaignId") || "";
    if (creatorParam) {
      setCreator(creatorParam);
    }
    if (campaignIdParam) {
      setCampaignId(campaignIdParam);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!creator || !campaignId) {
      return;
    }
    try {
      const creatorKey = new PublicKey(creator);
      const campaignIdBn = new BN(campaignId || "0");
      const [campaignKey] = campaignPda(creatorKey, campaignIdBn);
      const [vaultKey] = vaultPda(campaignKey);
      setCampaignAddress(campaignKey.toBase58());
      setVaultAddress(vaultKey.toBase58());
    } catch {
      // ignore invalid params
    }
  }, [creator, campaignId]);

  async function withTx(action: () => Promise<string | { signature: string; signer?: string }>) {
    resetMessages();
    setBusy(true);
    try {
      const result = await action();
      const signature = typeof result === "string" ? result : result.signature;
      if (typeof result !== "string" && result.signer) {
        setLocalSignerPubkey(result.signer);
      }
      setMessage(`Đã gửi giao dịch: ${signature}`);
      setModal({ title: "Thành công", message: `Đã gửi giao dịch: ${signature}` });
      return signature;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setModal({ title: "Có lỗi xảy ra", message });
      return null;
    } finally {
      setBusy(false);
    }
  }

  function deriveCampaign() {
    resetMessages();
    try {
      const creatorKey = new PublicKey(creator);
      const campaignIdBn = new BN(campaignId || "0");
      const [campaignKey] = campaignPda(creatorKey, campaignIdBn);
      const [vaultKey] = vaultPda(campaignKey);
      setCampaignAddress(campaignKey.toBase58());
      setVaultAddress(vaultKey.toBase58());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    }
  }

  async function handleDonate() {
    if (!useLocalSigner && (!program || !publicKey)) {
      setError("Vui lòng kết nối ví trước.");
      return;
    }
    if (!campaignAddress) {
      setError("Vui lòng lấy địa chỉ chiến dịch trước.");
      return;
    }

    const lamports = solToLamports(amount);
    if (lamports <= 0) {
      setError("Số tiền ủng hộ phải lớn hơn 0.");
      return;
    }

    setRedirectTarget(campaignAddress ? `/campaign/${campaignAddress}` : "/");
    await withTx(async () => {
      if (useLocalSigner) {
        return sendLocalTx("donate", {
          campaign: campaignAddress,
          amount: lamports,
        });
      }
      const campaignKey = new PublicKey(campaignAddress);
      const [vaultKey] = vaultPda(campaignKey);
      const [donationKey] = donationPda(campaignKey, publicKey!);
      return program!.methods
        .donate(new BN(lamports))
        .accounts({
          donor: publicKey!,
          campaign: campaignKey,
          vault: vaultKey,
          donationRecord: donationKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });
  }

  return (
    <PageShell title="Ủng hộ" subtitle="Gửi SOL vào chiến dịch gây quỹ.">
      <ActionModal
        open={!!modal}
        title={modal?.title || ""}
        message={modal?.message || ""}
        onClose={handleModalClose}
      />
      <StatusNotices
        message={message}
        error={error}
        useLocalSigner={useLocalSigner}
        signer={localSignerPubkey}
      />
      <section>
        <h2>Chiến dịch</h2>
        <div className="grid">
          <div>
            <label>Public Key người tạo</label>
            <input value={creator} onChange={(e) => setCreator(e.target.value)} />
          </div>
          <div>
            <label>Mã chiến dịch</label>
            <input value={campaignId} onChange={(e) => setCampaignId(e.target.value)} />
          </div>
        </div>
        <button onClick={deriveCampaign} disabled={busy}>
          Lấy địa chỉ chiến dịch
        </button>
        {campaignAddress && (
          <div className="notice">
            <p className="code">Campaign PDA: {campaignAddress}</p>
            <p className="code">Vault PDA: {vaultAddress}</p>
          </div>
        )}
      </section>

      <section>
        <h2>Ủng hộ</h2>
        <div className="grid">
          <div>
            <label>Số tiền (SOL)</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>
        <button onClick={handleDonate} disabled={busy}>
          Ủng hộ
        </button>
      </section>
    </PageShell>
  );
}
