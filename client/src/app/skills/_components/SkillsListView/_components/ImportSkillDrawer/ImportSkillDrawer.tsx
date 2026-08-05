"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Drawer, FormField, TextInput, SelectInput, Markdown, Icon } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useCreateSkill } from "../../../../../../lib/hooks/skills";
import { extractErrorMessage } from "../../helpers";
import { ErrorBanner } from "../ErrorBanner";
import { DEFAULT_TYPE, DRAWER_WIDTH, TYPE_VALUES } from "./constants";
import { parseSkillFile, type ParsedSkillImport } from "./helpers";
import { s } from "./styles";

export function ImportSkillDrawer({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const create = useCreateSkill();

  const [parsed, setParsed] = React.useState<ParsedSkillImport | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>(DEFAULT_TYPE);

  const typeOptions = TYPE_VALUES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const result = await parseSkillFile(file);
      setError(null);
      setParsed(result);
      setName(result.name);
      setDescription(result.description);
      setType(DEFAULT_TYPE);
    } catch (err) {
      setParsed(null);
      setError(extractErrorMessage(err));
    }
  };

  const canSubmit = !!parsed && !!name.trim() && !!parsed.body.trim();

  const submit = async () => {
    if (!parsed || !canSubmit) return;
    try {
      const skill = await create.mutateAsync({
        name,
        description,
        type,
        body: parsed.body,
        source: "imported_file",
      });
      onClose();
      router.push(`/skills/${skill.id}?tab=config`);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  return (
    <Drawer
      width={DRAWER_WIDTH}
      title={t("drawer.title")}
      subtitle={t("drawer.subtitle")}
      onClose={onClose}
      footer={
        parsed ? (
          <div style={s.footer}>
            <Button kind="ghost" onClick={onClose}>
              {t("create.cancel")}
            </Button>
            <Button
              kind="primary"
              icon="Upload"
              onClick={() => void submit()}
              disabled={create.isPending || !canSubmit}
            >
              {create.isPending ? t("file.importing") : t("file.import")}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div style={s.body}>
        {error && <ErrorBanner title={t("drawer.importFailed")} message={error} />}
        {!parsed && (
          <div style={s.picker}>
            <label style={s.pickLabel}>
              <input type="file" accept=".md,.zip" onChange={onPick} style={s.fileInput} />
              <Icon.Upload size={15} />
              {t("page.menu.fromFile")}
            </label>
          </div>
        )}

        {parsed && (
          <div style={s.preview}>
            <FormField label={t("file.nameLabel")} hint={t("file.nameHint")} required>
              <TextInput value={name} onChange={setName} placeholder={t("file.namePlaceholder")} />
            </FormField>
            <FormField label={t("config.descriptionLabel")} hint={t("config.descriptionHint")}>
              <TextInput
                value={description}
                onChange={setDescription}
                placeholder={t("config.descriptionPlaceholder")}
              />
            </FormField>
            <FormField label={t("config.typeLabel")}>
              <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
            </FormField>
            {parsed.skipped.length > 0 && (
              <div style={s.skipped}>{t("file.skipped", { list: parsed.skipped.join(", ") })}</div>
            )}
            <FormField label={t("file.bodyLabel")} hint={t("file.bodyHint")}>
              <div style={s.markdown}>
                <Markdown>{parsed.body}</Markdown>
              </div>
            </FormField>
          </div>
        )}
      </div>
    </Drawer>
  );
}
