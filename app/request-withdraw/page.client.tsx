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
import { campaignPda, vaultPda, withdrawPda } from "../../lib/pdas";

type CampaignAccount = {
  creator: PublicKey;
  campaignId: BN;
  nextWithdrawIndex: number;
};

export default function RequestWithdrawPage() {
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

  const accountClient = useMemo(() => {
    if (!program) {
      return null;
    }
    return program.account as unknown as {
      campaign: { fetch: (address: PublicKey) => Promise<CampaignAccount> };
    };
  }, [program]);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ title: string; message: string } | null>(null);
  const [redirectTarget, setRedirectTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [localSignerPubkey, setLocalSignerPubkey] = useState<string | null>(null);

  const [creator, setCreator] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [campaignAddress, setCampaignAddress] = useState("");
  const [campaign, setCampaign] = useState<CampaignAccount | null>(null);

  const [amount, setAmount] = useState("");
  const [evidenceCid, setEvidenceCid] = useState("");
  const [voteDuration, setVoteDuration] = useState("");

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
    if (!program || !creator || !campaignId || busy) {
      return;
    }
    loadCampaign();
  }, [program, creator, campaignId]);

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

  async function loadCampaign() {
    resetMessages();
    const client = accountClient;
    if (!program || !client) {
      setError("Vui lòng kết nối ví trước.");
      return;
    }
    try {
      setBusy(true);
      const creatorKey = new PublicKey(creator);
      const campaignIdBn = new BN(campaignId || "0");
      const [campaignKey] = campaignPda(creatorKey, campaignIdBn);
      const data = await client.campaign.fetch(campaignKey);
      setCampaign(data);
      setCampaignAddress(campaignKey.toBase58());
      setMessage("Đã tải chiến dịch.");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRequest() {
    if (!useLocalSigner && (!program || !publicKey)) {
      setError("Vui lòng kết nối ví trước.");
      return;
    }
    if (!campaignAddress || !campaign) {
      setError("Vui lòng tải chiến dịch trước.");
      return;
    }

    const lamports = solToLamports(amount);
    if (lamports <= 0) {
      setError("Số tiền yêu cầu phải lớn hơn 0.");
      return;
    }

    if (evidenceCid.length > 64) {
      setError("CID bằng chứng tối đa 64 ký tự.");
      return;
    }

    const duration = voteDuration ? Number(voteDuration) : 0;
    if (voteDuration && (!Number.isFinite(duration) || duration <= 0)) {
      setError("Thời gian vote phải là số dương.");
      return;
    }

    setRedirectTarget(campaignAddress ? `/campaign/${campaignAddress}` : "/");
    await withTx(async () => {
      if (useLocalSigner) {
        return sendLocalTx("requestWithdraw", {
          campaign: campaignAddress,
          requestIndex: campaign.nextWithdrawIndex,
          amount: lamports,
          evidenceCid,
          voteDurationSeconds: duration,
        });
      }
      const campaignKey = new PublicKey(campaignAddress);
      const [vaultKey] = vaultPda(campaignKey);
      const [withdrawKey] = withdrawPda(campaignKey, new BN(campaign.nextWithdrawIndex));
      return program!.methods
        .requestWithdraw(new BN(lamports), evidenceCid, new BN(duration))
        .accounts({
          creator: publicKey!,
          campaign: campaignKey,
          vault: vaultKey,
          withdrawRequest: withdrawKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });
  }

  return (
    <PageShell title="Yêu cầu giải ngân" subtitle="Tạo yêu cầu giải ngân cho chiến dịch.">
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
        <h2>Tải chiến dịch</h2>
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
        <button onClick={loadCampaign} disabled={busy}>
          Tải chiến dịch
        </button>
        {campaign && (
          <div className="notice">
            <p className="code">Campaign PDA: {campaignAddress}</p>
            <p className="muted">Chỉ số yêu cầu tiếp theo: {campaign.nextWithdrawIndex}</p>
          </div>
        )}
      </section>

      <section>
        <h2>Yêu cầu giải ngân</h2>
        <div className="grid">
          <div>
            <label>Số tiền (SOL)</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label>CID bằng chứng</label>
            <input value={evidenceCid} onChange={(e) => setEvidenceCid(e.target.value)} />
          </div>
          <div>
            <label>Thời gian vote (giây, 0 = mặc định)</label>
            <input value={voteDuration} onChange={(e) => setVoteDuration(e.target.value)} />
          </div>
        </div>
        <button onClick={handleRequest} disabled={busy}>
          Gửi yêu cầu giải ngân
        </button>
      </section>
    </PageShell>
  );
}
