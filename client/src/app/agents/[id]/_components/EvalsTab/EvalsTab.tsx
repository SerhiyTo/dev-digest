"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Modal } from "@devdigest/ui";
import {
  useCreateEvalCase,
  useDeleteEvalCase,
  useEvalCases,
  useEvalSuiteRun,
  useEvalSuiteRuns,
  useRunEvalCase,
  useUpdateEvalCase,
} from "@/lib/hooks/evals";
import {
  caseTally,
  completedRunsNewestFirst,
  currentAndPreviousSnapshots,
  gotFindingCountByCase,
} from "@/lib/evals";
import { EvalCaseList } from "./_components/EvalCaseList";
import { EvalCaseEditor, type EvalCaseEditorDraft } from "./_components/EvalCaseEditor";
import { EvalMetricsSummary } from "./_components/EvalMetricsSummary";
import { s } from "./styles";

export function EvalsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("eval");

  const casesQuery = useEvalCases(agentId);
  const suiteRunsQuery = useEvalSuiteRuns(agentId);

  const createCase = useCreateEvalCase();
  const updateCase = useUpdateEvalCase();
  const deleteCase = useDeleteEvalCase();
  const runCase = useRunEvalCase();

  const [editorTarget, setEditorTarget] = useState<"new" | string | null>(null);

  const cases = useMemo(() => casesQuery.data?.cases ?? [], [casesQuery.data]);
  const runs = useMemo(() => suiteRunsQuery.data?.runs ?? [], [suiteRunsQuery.data]);

  const latestCompletedRun = useMemo(() => completedRunsNewestFirst(runs)[0] ?? null, [runs]);
  const { current, previous } = useMemo(() => currentAndPreviousSnapshots(runs), [runs]);

  const latestRunQuery = useEvalSuiteRun(latestCompletedRun?.id ?? null);
  const gotByCase = useMemo(
    () => gotFindingCountByCase(latestRunQuery.data?.runs ?? []),
    [latestRunQuery.data],
  );

  const editingCase =
    editorTarget && editorTarget !== "new" ? cases.find((c) => c.id === editorTarget) ?? null : null;

  function handleSaveCase(draft: EvalCaseEditorDraft) {
    const body = {
      name: draft.name,
      input_diff: draft.inputDiff,
      expected_output: draft.expectedOutput,
    };
    if (editorTarget === "new") {
      createCase.mutate({ agentId, body }, { onSuccess: () => setEditorTarget(null) });
      return;
    }
    if (editorTarget) {
      updateCase.mutate({ id: editorTarget, patch: body }, { onSuccess: () => setEditorTarget(null) });
    }
  }

  const runningCaseId = runCase.isPending ? (runCase.variables ?? null) : null;

  if (casesQuery.isError || suiteRunsQuery.isError) {
    return (
      <div style={s.page}>
        <ErrorState
          onRetry={() => {
            casesQuery.refetch();
            suiteRunsQuery.refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div style={s.page}>
      <section style={s.section}>
        <EvalMetricsSummary
          agentId={agentId}
          current={current}
          previous={previous}
          tally={latestCompletedRun ? caseTally(latestCompletedRun) : null}
          hasCompletedRun={latestCompletedRun !== null}
        />
      </section>

      <section style={s.section}>
        <EvalCaseList
          cases={cases}
          gotFindingCountByCase={gotByCase}
          loading={casesQuery.isLoading}
          runningCaseId={runningCaseId}
          onCreate={() => setEditorTarget("new")}
          onRun={(caseId) => runCase.mutate(caseId)}
          onEdit={(caseId) => setEditorTarget(caseId)}
          onDelete={(caseId) => deleteCase.mutate(caseId)}
        />
      </section>

      {editorTarget && (
        <Modal
          title={
            editorTarget === "new"
              ? t("caseEditor.newCase")
              : t("caseEditor.caseTitle", { name: editingCase?.name ?? "" })
          }
          onClose={() => setEditorTarget(null)}
          width={720}
        >
          <EvalCaseEditor
            key={editorTarget}
            initialName={editingCase?.name}
            initialInputDiff={editingCase?.input_diff}
            initialExpectedOutput={editingCase?.expected_output}
            onSave={handleSaveCase}
            saving={editorTarget === "new" ? createCase.isPending : updateCase.isPending}
          />
        </Modal>
      )}
    </div>
  );
}
