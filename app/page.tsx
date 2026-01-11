"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BorshAccountsCoder, Idl, BN } from "@coral-xyz/anchor";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import PageShell from "../components/PageShell";
import StatusNotices from "../components/StatusNotices";
import CampaignCard from "../components/CampaignCard";
import idl from "../idl/nuoiai.json";
import { bnToNumberSafe, formatLamports } from "../lib/format";

export default function HomePage() {
  const { connection } = useConnection();
  const useLocalSigner = process.env.NEXT_PUBLIC_USE_LOCAL_SIGNER === "true";

  const coder = useMemo(() => new BorshAccountsCoder(idl as Idl), []);
  const campaignDiscriminator = useMemo(() => {
    const entry = (idl as { accounts: { name: string; discriminator: number[] }[] }).accounts.find(
      (account) => account.name === "Campaign"
    );
    return entry ? Buffer.from(entry.discriminator) : null;
  }, []);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [campaigns, setCampaigns] = useState<{ pubkey: PublicKey; data: CampaignAccount }[]>([]);

  function resetMessages() {
    setMessage(null);
    setError(null);
  }

  const loadCampaigns = useCallback(async () => {
    resetMessages();
    setBusy(true);
    try {
      const accounts = await connection.getProgramAccounts(PROGRAM_ID);
      const nextCampaigns: { pubkey: PublicKey; data: CampaignAccount }[] = [];

      for (const account of accounts) {
        const data = account.account.data as Buffer;
        if (!campaignDiscriminator || !data.subarray(0, 8).equals(campaignDiscriminator)) {
          continue;
        }
        try {
          const decoded = coder.decode("Campaign", data) as CampaignAccount;
          nextCampaigns.push({ pubkey: account.pubkey, data: decoded });
        } catch {
          // ignore decoding errors
        }
      }

      setCampaigns(nextCampaigns);
      setMessage("Đã tải danh sách chiến dịch.");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [connection, coder, campaignDiscriminator]);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  return (
    <PageShell title="Danh sách chiến dịch" subtitle="Chọn chiến dịch để xem chi tiết.">
      <StatusNotices message={message} error={error} useLocalSigner={useLocalSigner} signer={null} />
      <section className="section-header">
        <div>
          <h2>Chiến dịch gây quỹ</h2>
          <p className="muted">Danh sách lấy từ tất cả tài khoản Campaign trên chương trình.</p>
        </div>
        <Link className="button-link" href="/create">
          Tạo chiến dịch
        </Link>
      </section>
      <section>
        <div className="row">
          <button onClick={loadCampaigns} disabled={busy}>
            Tải danh sách
          </button>
          <span className="muted">Tổng: {campaigns.length} chiến dịch</span>
        </div>
        {campaigns.length === 0 && <p className="muted">Chưa có chiến dịch nào.</p>}
        {campaigns.length > 0 && (
          <div className="grid">
            {campaigns.map((campaign) => (
              <CampaignCard
                key={campaign.pubkey.toBase58()}
                href={`/campaign/${campaign.pubkey.toBase58()}`}
                title={campaign.data.metadata_cid || "Chiến dịch chưa có tên"}
                status={statusToLabel(campaign.data.status)}
                campaignId={campaign.data.campaign_id.toString()}
                goal={formatBnLamports(campaign.data.goal_lamports)}
                raised={formatBnLamports(campaign.data.total_raised)}
                deadline={`${formatUnixSeconds(campaign.data.deadline_ts)} (unix: ${campaign.data.deadline_ts.toString()})`}
                raisedTone={getRaisedTone(campaign.data.total_raised, campaign.data.goal_lamports)}
              />
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}

const PROGRAM_ID = new PublicKey((idl as { address: string }).address);

const STATUS_LABELS: Record<string, string> = {
  active: "Đang gây quỹ",
  successful: "Đạt mục tiêu",
  expired: "Hết hạn",
  refunding: "Đang hoàn tiền",
  closed: "Đã đóng",
};

type CampaignAccount = {
  creator: PublicKey;
  campaign_id: BN;
  goal_lamports: BN;
  total_raised: BN;
  deadline_ts: BN;
  metadata_cid: string;
  status: Record<string, unknown>;
  created_ts: BN;
  last_action_ts: BN;
  bump: number;
  vault_bump: number;
  next_withdraw_index: number;
  goal_reached_ts: BN;
};

function statusToLabel(status: Record<string, unknown> | null) {
  if (!status) {
    return "Không rõ";
  }
  const key = Object.keys(status)[0];
  return STATUS_LABELS[key] || key || "Không rõ";
}

function formatBnLamports(value: BN) {
  const safe = bnToNumberSafe(value);
  if (safe === null) {
    return `${value.toString()} lamports`;
  }
  return formatLamports(safe);
}

function formatUnixSeconds(value: BN) {
  const safe = bnToNumberSafe(value);
  const seconds = safe ?? Number(value.toString());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return value.toString();
  }
  const date = new Date(seconds * 1000);
  return date.toLocaleString("vi-VN");
}

function getRaisedTone(raised: BN, goal: BN) {
  const raisedValue = bnToNumberSafe(raised);
  const goalValue = bnToNumberSafe(goal);
  if (raisedValue === null || goalValue === null || goalValue <= 0) {
    return "amount-mid";
  }
  const ratio = raisedValue / goalValue;
  if (ratio < 0.3) {
    return "amount-low";
  }
  if (ratio < 0.9) {
    return "amount-mid";
  }
  return "amount-high";
}
