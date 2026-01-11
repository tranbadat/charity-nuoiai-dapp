"use client";

import { useMemo, useState } from "react";
import { BorshAccountsCoder, BN, Idl } from "@coral-xyz/anchor";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import PageShell from "../../components/PageShell";
import StatusNotices from "../../components/StatusNotices";
import idl from "../../idl/nuoiai.json";
import { getProgram, getProvider } from "../../lib/anchor";
import { bnToNumberSafe, formatLamports } from "../../lib/format";
import { campaignPda, vaultPda, withdrawPda } from "../../lib/pdas";

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
  campaignId: BN;
  goalLamports: BN;
  totalRaised: BN;
  deadlineTs: BN;
  metadataCid: string;
  status: Record<string, unknown>;
  createdTs: BN;
  lastActionTs: BN;
  bump: number;
  vaultBump: number;
  nextWithdrawIndex: number;
  goalReachedTs: BN;
};

type WithdrawAccount = {
  campaign: PublicKey;
  requestIndex: number;
  amount: BN;
  evidenceCid: string;
  voteStartTs: BN;
  voteEndTs: BN;
  approveWeight: BN;
  rejectWeight: BN;
  executed: boolean;
  finalized: boolean;
  approved: boolean;
  finalizedTs: BN;
  bump: number;
};

