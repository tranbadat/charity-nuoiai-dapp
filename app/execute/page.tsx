import { Suspense } from "react";
import ExecutePageClient from "./page.client";

export default function ExecutePage() {
  return (
    <Suspense fallback={null}>
      <ExecutePageClient />
    </Suspense>
  );
}
