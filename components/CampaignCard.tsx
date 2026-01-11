"use client";

import Link from "next/link";

type CampaignCardProps = {
  href: string;
  title: string;
  status: string;
  campaignId: string;
  goal: string;
  raised: string;
  deadline: string;
  raisedTone: "amount-low" | "amount-mid" | "amount-high";
};

export default function CampaignCard({
  href,
  title,
  status,
  campaignId,
  goal,
  raised,
  deadline,
  raisedTone,
}: CampaignCardProps) {
  function handleCopy(value: string) {
    if (!navigator?.clipboard) {
      return;
    }
    navigator.clipboard.writeText(value);
  }

  return (
    <div className="campaign-card">
      <div className="row">
        <span className="badge">Trạng thái: {status}</span>
        <span className="badge">ID: {campaignId}</span>
        <button className="copy-button" onClick={() => handleCopy(campaignId)}>
          Copy ID
        </button>
      </div>
      <div className="card-title truncate" title={title}>
        {title}
      </div>
      <div className="card-body">
        <p className="muted">Mục tiêu: {goal}</p>
        <p className={`muted ${raisedTone}`}>Đã gây quỹ: {raised}</p>
        <p className="muted">Hạn chót: {deadline}</p>
      </div>
      <Link className="button-link" href={href}>
        Xem chi tiết
      </Link>
    </div>
  );
}
