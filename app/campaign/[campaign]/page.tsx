"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BorshAccountsCoder, Idl, BN } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import PageShell from "../../../components/PageShell";
import StatusNotices from "../../../components/StatusNotices";
import CampaignActionPanel from "../../../components/CampaignActionPanel";
import idl from "../../../idl/nuoiai.json";
import { bnToNumberSafe, formatLamports } from "../../../lib/format";
import { withdrawPda } from "../../../lib/pdas";

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

type DonationAccount = {
  donor: PublicKey;
  campaign: PublicKey;
  amount: BN;
  refunded: boolean;
  bump: number;
};

type CampaignAction = {
  label: string;
  href: string;
  hint: string;
};

function statusToLabel(status: Record<string, unknown> | null) {
  if (!status) {
    return "Không rõ";
  }
  const key = Object.keys(status)[0];
  return STATUS_LABELS[key] || key || "Không rõ";
}

function statusKey(status: Record<string, unknown> | null) {
  if (!status) {
    return "unknown";
  }
  return Object.keys(status)[0] || "unknown";
}

function formatBnLamports(value: BN) {
  const safe = bnToNumberSafe(value);
  if (safe === null) {
    return `${value.toString()} lamports`;
  }
  return formatLamports(safe);
}

function voteChoiceLabel(choice: Record<string, unknown>) {
  const key = Object.keys(choice)[0];
  if (key === "approve") {
    return "Phê duyệt";
  }
  if (key === "reject") {
    return "Từ chối";
  }
  return key || "Không rõ";
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

export default function CampaignDetailPage() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const params = useParams();
  const campaignParam = Array.isArray(params.campaign) ? params.campaign[0] : params.campaign;
  const useLocalSigner = process.env.NEXT_PUBLIC_USE_LOCAL_SIGNER === "true";
  const ipfsGateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://ipfs.io/ipfs";

  const coder = useMemo(() => new BorshAccountsCoder(idl as Idl), []);
  const voteDiscriminator = useMemo(() => {
    const entry = (idl as { accounts: { name: string; discriminator: number[] }[] }).accounts.find(
      (account) => account.name === "VoteRecord"
    );
    return entry ? Buffer.from(entry.discriminator) : null;
  }, []);
  const donationDiscriminator = useMemo(() => {
    const entry = (idl as { accounts: { name: string; discriminator: number[] }[] }).accounts.find(
      (account) => account.name === "DonationRecord"
    );
    return entry ? Buffer.from(entry.discriminator) : null;
  }, []);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [campaign, setCampaign] = useState<CampaignAccount | null>(null);
  const [withdrawRequests, setWithdrawRequests] = useState<WithdrawAccount[]>([]);
  const [votesByRequest, setVotesByRequest] = useState<Map<number, VoteAccount[]>>(new Map());
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

  useEffect(() => {
    if (!campaignParam) {
      return;
    }
    let cancelled = false;

    async function loadCampaign() {
      resetMessages();
      setBusy(true);
      setCampaign(null);
      setWithdrawRequests([]);
      setVotesByRequest(new Map());
      setDonations([]);
      try {
        const campaignKey = new PublicKey(campaignParam);
        const info = await connection.getAccountInfo(campaignKey);
        if (!info) {
          throw new Error("Không tìm thấy chiến dịch.");
        }
        const decoded = coder.decode("Campaign", info.data) as CampaignAccount;
        if (cancelled) {
          return;
        }
        setCampaign(decoded);

        const requests: WithdrawAccount[] = [];
        for (let i = 0; i < decoded.next_withdraw_index; i += 1) {
          const [withdrawKey] = withdrawPda(campaignKey, new BN(i));
          const withdrawInfo = await connection.getAccountInfo(withdrawKey);
          if (!withdrawInfo) {
            continue;
          }
          try {
            const request = coder.decode("WithdrawRequest", withdrawInfo.data) as WithdrawAccount;
            requests.push(request);
          } catch {
            // ignore decoding errors
          }
        }
        if (cancelled) {
          return;
        }
        setWithdrawRequests(requests);

        const donationAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
          filters: [
            {
              memcmp: {
                offset: 8 + 32,
                bytes: campaignKey.toBase58(),
              },
            },
          ],
        });
        const decodedDonations: DonationAccount[] = [];
        for (const account of donationAccounts) {
          const data = account.account.data as Buffer;
          if (donationDiscriminator && !data.subarray(0, 8).equals(donationDiscriminator)) {
            continue;
          }
          try {
            const donation = coder.decode("DonationRecord", data) as DonationAccount;
            decodedDonations.push(donation);
          } catch {
            // ignore decoding errors
          }
        }
        setDonations(decodedDonations);

        const nextVotes = new Map<number, VoteAccount[]>();
        for (const request of requests) {
          const requestKey = withdrawPda(campaignKey, new BN(request.request_index))[0];
          const voteAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
            filters: [
              {
                memcmp: {
                  offset: 8 + 32,
                  bytes: requestKey.toBase58(),
                },
              },
            ],
          });
          const decodedVotes: VoteAccount[] = [];
          for (const account of voteAccounts) {
            const data = account.account.data as Buffer;
            if (voteDiscriminator && !data.subarray(0, 8).equals(voteDiscriminator)) {
              continue;
            }
            try {
              const vote = coder.decode("VoteRecord", data) as VoteAccount;
              decodedVotes.push(vote);
            } catch {
              // ignore decoding errors
            }
          }
          nextVotes.set(request.request_index, decodedVotes);
        }
        setVotesByRequest(nextVotes);

        setMessage("Đã tải thông tin chiến dịch.");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!cancelled) {
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
        }
      }
    }

    loadCampaign();
    return () => {
      cancelled = true;
    };
  }, [campaignParam, coder, connection, voteDiscriminator, donationDiscriminator]);

  const latestRequest = useMemo(() => {
    if (withdrawRequests.length === 0) {
      return null;
    }
    return [...withdrawRequests].sort((a, b) => b.request_index - a.request_index)[0];
  }, [withdrawRequests]);

  const action = useMemo<CampaignAction[]>(() => {
    if (!campaign) {
      return [];
    }
    const actions: CampaignAction[] = [];
    const nowSec = Math.floor(Date.now() / 1000);
    const deadlineSec = bnToNumberSafe(campaign.deadline_ts) ?? Number(campaign.deadline_ts.toString());
    const isOwner = useLocalSigner || (!!publicKey && campaign.creator.equals(publicKey));
    const status = statusKey(campaign.status);
    const isBeforeDeadline = Number.isFinite(deadlineSec) && nowSec < deadlineSec;
    const isAfterDeadline = Number.isFinite(deadlineSec) && nowSec >= deadlineSec;
    const hasPendingVote = !!latestRequest && !latestRequest.finalized;
    const inVoteWindow =
      !!latestRequest &&
      nowSec >= Number(latestRequest.vote_start_ts.toString()) &&
      nowSec <= Number(latestRequest.vote_end_ts.toString());
    const voteEnded =
      !!latestRequest && nowSec > Number(latestRequest.vote_end_ts.toString()) && !latestRequest.finalized;
    const goalReached = campaign.total_raised.gte(campaign.goal_lamports);
    const canExecute =
      isOwner &&
      !!latestRequest &&
      latestRequest.finalized &&
      latestRequest.approved &&
      !latestRequest.executed;
    const isRefundedOut = (status === "expired" || status === "refunding") &&
      donations.length > 0 &&
      donations.every((donation) => donation.refunded);

    if (isRefundedOut) {
      return [];
    }

    if (isBeforeDeadline && status !== "closed" && status !== "refunding") {
      actions.push({
        label: "Ủng hộ",
        href: `/donate?creator=${campaign.creator.toBase58()}&campaignId=${campaign.campaign_id.toString()}`,
        hint: "Chiến dịch còn thời gian gây quỹ, bạn có thể ủng hộ.",
      });
    }

    if (hasPendingVote && inVoteWindow) {
      actions.push({
        label: "Biểu quyết",
        href: `/vote?creator=${campaign.creator.toBase58()}&campaignId=${campaign.campaign_id.toString()}&requestIndex=${latestRequest?.request_index ?? 0}`,
        hint: "Đang trong thời gian biểu quyết giải ngân.",
      });
    }

    if (voteEnded) {
      actions.push({
        label: "Chốt biểu quyết",
        href: `/finalize?creator=${campaign.creator.toBase58()}&campaignId=${campaign.campaign_id.toString()}&requestIndex=${latestRequest?.request_index ?? 0}`,
        hint: "Đã hết thời gian vote, có thể chốt kết quả.",
      });
    }

    const canRequestWithdraw =
      isOwner &&
      goalReached &&
      (!latestRequest ||
        (latestRequest.finalized && (!latestRequest.approved || latestRequest.executed)));

    if (canRequestWithdraw) {
      actions.push({
        label: "Yêu cầu giải ngân",
        href: `/request-withdraw?creator=${campaign.creator.toBase58()}&campaignId=${campaign.campaign_id.toString()}`,
        hint: "Chiến dịch đã đủ tiền, bạn có thể tạo yêu cầu giải ngân.",
      });
    }

    if ((status === "expired" || status === "refunding") || (isAfterDeadline && !goalReached)) {
      actions.push({
        label: "Hủy chiến dịch",
        href: `/refund?creator=${campaign.creator.toBase58()}&campaignId=${campaign.campaign_id.toString()}`,
        hint: "Chiến dịch đã hết hạn, có thể thực hiện hoàn tiền.",
      });
    }

    if (canExecute) {
      actions.push({
        label: "Giải ngân",
        href: `/execute?creator=${campaign.creator.toBase58()}&campaignId=${campaign.campaign_id.toString()}&requestIndex=${latestRequest?.request_index ?? 0}`,
        hint: "Yêu cầu đã được duyệt và có thể giải ngân.",
      });
    }

    return actions;
  }, [campaign, latestRequest, publicKey, useLocalSigner, donations]);

  return (
    <PageShell title="Chi tiết chiến dịch" subtitle="Thông tin và hành động theo trạng thái.">
      <StatusNotices message={message} error={error} useLocalSigner={useLocalSigner} signer={null} />
      <section>
        <div className="row">
          <Link className="nav-link" href="/">
            Quay lại danh sách
          </Link>
          <span className="muted">{busy ? "Đang tải dữ liệu..." : ""}</span>
        </div>
        {!campaign && !busy && <div className="muted">Chưa có dữ liệu chiến dịch.</div>}
        {campaign && (
          <div className="notice">
            <div className="row">
              <span className="badge">Trạng thái: {statusToLabel(campaign.status)}</span>
              <span className="badge">ID: {campaign.campaign_id.toString()}</span>
            </div>
            <p className="code address-row">
              Campaign PDA:
              <span className="truncate" title={campaignParam}>
                {campaignParam}
              </span>
              <button className="copy-button" onClick={() => copyToClipboard(campaignParam)}>
                Copy
              </button>
            </p>
            <p className="muted address-row">
              Người tạo:
              <span className="truncate" title={campaign.creator.toBase58()}>
                {campaign.creator.toBase58()}
              </span>
              <button className="copy-button" onClick={() => copyToClipboard(campaign.creator.toBase58())}>
                Copy
              </button>
            </p>
            <p className="muted">Mục tiêu: {formatBnLamports(campaign.goal_lamports)}</p>
            <p className="muted">Đã gây quỹ: {formatBnLamports(campaign.total_raised)}</p>
            <p className="muted">
              Hạn chót: {formatUnixSeconds(campaign.deadline_ts)} (unix: {campaign.deadline_ts.toString()})
            </p>
            <p className="muted">
              Giấy tờ chứng minh (CID):{" "}
              <span className="code">{campaign.metadata_cid || "Chưa có"}</span>
              {campaign.metadata_cid && (
                <>
                  {" "}
                  -{" "}
                  <a href={`${ipfsGateway}/${campaign.metadata_cid}`} target="_blank" rel="noreferrer">
                    Mở
                  </a>
                </>
              )}
            </p>
          </div>
        )}
      </section>

      <section>
        <h2>Hành động</h2>
        <CampaignActionPanel actions={action} />
      </section>

      <section>
        <h2>Yêu cầu giải ngân</h2>
        {campaign && (statusKey(campaign.status) === "refunding" || statusKey(campaign.status) === "expired") && (
          <div className="notice">
            <div className="row">
              <Link
                className="button-link"
                href={`/refund?creator=${campaign.creator.toBase58()}&campaignId=${campaign.campaign_id.toString()}`}
              >
                Hoàn tiền
              </Link>
              <span className="muted">Chiến dịch đang ở trạng thái hoàn tiền.</span>
            </div>
          </div>
        )}
        {withdrawRequests.length === 0 && <div className="muted">Chưa có yêu cầu nào.</div>}
        {withdrawRequests.map((request) => (
          <div key={request.request_index} className="notice">
            <div className="row">
              <span className="badge">Mã yêu cầu: {request.request_index}</span>
              <span className="badge">Được duyệt: {request.approved ? "Có" : "Không"}</span>
              <span className="badge">Đã chốt: {request.finalized ? "Có" : "Không"}</span>
              <span className="badge">Đã giải ngân: {request.executed ? "Có" : "Không"}</span>
            </div>
            {!request.finalized && (
              <div className="row">
                <Link
                  className="button-link"
                  href={`/vote?creator=${campaign?.creator.toBase58()}&campaignId=${campaign?.campaign_id.toString()}&requestIndex=${request.request_index}`}
                >
                  Biểu quyết
                </Link>
                <span className="muted">Đang mở biểu quyết cho yêu cầu này.</span>
              </div>
            )}
            <p className="muted">Số tiền: {formatBnLamports(request.amount)}</p>
            <p className="muted">Bằng chứng CID: {request.evidence_cid}</p>
            <p className="muted">
              Thời gian vote: {formatUnixSeconds(request.vote_start_ts)} - {formatUnixSeconds(request.vote_end_ts)}{" "}
              (unix: {request.vote_start_ts.toString()} - {request.vote_end_ts.toString()})
            </p>
          </div>
        ))}
      </section>

      <section>
        <h2>Lịch sử ủng hộ</h2>
        {donations.length === 0 && <div className="muted">Chưa có ủng hộ nào.</div>}
        {donations.map((donation) => (
          <div key={donation.donor.toBase58()} className="notice">
            <p className="muted address-row">
              Người ủng hộ:
              <span className="truncate" title={donation.donor.toBase58()}>
                {donation.donor.toBase58()}
              </span>
              <button className="copy-button" onClick={() => copyToClipboard(donation.donor.toBase58())}>
                Copy
              </button>
            </p>
            <p className="muted">Số tiền: {formatBnLamports(donation.amount)}</p>
            <p className="muted">Đã hoàn: {donation.refunded ? "Có" : "Không"}</p>
          </div>
        ))}
      </section>

      <section>
        <h2>Lịch sử hoàn tiền</h2>
        {donations.filter((donation) => donation.refunded).length === 0 && (
          <div className="muted">Chưa có hoàn tiền nào.</div>
        )}
        {donations
          .filter((donation) => donation.refunded)
          .map((donation) => (
            <div key={`refund-${donation.donor.toBase58()}`} className="notice">
              <p className="muted address-row">
                Người nhận hoàn:
                <span className="truncate" title={donation.donor.toBase58()}>
                  {donation.donor.toBase58()}
                </span>
                <button className="copy-button" onClick={() => copyToClipboard(donation.donor.toBase58())}>
                  Copy
                </button>
              </p>
              <p className="muted">Số tiền: {formatBnLamports(donation.amount)}</p>
            </div>
          ))}
      </section>

      <section>
        <h2>Lịch sử giải ngân</h2>
        {withdrawRequests.filter((request) => request.executed).length === 0 && (
          <div className="muted">Chưa có lần giải ngân nào.</div>
        )}
        {withdrawRequests
          .filter((request) => request.executed)
          .map((request) => (
            <div key={`execute-${request.request_index}`} className="notice">
              <div className="row">
                <span className="badge">Yêu cầu: #{request.request_index}</span>
                <span className="badge">Đã giải ngân</span>
              </div>
              <p className="muted">Số tiền: {formatBnLamports(request.amount)}</p>
              <p className="muted">
                Thời điểm chốt: {formatUnixSeconds(request.finalized_ts)} (unix: {request.finalized_ts.toString()})
              </p>
            </div>
          ))}
      </section>

      <section>
        <h2>Lịch sử biểu quyết</h2>
        {withdrawRequests.length === 0 && <div className="muted">Chưa có dữ liệu biểu quyết.</div>}
        {withdrawRequests.map((request) => {
          const votes = votesByRequest.get(request.request_index) || [];
          return (
            <div key={`votes-${request.request_index}`} className="notice">
              <div className="row">
                <span className="badge">Yêu cầu: #{request.request_index}</span>
                <span className="badge">Số phiếu: {votes.length}</span>
              </div>
              {votes.length === 0 && <div className="muted">Chưa có phiếu nào.</div>}
              {votes.map((vote) => (
                <div key={vote.voter.toBase58()} className="row">
                  <span className="muted">Voter: {vote.voter.toBase58()}</span>
                  <span className="muted">Lựa chọn: {voteChoiceLabel(vote.choice)}</span>
                  <span className="muted">Trọng số: {vote.weight_used.toString()}</span>
                </div>
              ))}
            </div>
          );
        })}
      </section>
    </PageShell>
  );
}
