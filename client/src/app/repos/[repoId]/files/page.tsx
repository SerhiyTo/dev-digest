"use client";

import { useParams } from "next/navigation";
import { FileView } from "./_components/FileView";

export default function FilePage() {
  const { repoId } = useParams<{ repoId: string }>();
  return <FileView repoId={repoId} />;
}
