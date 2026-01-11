import { Suspense } from "react";
import DonatePageClient from "./page.client";

export default function DonatePage() {
  return (
    <Suspense fallback={null}>
      <DonatePageClient />
    </Suspense>
  );
}
