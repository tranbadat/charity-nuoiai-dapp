"use client";

import Link from "next/link";

type CampaignAction = {
  label: string;
  href: string;
  hint: string;
};

type CampaignActionPanelProps = {
  actions: CampaignAction[];
};

export default function CampaignActionPanel({ actions }: CampaignActionPanelProps) {
  const hasActions = actions.length > 0;

  return (
    <div className="action-panel">
      <div>
        <h3>Hành động</h3>
        <p className="muted">
          {hasActions ? "Chọn hành động phù hợp với trạng thái chiến dịch." : "Chưa có hành động phù hợp cho chiến dịch này."}
        </p>
      </div>
      {hasActions ? (
        <div className="action-list">
          {actions.map((action) => (
            <div key={action.href} className="action-item">
              <div className="muted">{action.hint}</div>
              <Link className="button-link" href={action.href}>
                {action.label}
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <button disabled>Không có hành động</button>
      )}
    </div>
  );
}