type DonationAccount = {
  donor: PublicKey;
  campaign: PublicKey;
  amount: BN;
  refunded: boolean;
  bump: number;
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

export default function CampaignPage() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const useLocalSigner = process.env.NEXT_PUBLIC_USE_LOCAL_SIGNER === "true";
  const ipfsGateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://ipfs.io/ipfs";

  const coder = useMemo(() => new BorshAccountsCoder(idl as Idl), []);
  const donationDiscriminator = useMemo(() => {
    const entry = (idl as { accounts: { name: string; discriminator: number[] }[] }).accounts.find(
      (account) => account.name === "DonationRecord"
    );
    return entry ? Buffer.from(entry.discriminator) : null;
  }, []);

  const program = useMemo(() => {
    if (!wallet) {
      return null;
    }
    return getProgram(getProvider(connection, wallet));
  }, [connection, wallet]);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [creator, setCreator] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [campaignAddress, setCampaignAddress] = useState("");
  const [vaultAddress, setVaultAddress] = useState("");
  const [campaign, setCampaign] = useState<CampaignAccount | null>(null);
  const [withdrawRequests, setWithdrawRequests] = useState<WithdrawAccount[]>([]);
  const [donations, setDonations] = useState<DonationAccount[]>([]);

  function resetMessages() {
    setMessage(null);
    setError(null);
  }

  function copyToClipboard(value: string) {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(value);
    }
  }

  async function loadCampaign() {
    resetMessages();
    if (!program) {
      setError("Vui lòng kết nối ví trước.");
      return;
    }

    try {
      setBusy(true);
      setCampaign(null);
      setWithdrawRequests([]);
      setDonations([]);

      const creatorKey = new PublicKey(creator);
      const campaignIdBn = new BN(campaignId || "0");
      const [campaignPdaKey] = campaignPda(creatorKey, campaignIdBn);
      const [vaultPdaKey] = vaultPda(campaignPdaKey);

      const data = (await program.account.campaign.fetch(campaignPdaKey)) as CampaignAccount;
      setCampaign(data);
      setCampaignAddress(campaignPdaKey.toBase58());
      setVaultAddress(vaultPdaKey.toBase58());

      const requests: WithdrawAccount[] = [];
      for (let i = 0; i < data.nextWithdrawIndex; i += 1) {
        const [withdrawKey] = withdrawPda(campaignPdaKey, new BN(i));
        try {
          const request = (await program.account.withdrawRequest.fetch(withdrawKey)) as WithdrawAccount;
          requests.push(request);
        } catch {
          // ignore missing
        }
      }
      setWithdrawRequests(requests);

      const donationAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
        filters: [
          {
            memcmp: {
              offset: 8 + 32,
              bytes: campaignPdaKey.toBase58(),
            },
          },
        ],
      });
      const nextDonations: DonationAccount[] = [];
      for (const account of donationAccounts) {
        const data = account.account.data as Buffer;
        if (donationDiscriminator && !data.subarray(0, 8).equals(donationDiscriminator)) {
          continue;
        }
        try {
          const decoded = coder.decode("DonationRecord", data) as DonationAccount;
          nextDonations.push(decoded);
        } catch {
          // ignore decoding errors
        }
      }
      setDonations(nextDonations);

      setMessage("Đã tải chiến dịch.");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell title="Tổng quan chiến dịch" subtitle="Xem trạng thái chiến dịch và lịch sử hoạt động.">
      <StatusNotices message={message} error={error} useLocalSigner={useLocalSigner} signer={null} />
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
            <div className="row">
              <span className="badge">Trạng thái: {statusToLabel(campaign.status)}</span>
              <span className="badge">Chỉ số yêu cầu tiếp theo: {campaign.nextWithdrawIndex}</span>
            </div>
            <p className="code address-row">
              Campaign PDA:
              <span className="truncate" title={campaignAddress}>
                {campaignAddress}
              </span>
              <button className="copy-button" onClick={() => copyToClipboard(campaignAddress)}>
                Copy
              </button>
            </p>
            <p className="code address-row">
              Vault PDA:
              <span className="truncate" title={vaultAddress}>
                {vaultAddress}
              </span>
              <button className="copy-button" onClick={() => copyToClipboard(vaultAddress)}>
                Copy
              </button>
            </p>
            <p className="muted">Người tạo: {campaign.creator.toBase58()}</p>
            <p className="muted">Mục tiêu: {formatBnLamports(campaign.goalLamports)}</p>
            <p className="muted">Đã gây quỹ: {formatBnLamports(campaign.totalRaised)}</p>
            <p className="muted">
              Hạn chót: {formatUnixSeconds(campaign.deadlineTs)} (unix: {campaign.deadlineTs.toString()})
            </p>
            <p className="muted">
              Giấy tờ chứng minh (CID):{" "}
              <span className="code">{campaign.metadataCid || "Chưa có"}</span>
              {campaign.metadataCid && (
                <>
                  {" "}
                  -{" "}
                  <a href={`${ipfsGateway}/${campaign.metadataCid}`} target="_blank" rel="noreferrer">
                    Mở
                  </a>
                </>
              )}
            </p>
          </div>
        )}
      </section>

      <section>
        <h2>Lịch sử ủng hộ</h2>
        {donations.length === 0 && <div className="muted">Chưa có ủng hộ nào.</div>}
        {donations.map((donation) => (
          <div key={donation.donor.toBase58()} className="notice">
            <p className="muted">Người ủng hộ: {donation.donor.toBase58()}</p>
            <p className="muted">Số tiền: {formatBnLamports(donation.amount)}</p>
            <p className="muted">Đã hoàn: {donation.refunded ? "Có" : "Không"}</p>
          </div>
        ))}
      </section>

      <section>
        <h2>Yêu cầu giải ngân</h2>
        {withdrawRequests.length === 0 && <div className="muted">Chưa tải yêu cầu giải ngân.</div>}
        {withdrawRequests.map((request) => (
          <div key={`${request.requestIndex}`} className="notice">
            <div className="row">
              <span className="badge">Mã yêu cầu: {request.requestIndex}</span>
              <span className="badge">Được duyệt: {request.approved ? "Có" : "Không"}</span>
              <span className="badge">Đã chốt: {request.finalized ? "Có" : "Không"}</span>
              <span className="badge">Đã giải ngân: {request.executed ? "Có" : "Không"}</span>
            </div>
            <p className="muted">Số tiền: {formatBnLamports(request.amount)}</p>
            <p className="muted">CID bằng chứng: {request.evidenceCid}</p>
            <p className="muted">Trọng số duyệt: {request.approveWeight.toString()}</p>
            <p className="muted">Trọng số từ chối: {request.rejectWeight.toString()}</p>
            <p className="muted">
              Thời gian vote: {formatUnixSeconds(request.voteStartTs)} - {formatUnixSeconds(request.voteEndTs)} (unix:{" "}
              {request.voteStartTs.toString()} - {request.voteEndTs.toString()})
            </p>
          </div>
        ))}
      </section>
    </PageShell>
  );
}
