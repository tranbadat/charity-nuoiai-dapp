import { Suspense } from "react";
import RequestWithdrawPageClient from "./page.client";

export default function RequestWithdrawPage() {
  return (
    <Suspense fallback={null}>
      <RequestWithdrawPageClient />
    </Suspense>
  );
}
