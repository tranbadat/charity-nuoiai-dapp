import { Suspense } from "react";
import FinalizePageClient from "./page.client";

export default function FinalizePage() {
  return (
    <Suspense fallback={null}>
      <FinalizePageClient />
    </Suspense>
  );
}
