"use client";

import { useParams } from "next/navigation";
import { OnboardingView } from "./_components/OnboardingView";

export default function OnboardingPage() {
  const { repoId } = useParams<{ repoId: string }>();
  return <OnboardingView repoId={repoId} />;
}
