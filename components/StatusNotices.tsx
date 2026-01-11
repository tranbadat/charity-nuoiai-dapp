"use client";

type StatusNoticesProps = {
  message: string | null;
  error: string | null;
  useLocalSigner: boolean;
  signer?: string | null;
};

export default function StatusNotices({
  message,
  error,
  useLocalSigner,
  signer,
}: StatusNoticesProps) {
  return (
    <>
      {message && <div className="notice">{message}</div>}
      {error && <div className="notice error">{error}</div>}
      {useLocalSigner && (
        <div className="notice">
          Đang bật chế độ ký local. Giao dịch được ký phía server bằng keypair đã cấu hình.
          {signer && <div className="code">Signer: {signer}</div>}
        </div>
      )}
    </>
  );
}
