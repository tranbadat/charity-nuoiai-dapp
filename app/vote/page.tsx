import { Suspense } from "react";
import VotePageClient from "./page.client";

export default function VotePage() {
  return (
    <Suspense fallback={null}>
      <VotePageClient />
    </Suspense>
  );
}
