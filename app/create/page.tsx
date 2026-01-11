"use client";

import { useEffect, useMemo, useState } from "react";
import { BN } from "@coral-xyz/anchor";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { SystemProgram } from "@solana/web3.js";
import { useRouter } from "next/navigation";
import PageShell from "../../components/PageShell";
import StatusNotices from "../../components/StatusNotices";
import ActionModal from "../../components/ActionModal";
import { getProgram, getProvider } from "../../lib/anchor";
import { solToLamports } from "../../lib/format";
import { sendLocalTx } from "../../lib/local-signer";
import { campaignPda, vaultPda } from "../../lib/pdas";

export default function CreateCampaignPage() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { publicKey } = useWallet();
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
  const [busy, setBusy] = useState(false);
  const [localSignerPubkey, setLocalSignerPubkey] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);

  const [campaignId, setCampaignId] = useState("");
  const [goal, setGoal] = useState("");
  const [deadline, setDeadline] = useState("");
  const [metadataCid, setMetadataCid] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);

  const ipfsApiUrl = process.env.NEXT_PUBLIC_IPFS_API_URL || "/api/ipfs/add";

  function resetMessages() {
    setMessage(null);
    setError(null);
  }

  function handleModalClose() {
    setModal(null);
    router.push("/");
  }

  function generateCampaignId() {
    return `${Date.now()}`;
  }

  function generateDemoCid(nextCampaignId: string) {
    const suffix = nextCampaignId || generateCampaignId();
    return `demo-${suffix}`;
  }

  useEffect(() => {
    if (!campaignId) {
      setCampaignId(generateCampaignId());
    }
  }, [campaignId]);

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

  async function handleCreate() {
    if (!useLocalSigner && (!program || !wallet || !publicKey)) {
      setError("Vui lòng kết nối ví trước.");
      return;
    }

    const goalLamports = solToLamports(goal);
    const deadlineTs = deadline ? Math.floor(new Date(deadline).getTime() / 1000) : 0;
    const campaignIdBn = new BN(campaignId || "0");

    if (goalLamports <= 0) {
      setError("Mục tiêu phải lớn hơn 0.");
      return;
    }

    if (!deadlineTs || deadlineTs <= Math.floor(Date.now() / 1000)) {
      setError("Hạn chót phải ở tương lai.");
      return;
    }

    if (metadataCid.length > 64) {
      setError("Metadata CID tối đa 64 ký tự.");
      return;
    }

    await withTx(async () => {
      if (useLocalSigner) {
        return sendLocalTx("createCampaign", {
          campaignId: campaignIdBn.toString(),
          goalLamports: goalLamports.toString(),
          deadlineTs: deadlineTs.toString(),
          metadataCid,
        });
      }
      const [campaign] = campaignPda(publicKey!, campaignIdBn);
      const [vault] = vaultPda(campaign);
      return program!.methods
        .createCampaign(campaignIdBn, new BN(goalLamports), new BN(deadlineTs), metadataCid)
        .accounts({
          creator: publicKey!,
          campaign,
          vault,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });
  }

  async function handleUploadEvidence() {
    resetMessages();
    if (!evidenceFile) {
      setError("Chọn file bằng chứng trước khi upload.");
      return;
    }

    setUploadBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", evidenceFile);

      const response = await fetch(ipfsApiUrl, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`IPFS upload failed: ${response.status} ${response.statusText}`);
      }

      const text = await response.text();
      const lastLine = text.trim().split("\n").pop();
      if (!lastLine) {
        throw new Error("IPFS trả về dữ liệu rỗng.");
      }

      const parsed = JSON.parse(lastLine) as { Hash?: string };
      if (!parsed.Hash) {
        throw new Error("Không nhận được CID từ IPFS.");
      }

      if (parsed.Hash.length > 64) {
        throw new Error("CID quá dài. Vui lòng chọn file khác.");
      }

      setMetadataCid(parsed.Hash);
      setMessage("Đã upload bằng chứng và tự động điền metadata CID.");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setUploadBusy(false);
    }
  }

  return (
    <PageShell title="Tạo chiến dịch" subtitle="Khởi tạo chiến dịch gây quỹ mới.">
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
        <h2>Thông tin chiến dịch</h2>
        <div className="grid">
          <div>
            <label>Mã chiến dịch</label>
            <input value={campaignId} onChange={(e) => setCampaignId(e.target.value)} />
            <button
              type="button"
              className="secondary"
              onClick={() => setCampaignId(generateCampaignId())}
              disabled={busy}
            >
              Tạo mới ID
            </button>
          </div>
          <div>
            <label>Mục tiêu (SOL)</label>
            <input value={goal} onChange={(e) => setGoal(e.target.value)} />
          </div>
          <div>
            <label>Hạn chót (ngày/giờ)</label>
            <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          <div>
            <label>Metadata CID</label>
            <input value={metadataCid} onChange={(e) => setMetadataCid(e.target.value)} />
            <button
              type="button"
              className="secondary"
              onClick={() => setMetadataCid(generateDemoCid(campaignId))}
              disabled={busy}
            >
              Tạo CID demo
            </button>
          </div>
        </div>
        <div className="notice">
          <p className="muted">
            Upload bằng chứng lên IPFS để tự động điền Metadata CID (mặc định qua proxy:
            {` ${ipfsApiUrl}`}).
          </p>
          <div className="grid">
            <div>
              <label>Bằng chứng (file)</label>
              <input type="file" onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)} />
            </div>
            <div>
              <label>&nbsp;</label>
              <button type="button" onClick={handleUploadEvidence} disabled={uploadBusy || busy}>
                {uploadBusy ? "Đang upload..." : "Upload bằng chứng"}
              </button>
            </div>
          </div>
        </div>
        <button onClick={handleCreate} disabled={busy}>
          Tạo chiến dịch
        </button>
      </section>
    </PageShell>
  );
}
