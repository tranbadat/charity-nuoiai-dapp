"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { BN } from "@coral-xyz/anchor";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import PageShell from "../../components/PageShell";
import StatusNotices from "../../components/StatusNotices";
import ActionModal from "../../components/ActionModal";
import { getProgram, getProvider } from "../../lib/anchor";
import { sendLocalTx } from "../../lib/local-signer";
import { campaignPda, donationPda, vaultPda, withdrawPda } from "../../lib/pdas";

const X_INACTIVITY_SECONDS = 7 * 24 * 60 * 60;
const Y_NOT_EXECUTED_SECONDS = 3 * 24 * 60 * 60;

type CampaignAccount = {
  goalReachedTs: BN;
  nextWithdrawIndex: number;
  goalLamports: BN;
  totalRaised: BN;
  deadlineTs: BN;
  status: Record<string, unknown>;
};

type WithdrawAccount = {
  finalized: boolean;
  approved: boolean;
  executed: boolean;
  finalizedTs: BN;
};

export default function RefundPage() {
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
      withdrawRequest: { fetch: (address: PublicKey) => Promise<WithdrawAccount> };
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
  const [requestIndex, setRequestIndex] = useState("");
  const [refundHint, setRefundHint] = useState<string | null>(null);

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

  async function loadRefundHint(campaignKey: PublicKey) {
    const client = accountClient;
    if (!program || !client) {
      return;
    }
    try {
      const nowSec = Math.floor(Date.now() / 1000);
      const campaign = await client.campaign.fetch(campaignKey);
      const goalReachedTs = Number(campaign.goalReachedTs.toString());
      const totalRaised = Number(campaign.totalRaised.toString());
      const goalLamports = Number(campaign.goalLamports.toString());
      const deadlineTs = Number(campaign.deadlineTs.toString());
      const statusKey = Object.keys(campaign.status || {})[0] || "";

      const reasons: string[] = [];
      if (nowSec > deadlineTs && totalRaised < goalLamports) {
        reasons.push("Chiến dịch đã hết hạn và chưa đạt mục tiêu.");
      }
      if (statusKey === "refunding") {
        reasons.push("Chiến dịch đang ở trạng thái hoàn tiền.");
      }
      if (
        goalReachedTs > 0 &&
        campaign.nextWithdrawIndex === 0 &&
        nowSec - goalReachedTs >= X_INACTIVITY_SECONDS
      ) {
        reasons.push("Chủ chiến dịch chưa tạo yêu cầu giải ngân sau khi đạt mục tiêu (7 ngày).");
      }

      let request = requestIndex ? Number(requestIndex) : null;
      if (request === null && campaign.nextWithdrawIndex > 0) {
        request = campaign.nextWithdrawIndex - 1;
        setRequestIndex(String(request));
      }

      if (request !== null && Number.isInteger(request) && request >= 0) {
        const [withdrawKey] = withdrawPda(campaignKey, new BN(request));
        try {
          const wr = await client.withdrawRequest.fetch(withdrawKey);
          if (wr.finalized && !wr.approved) {
            reasons.push("Yêu cầu giải ngân đã bị từ chối.");
          }
          if (
            wr.finalized &&
            wr.approved &&
            !wr.executed &&
            nowSec - Number(wr.finalizedTs.toString()) >= Y_NOT_EXECUTED_SECONDS
          ) {
            reasons.push("Yêu cầu giải ngân đã được duyệt nhưng chưa thực thi quá 3 ngày.");
          }
        } catch {
          // ignore missing
        }
      }

      if (reasons.length === 0) {
        setRefundHint("Chưa đủ điều kiện hoàn tiền theo trạng thái hiện tại.");
      } else {
        setRefundHint(reasons.join(" "));
      }
    } catch {
      setRefundHint(null);
    }
  }

  async function handleRefund() {
    if (!useLocalSigner && (!program || !publicKey)) {
      setError("Vui lòng kết nối ví trước.");
      return;
    }
    if (!campaignAddress) {
      setError("Vui lòng lấy địa chỉ chiến dịch trước.");
      return;
    }

    const indexValue = requestIndex ? Number(requestIndex) : null;
    if (requestIndex && (indexValue === null || !Number.isInteger(indexValue) || indexValue < 0)) {
      setError("Nhập mã yêu cầu hợp lệ.");
      return;
    }

    setRedirectTarget(campaignAddress ? `/campaign/${campaignAddress}` : "/");
    await withTx(async () => {
      if (useLocalSigner) {
        return sendLocalTx("claimRefund", {
          campaign: campaignAddress,
          requestIndex: indexValue,
        });
      }
      const campaignKey = new PublicKey(campaignAddress);
      const [vaultKey] = vaultPda(campaignKey);
      const [donationKey] = donationPda(campaignKey, publicKey!);
      const builder = program!.methods.claimRefund().accounts({
        donor: publicKey!,
        campaign: campaignKey,
        vault: vaultKey,
        donationRecord: donationKey,
        systemProgram: SystemProgram.programId,
      });

      if (indexValue !== null) {
        const [withdrawKey] = withdrawPda(campaignKey, new BN(indexValue));
        builder.remainingAccounts([
          {
            pubkey: withdrawKey,
            isSigner: false,
            isWritable: false,
          },
        ]);
      }

      return builder.rpc();
    });
  }

  useEffect(() => {
    if (!campaignAddress) {
      setRefundHint(null);
      return;
    }
    const campaignKey = new PublicKey(campaignAddress);
    loadRefundHint(campaignKey);
  }, [campaignAddress, program, requestIndex]);

  return (
    <PageShell title="Hoàn tiền" subtitle="Nhận hoàn tiền khi chiến dịch đủ điều kiện.">
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
        <h2>Điều kiện hoàn tiền</h2>
        <p className="muted">
          Hoàn tiền chỉ khả dụng khi: chiến dịch hết hạn chưa đạt mục tiêu, hoặc ở trạng thái hoàn tiền, hoặc
          chủ chiến dịch không yêu cầu giải ngân sau 7 ngày, hoặc yêu cầu bị từ chối, hoặc được duyệt nhưng không
          thực thi sau 3 ngày.
        </p>
        {refundHint && <div className="notice">{refundHint}</div>}
      </section>

      <section>
        <h2>Hoàn tiền</h2>
        <div className="grid">
          <div>
            <label>Mã yêu cầu (không bắt buộc)</label>
            <input value={requestIndex} onChange={(e) => setRequestIndex(e.target.value)} />
          </div>
        </div>
        <button onClick={handleRefund} disabled={busy}>
          Nhận hoàn tiền
        </button>
      </section>
    </PageShell>
  );
}
