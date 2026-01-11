"use client";

type ActionModalProps = {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
};

export default function ActionModal({ open, title, message, onClose }: ActionModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <h3>{title}</h3>
        <p className="muted">{message}</p>
        <div className="modal-actions">
          <button onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}
