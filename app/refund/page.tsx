import { Suspense } from "react";
import RefundPageClient from "./page.client";

export default function RefundPage() {
  return (
    <Suspense fallback={null}>
      <RefundPageClient />
    </Suspense>
  );
}
