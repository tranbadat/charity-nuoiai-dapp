"use client";

import { useMemo, useState } from "react";
import { BorshAccountsCoder, Idl, BN } from "@coral-xyz/anchor";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import PageShell from "../../components/PageShell";
import StatusNotices from "../../components/StatusNotices";
import idl from "../../idl/nuoiai.json";
import { bnToNumberSafe, formatLamports } from "../../lib/format";
import { campaignPda } from "../../lib/pdas";

const PROGRAM_ID = new PublicKey((idl as { address: string }).address);

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

type DonationAccount = {
  donor: PublicKey;
  campaign: PublicKey;
  amount: BN;
  refunded: boolean;
  bump: number;
};

type WithdrawAccount = {
  campaign: PublicKey;
  request_index: number;
  amount: BN;
  evidence_cid: string;
  vote_start_ts: BN;
  vote_end_ts: BN;
  approve_weight: BN;
  reject_weight: BN;
  executed: boolean;
  finalized: boolean;
  approved: boolean;
  finalized_ts: BN;
  bump: number;
};

type VoteAccount = {
  voter: PublicKey;
  withdraw_request: PublicKey;
  voted: boolean;
  choice: Record<string, unknown>;
  weight_used: BN;
  bump: number;
};

const STATUS_LABELS: Record<string, string> = {
  active: "Đang gây quỹ",
  successful: "Đạt mục tiêu",
  expired: "Hết hạn",
  refunding: "Đang hoàn tiền",
  closed: "Đã đóng",
};

function formatBnLamports(value: BN) {
  const safe = bnToNumberSafe(value);
  if (safe === null) {
    return `${value.toString()} lamports`;
  }
  return formatLamports(safe);
}

function statusToLabel(status: Record<string, unknown> | null) {
  if (!status) {
    return "Không rõ";
  }
  const key = Object.keys(status)[0];
  return STATUS_LABELS[key] || key || "Không rõ";
}

