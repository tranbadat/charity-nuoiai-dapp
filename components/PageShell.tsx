"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

type PageShellProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

const NAV_LINKS = [
  { href: "/landing", label: "Giới thiệu" },
  { href: "/", label: "Trang chủ" },
  { href: "/list", label: "Tất cả tài khoản" },
  { href: "/campaign", label: "Chiến dịch" },
  { href: "/create", label: "Tạo chiến dịch" },
  { href: "/donate", label: "Ủng hộ" },
  { href: "/request-withdraw", label: "Yêu cầu giải ngân" },
  { href: "/vote", label: "Biểu quyết" },
  { href: "/finalize", label: "Chốt biểu quyết" },
  { href: "/execute", label: "Giải ngân" },
  { href: "/refund", label: "Hoàn tiền" },
];

export default function PageShell({ title, subtitle, children }: PageShellProps) {
  const [mounted, setMounted] = useState(false);
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);

  const formattedBalance = useMemo(() => {
    if (balance === null) {
      return null;
    }
    return `${(balance / LAMPORTS_PER_SOL).toLocaleString(undefined, {
      maximumFractionDigits: 4,
    })} SOL`;
  }, [balance]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!publicKey) {
      setBalance(null);
      return;
    }
    connection
      .getBalance(publicKey)
      .then((lamports) => {
        if (!cancelled) {
          setBalance(lamports);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBalance(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [connection, publicKey]);

  return (
    <main>
      <header>
        <div>
          <h1>{title}</h1>
          {subtitle && <div className="muted">{subtitle}</div>}
        </div>
        {mounted && (
          <div className="wallet-summary">
            {formattedBalance && <span className="muted">Số dư: {formattedBalance}</span>}
            <WalletMultiButton />
          </div>
        )}
      </header>
      <nav className="nav">
        {NAV_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="nav-link">
            {link.label}
          </Link>
        ))}
      </nav>
      {children}
    </main>
  );
}
