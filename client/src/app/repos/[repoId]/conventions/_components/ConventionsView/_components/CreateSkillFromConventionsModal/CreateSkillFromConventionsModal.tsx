"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormField, Icon, Modal, SelectInput, TextInput, Toggle } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { estimateTokens } from "@/lib/tokens";
import { MarkdownEditor } from "@/components/markdown-editor";
import {
  useConventionSkillDraft,
  useCreateSkillFromConventions,
} from "@/lib/hooks/conventions";
import { DEFAULT_SKILL_TYPE, SKILL_TYPE_VALUES } from "../../constants";
import { extractErrorMessage } from "../../helpers";
import { s } from "./styles";

const MODAL_WIDTH = 720;

export function CreateSkillFromConventionsModal({
  repoId,
  repoName,
  onClose,
}: {
  repoId: string;
  repoName: string;
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const router = useRouter();
  const { data: draft, isLoading } = useConventionSkillDraft(repoId, true);
  const create = useCreateSkillFromConventions(repoId);

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>(DEFAULT_SKILL_TYPE);
  const [body, setBody] = React.useState("");
  const [showDiff, setShowDiff] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [seeded, setSeeded] = React.useState(false);

  React.useEffect(() => {
    if (!draft || seeded) return;
    setName(draft.name);
    setDescription(draft.description);
    setType(draft.type);
    setBody(draft.body);
    setSeeded(true);
  }, [draft, seeded]);

  const existing = draft?.existing_skill ?? null;
  const isUpdate = !!existing;
  const typeOptions = SKILL_TYPE_VALUES.map((v) => ({ value: v, label: v }));
  const canSubmit = !!name.trim() && !!body.trim() && !!draft;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      const skill = await create.mutateAsync({
        name,
        description,
        type,
        body,
        ...(existing ? { skill_id: existing.id } : {}),
      });
      onClose();
      router.push(`/skills/${skill.id}?tab=config`);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={isUpdate ? t("modal.updateTitle") : t("modal.title")}
      subtitle={draft?.slug}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.footerNote}>
            {isUpdate
              ? t("modal.footerUpdateNote", { version: (existing?.version ?? 1) + 1 })
              : t("modal.footerNote")}
          </span>
          <div style={s.footerActions}>
            <Button kind="ghost" onClick={onClose}>
              {t("modal.cancel")}
            </Button>
            <Button
              kind="primary"
              icon="Sparkles"
              onClick={() => void submit()}
              disabled={!canSubmit || create.isPending}
            >
              {create.isPending
                ? t("modal.saving")
                : isUpdate
                  ? t("modal.update")
                  : t("modal.create")}
            </Button>
          </div>
        </div>
      }
    >
      {isLoading || !draft ? (
        <div style={s.loading}>{t("modal.loading")}</div>
      ) : (
        <div style={s.body}>
          {error && <div style={s.errorBanner}>{`${t("modal.failed")} ${error}`}</div>}

          <div style={s.banner}>
            <Icon.Wrench size={15} style={s.bannerIcon} />
            {/* One text node: the banner is a flex row, so rich-text chunks left
                loose would each become a flex item and wrap independently. */}
            <span style={s.bannerText}>
              {t.rich("modal.banner", {
                count: draft.merged_count,
                repo: repoName,
                b: (chunks) => <b>{chunks}</b>,
                code: (chunks) => <code>{chunks}</code>,
              })}
            </span>
          </div>

          {existing && (
            <div style={s.banner}>
              <Icon.History size={15} style={s.bannerIcon} />
              <span style={s.bannerText}>
                {t.rich("modal.updateBanner", {
                  name: existing.name,
                  version: existing.version + 1,
                  code: (chunks) => <code>{chunks}</code>,
                })}
              </span>
            </div>
          )}

          <FormField label={t("modal.nameLabel")} required>
            <TextInput value={name} onChange={setName} />
          </FormField>

          <FormField label={t("modal.descriptionLabel")}>
            <TextInput value={description} onChange={setDescription} />
          </FormField>

          <div style={s.row}>
            <div style={s.rowItem}>
              <FormField label={t("modal.typeLabel")}>
                <SelectInput
                  value={type}
                  onChange={(v) => setType(v as SkillType)}
                  options={typeOptions}
                />
              </FormField>
            </div>
            <div style={s.rowItem}>
              <FormField label={t("modal.enabledLabel")} hint={t("modal.enabledHint")}>
                <span style={s.toggleLocked} aria-disabled>
                  <Toggle on={false} onChange={() => {}} />
                </span>
              </FormField>
            </div>
          </div>

          {existing && draft.body_patch && (
            <div>
              <div style={s.diffToggle}>
                <Button kind="ghost" size="sm" onClick={() => setShowDiff((v) => !v)}>
                  {showDiff ? t("modal.hideDiff") : t("modal.showDiff")}
                </Button>
              </div>
              {showDiff && <pre style={s.diff}>{draft.body_patch}</pre>}
            </div>
          )}

          <FormField label={t("modal.bodyLabel")} required>
            <MarkdownEditor
              value={body}
              onChange={setBody}
              filename={`${draft.slug}.md`}
              unsaved={body !== draft.body}
              height={280}
              icon="FileText"
              labels={{
                unsaved: t("modal.unsaved"),
                tokens: t("modal.tokens", { count: estimateTokens(body) }),
                placeholder: t("modal.bodyPlaceholder"),
              }}
            />
          </FormField>
        </div>
      )}
    </Modal>
  );
}