export default function ListPage() {
  const { connection } = useConnection();
  const useLocalSigner = process.env.NEXT_PUBLIC_USE_LOCAL_SIGNER === "true";

  const coder = useMemo(() => new BorshAccountsCoder(idl as Idl), []);
  const discriminatorMap = useMemo(() => {
    const entries = (idl as { accounts: { name: string; discriminator: number[] }[] }).accounts;
    return entries.map((entry) => ({
      name: entry.name,
      disc: Buffer.from(entry.discriminator),
    }));
  }, []);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [filterCreator, setFilterCreator] = useState("");
  const [filterCampaignId, setFilterCampaignId] = useState("");
  const [filterCampaign, setFilterCampaign] = useState<string | null>(null);

  const [campaigns, setCampaigns] = useState<{ pubkey: PublicKey; data: CampaignAccount }[]>([]);
  const [donations, setDonations] = useState<{ pubkey: PublicKey; data: DonationAccount }[]>([]);
  const [withdraws, setWithdraws] = useState<{ pubkey: PublicKey; data: WithdrawAccount }[]>([]);
  const [votes, setVotes] = useState<{ pubkey: PublicKey; data: VoteAccount }[]>([]);

  function resetMessages() {
    setMessage(null);
    setError(null);
  }

  function detectAccountType(data: Buffer) {
    for (const entry of discriminatorMap) {
      if (data.subarray(0, 8).equals(entry.disc)) {
        return entry.name;
      }
    }
    return null;
  }

  async function loadAllAccounts() {
    resetMessages();
    setBusy(true);
    try {
      const accounts = await connection.getProgramAccounts(PROGRAM_ID);
      const nextCampaigns: { pubkey: PublicKey; data: CampaignAccount }[] = [];
      const nextDonations: { pubkey: PublicKey; data: DonationAccount }[] = [];
      const nextWithdraws: { pubkey: PublicKey; data: WithdrawAccount }[] = [];
      const nextVotes: { pubkey: PublicKey; data: VoteAccount }[] = [];

      for (const account of accounts) {
        const data = account.account.data as Buffer;
        const typeName = detectAccountType(data);
        if (!typeName) {
          continue;
        }
        try {
          if (typeName === "Campaign") {
            const decoded = coder.decode(typeName, data) as CampaignAccount;
            nextCampaigns.push({ pubkey: account.pubkey, data: decoded });
          } else if (typeName === "DonationRecord") {
            const decoded = coder.decode(typeName, data) as DonationAccount;
            nextDonations.push({ pubkey: account.pubkey, data: decoded });
          } else if (typeName === "WithdrawRequest") {
            const decoded = coder.decode(typeName, data) as WithdrawAccount;
            nextWithdraws.push({ pubkey: account.pubkey, data: decoded });
          } else if (typeName === "VoteRecord") {
            const decoded = coder.decode(typeName, data) as VoteAccount;
            nextVotes.push({ pubkey: account.pubkey, data: decoded });
          }
        } catch {
          // ignore decoding errors
        }
      }

      setCampaigns(nextCampaigns);
      setDonations(nextDonations);
      setWithdraws(nextWithdraws);
      setVotes(nextVotes);
      setMessage("Đã tải dữ liệu tài khoản.");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  function applyFilters() {
    resetMessages();
    if (!filterCreator || !filterCampaignId) {
      setFilterCampaign(null);
      return;
    }
    try {
      const creatorKey = new PublicKey(filterCreator);
      const campaignIdBn = new BN(filterCampaignId || "0");
      const [campaignKey] = campaignPda(creatorKey, campaignIdBn);
      setFilterCampaign(campaignKey.toBase58());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    }
  }

  const creatorFilterKey = useMemo(() => {
    if (!filterCreator) {
      return null;
    }
    try {
      return new PublicKey(filterCreator);
    } catch {
      return null;
    }
  }, [filterCreator]);

  const campaignFilterKey = useMemo(() => {
    if (!filterCampaign) {
      return null;
    }
    try {
      return new PublicKey(filterCampaign);
    } catch {
      return null;
    }
  }, [filterCampaign]);

  const creatorCampaignSet = useMemo(() => {
    if (!creatorFilterKey) {
      return null;
    }
    const set = new Set<string>();
    for (const campaign of campaigns) {
      if (campaign.data.creator.equals(creatorFilterKey)) {
        set.add(campaign.pubkey.toBase58());
      }
    }
    return set;
  }, [campaigns, creatorFilterKey]);

  const withdrawToCampaign = useMemo(() => {
    const map = new Map<string, string>();
    for (const withdraw of withdraws) {
      map.set(withdraw.pubkey.toBase58(), withdraw.data.campaign.toBase58());
    }
    return map;
  }, [withdraws]);

  const filteredCampaigns = campaigns.filter((campaign) => {
    if (campaignFilterKey && !campaign.pubkey.equals(campaignFilterKey)) {
      return false;
    }
    if (creatorFilterKey && !campaign.data.creator.equals(creatorFilterKey)) {
      return false;
    }
    return true;
  });

  const filteredDonations = donations.filter((donation) => {
    if (campaignFilterKey && !donation.data.campaign.equals(campaignFilterKey)) {
      return false;
    }
    if (creatorCampaignSet && !creatorCampaignSet.has(donation.data.campaign.toBase58())) {
      return false;
    }
    return true;
  });

  const filteredWithdraws = withdraws.filter((withdraw) => {
    if (campaignFilterKey && !withdraw.data.campaign.equals(campaignFilterKey)) {
      return false;
    }
    if (creatorCampaignSet && !creatorCampaignSet.has(withdraw.data.campaign.toBase58())) {
      return false;
    }
    return true;
  });

  const filteredVotes = votes.filter((vote) => {
    if (campaignFilterKey) {
      const campaignKey = withdrawToCampaign.get(vote.data.withdraw_request.toBase58());
      if (!campaignKey || campaignKey !== campaignFilterKey.toBase58()) {
        return false;
      }
    }
    if (creatorCampaignSet) {
      const campaignKey = withdrawToCampaign.get(vote.data.withdraw_request.toBase58());
      if (!campaignKey || !creatorCampaignSet.has(campaignKey)) {
        return false;
      }
    }
    return true;
  });

  return (
    <PageShell title="Tất cả tài khoản" subtitle="Danh sách chiến dịch và lịch sử theo program ID.">
      <StatusNotices message={message} error={error} useLocalSigner={useLocalSigner} signer={null} />
      <section>
        <h2>Bộ lọc</h2>
        <div className="grid">
          <div>
            <label>Public Key người tạo (không bắt buộc)</label>
            <input value={filterCreator} onChange={(e) => setFilterCreator(e.target.value)} />
          </div>
          <div>
            <label>Mã chiến dịch (không bắt buộc)</label>
            <input value={filterCampaignId} onChange={(e) => setFilterCampaignId(e.target.value)} />
          </div>
        </div>
        <div className="row">
          <button onClick={applyFilters} disabled={busy}>
            Áp dụng bộ lọc
          </button>
          <button className="secondary" onClick={() => setFilterCampaign(null)} disabled={busy}>
            Xóa bộ lọc chiến dịch
          </button>
        </div>
        {filterCampaign && <p className="code">PDA bộ lọc chiến dịch: {filterCampaign}</p>}
      </section>

      <section>
        <h2>Tải dữ liệu</h2>
        <p className="muted">
          Tải tất cả tài khoản thuộc chương trình và nhóm theo loại. Dùng bộ lọc để thu hẹp kết quả.
        </p>
        <button onClick={loadAllAccounts} disabled={busy}>
          Tải tất cả tài khoản
        </button>
      </section>

      <section>
        <h2>Chiến dịch ({filteredCampaigns.length})</h2>
        {filteredCampaigns.length === 0 && <div className="muted">Không có chiến dịch.</div>}
        {filteredCampaigns.map((campaign) => (
          <div key={campaign.pubkey.toBase58()} className="notice">
            <div className="row">
              <span className="badge">Trạng thái: {statusToLabel(campaign.data.status)}</span>
              <span className="badge">ID: {campaign.data.campaign_id.toString()}</span>
            </div>
            <p className="code">Campaign PDA: {campaign.pubkey.toBase58()}</p>
            <p className="muted">Người tạo: {campaign.data.creator.toBase58()}</p>
            <p className="muted">Mục tiêu: {formatBnLamports(campaign.data.goal_lamports)}</p>
            <p className="muted">Đã gây quỹ: {formatBnLamports(campaign.data.total_raised)}</p>
            <p className="muted">Hạn chót: {campaign.data.deadline_ts.toString()}</p>
            <p className="muted">Metadata CID: {campaign.data.metadata_cid}</p>
          </div>
        ))}
      </section>

      <section>
        <h2>Ủng hộ ({filteredDonations.length})</h2>
        {filteredDonations.length === 0 && <div className="muted">Không có ủng hộ.</div>}
        {filteredDonations.map((donation) => (
          <div key={donation.pubkey.toBase58()} className="notice">
            <p className="code">Donation PDA: {donation.pubkey.toBase58()}</p>
            <p className="muted">Chiến dịch: {donation.data.campaign.toBase58()}</p>
            <p className="muted">Người ủng hộ: {donation.data.donor.toBase58()}</p>
            <p className="muted">Số tiền: {formatBnLamports(donation.data.amount)}</p>
            <p className="muted">Đã hoàn: {donation.data.refunded ? "Có" : "Không"}</p>
          </div>
        ))}
      </section>

      <section>
        <h2>Yêu cầu giải ngân ({filteredWithdraws.length})</h2>
        {filteredWithdraws.length === 0 && <div className="muted">Không có yêu cầu giải ngân.</div>}
        {filteredWithdraws.map((withdraw) => (
          <div key={withdraw.pubkey.toBase58()} className="notice">
            <div className="row">
              <span className="badge">Index: {withdraw.data.request_index}</span>
              <span className="badge">Được duyệt: {withdraw.data.approved ? "Có" : "Không"}</span>
              <span className="badge">Đã giải ngân: {withdraw.data.executed ? "Có" : "Không"}</span>
            </div>
            <p className="code">Withdraw PDA: {withdraw.pubkey.toBase58()}</p>
            <p className="muted">Chiến dịch: {withdraw.data.campaign.toBase58()}</p>
            <p className="muted">Số tiền: {formatBnLamports(withdraw.data.amount)}</p>
            <p className="muted">CID bằng chứng: {withdraw.data.evidence_cid}</p>
            <p className="muted">Trọng số duyệt: {withdraw.data.approve_weight.toString()}</p>
            <p className="muted">Trọng số từ chối: {withdraw.data.reject_weight.toString()}</p>
          </div>
        ))}
      </section>

      <section>
        <h2>Biểu quyết ({filteredVotes.length})</h2>
        {filteredVotes.length === 0 && <div className="muted">Không có biểu quyết.</div>}
        {filteredVotes.map((vote) => (
          <div key={vote.pubkey.toBase58()} className="notice">
            <p className="code">Vote PDA: {vote.pubkey.toBase58()}</p>
            <p className="muted">Yêu cầu giải ngân: {vote.data.withdraw_request.toBase58()}</p>
            <p className="muted">Người vote: {vote.data.voter.toBase58()}</p>
            <p className="muted">Trọng số: {vote.data.weight_used.toString()}</p>
          </div>
        ))}
      </section>
    </PageShell>
  );
}
