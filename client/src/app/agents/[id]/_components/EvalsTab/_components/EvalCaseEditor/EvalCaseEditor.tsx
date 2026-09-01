"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { EvalExpectation, EvalExpectationKind } from "@devdigest/shared";
import { insertFindingSkeleton, validateExpectedOutputText } from "./helpers";
import { s } from "./styles";

export interface EvalCaseEditorDraft {
  name: string;
  inputDiff: string;
  expectedOutput: EvalExpectation[];
}

export interface EvalCaseEditorProps {
  initialName?: string;
  initialInputDiff?: string;
  initialExpectedOutput?: EvalExpectation[];
  onSave: (draft: EvalCaseEditorDraft) => void;
  saving?: boolean;
}

export function EvalCaseEditor({
  initialName = "",
  initialInputDiff = "",
  initialExpectedOutput = [],
  onSave,
  saving = false,
}: EvalCaseEditorProps) {
  const t = useTranslations("eval.caseEditor");
  const [name, setName] = useState(initialName);
  const [inputDiff, setInputDiff] = useState(initialInputDiff);
  const [expectedOutputText, setExpectedOutputText] = useState(() =>
    JSON.stringify(initialExpectedOutput, null, 2),
  );
  const [choosingKind, setChoosingKind] = useState(false);

  const validation = validateExpectedOutputText(expectedOutputText);
  const saveDisabled = !validation.valid || saving;

  function handleChooseKind(kind: EvalExpectationKind) {
    setExpectedOutputText(insertFindingSkeleton(expectedOutputText, kind));
    setChoosingKind(false);
  }

  function handleSave() {
    if (!validation.valid) return;
    onSave({ name, inputDiff, expectedOutput: validation.value });
  }

  return (
    <div style={s.container}>
      <div style={s.field}>
        <label style={s.label} htmlFor="eval-case-name">
          {t("nameLabel")}
        </label>
        <input
          id="eval-case-name"
          type="text"
          style={s.textInput}
          value={name}
          placeholder={t("namePlaceholder")}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div style={s.field}>
        <label style={s.label} htmlFor="eval-case-diff">
          {t("inputLabel")}
        </label>
        <textarea
          id="eval-case-diff"
          style={s.diffTextarea}
          value={inputDiff}
          placeholder={t("diffPlaceholder")}
          onChange={(e) => setInputDiff(e.target.value)}
        />
      </div>

      <div style={s.field}>
        <div style={s.expectedOutputHeader}>
          <label style={s.label} htmlFor="eval-case-expected-output">
            {t("expectedOutput")}
          </label>
          <span
            style={validation.valid ? s.badgeValid : s.badgeInvalid}
            data-testid="expected-output-validity"
          >
            {validation.valid ? t("validJson") : t("invalidJson")}
          </span>
        </div>
        <textarea
          id="eval-case-expected-output"
          style={s.expectedOutputTextarea}
          value={expectedOutputText}
          aria-invalid={!validation.valid}
          onChange={(e) => {
            setExpectedOutputText(e.target.value);
            setChoosingKind(false);
          }}
        />
        <button
          type="button"
          style={s.insertButton}
          onClick={() => setChoosingKind(true)}
        >
          {t("insertFinding")}
        </button>
        {choosingKind && (
          <div style={s.kindChoiceRow}>
            <span style={s.kindChoiceLabel}>{t("chooseKind")}</span>
            <button
              type="button"
              style={s.kindChoiceButton}
              onClick={() => handleChooseKind("must_find")}
            >
              {t("kindMustFind")}
            </button>
            <button
              type="button"
              style={s.kindChoiceButton}
              onClick={() => handleChooseKind("must_not_flag")}
            >
              {t("kindMustNotFlag")}
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        style={s.saveButton}
        disabled={saveDisabled}
        onClick={handleSave}
      >
        {saving ? t("saving") : t("save")}
      </button>
    </div>
  );
}
