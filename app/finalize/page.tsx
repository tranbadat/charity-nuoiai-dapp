"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BN } from "@coral-xyz/anchor";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useRouter } from "next/navigation";
import PageShell from "../../components/PageShell";
import StatusNotices from "../../components/StatusNotices";
import ActionModal from "../../components/ActionModal";
import { getProgram, getProvider } from "../../lib/anchor";
import { sendLocalTx } from "../../lib/local-signer";
import { campaignPda, withdrawPda } from "../../lib/pdas";

export default function FinalizePage() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
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
  const [requestIndex, setRequestIndex] = useState("");

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
    const requestIndexParam = searchParams.get("requestIndex") || "";
    if (creatorParam) {
      setCreator(creatorParam);
    }
    if (campaignIdParam) {
      setCampaignId(campaignIdParam);
    }
    if (requestIndexParam) {
      setRequestIndex(requestIndexParam);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!creator || !campaignId) {
      return;
    }
    deriveCampaign();
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
      setCampaignAddress(campaignKey.toBase58());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    }
  }

  async function handleFinalize() {
    if (!useLocalSigner && !program) {
      setError("Vui lòng kết nối ví trước.");
      return;
    }
    if (!campaignAddress) {
      setError("Vui lòng lấy địa chỉ chiến dịch trước.");
      return;
    }

    const index = Number(requestIndex);
    if (!Number.isInteger(index) || index < 0) {
      setError("Nhập mã yêu cầu hợp lệ.");
      return;
    }

    setRedirectTarget(campaignAddress ? `/campaign/${campaignAddress}` : "/");
    await withTx(async () => {
      if (useLocalSigner) {
        return sendLocalTx("finalizeWithdraw", {
          campaign: campaignAddress,
          requestIndex: index,
        });
      }
      const campaignKey = new PublicKey(campaignAddress);
      const [withdrawKey] = withdrawPda(campaignKey, new BN(index));
      return program!.methods
        .finalizeWithdraw()
        .accounts({
          campaign: campaignKey,
          withdrawRequest: withdrawKey,
        })
        .rpc();
    });
  }

  return (
    <PageShell title="Chốt biểu quyết" subtitle="Chốt kết quả biểu quyết sau khi hết thời gian.">
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
        {campaignAddress && <p className="code">Campaign PDA: {campaignAddress}</p>}
      </section>

      <section>
        <h2>Chốt biểu quyết</h2>
        <div className="grid">
          <div>
            <label>Mã yêu cầu</label>
            <input value={requestIndex} onChange={(e) => setRequestIndex(e.target.value)} />
          </div>
        </div>
        <button onClick={handleFinalize} disabled={busy}>
          Chốt biểu quyết
        </button>
      </section>
    </PageShell>
  );
}
