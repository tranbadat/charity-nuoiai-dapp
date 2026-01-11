import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import Providers from "./providers";

export const metadata = {
  title: "Chiến dịch Nuoiai",
  description: "Tương tác với chương trình Nuoiai (Anchor)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
