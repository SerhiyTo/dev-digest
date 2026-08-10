"use client";

import { useParams } from "next/navigation";
import { ConventionsView } from "./_components/ConventionsView";

/* Route: /repos/:repoId/conventions. Thin route entry — the view, its toolbar,
   cards, create-skill modal, styles and helpers are colocated under
   _components/ConventionsView. */
export default function ConventionsPage() {
  const { repoId } = useParams<{ repoId: string }>();
  return <ConventionsView repoId={repoId} />;
}
