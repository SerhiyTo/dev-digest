"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, SelectInput, TextInput } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useUpdateSkill, type UpdateSkillInput } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { estimateTokens } from "@/lib/tokens";
import { MarkdownEditor } from "@/components/markdown-editor";
import { TYPE_VALUES } from "./constants";
import { s } from "./styles";

export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();

  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [body, setBody] = React.useState(skill.body);
  const [versionLabel, setVersionLabel] = React.useState("");

  React.useEffect(() => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
    setVersionLabel("");
  }, [skill.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isBodyChanged = body !== skill.body;
  const typeOptions = TYPE_VALUES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const save = () => {
    const patch: UpdateSkillInput["patch"] = { name, description, type, body };
    if (isBodyChanged && versionLabel.trim()) patch.version_label = versionLabel.trim();
    update.mutate(
      { id: skill.id, patch },
      {
        onSuccess: (data) => {
          toast.success(t("config.savedToast", { version: data.version }));
          setVersionLabel("");
        },
      },
    );
  };

  return (
    <div style={s.wrap}>
      <FormField label={t("config.nameLabel")} required>
        <TextInput value={name} onChange={setName} placeholder={t("config.namePlaceholder")} />
      </FormField>
      <FormField label={t("config.descriptionLabel")} required hint={t("config.descriptionHint")}>
        <TextInput
          value={description}
          onChange={setDescription}
          placeholder={t("config.descriptionPlaceholder")}
        />
      </FormField>
      <FormField label={t("config.typeLabel")}>
        <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
      </FormField>
      <FormField label={t("config.bodyLabel")} required>
        <MarkdownEditor
          value={body}
          onChange={setBody}
          filename={`${skill.name}.md`}
          unsaved={isBodyChanged}
          labels={{
            unsaved: t("config.unsaved"),
            tokens: t("config.bodyTokens", { count: estimateTokens(body) }),
            tokensHint: t("config.bodyTokensHint"),
            placeholder: t("config.bodyPlaceholder"),
          }}
        />
      </FormField>
      {isBodyChanged && (
        <FormField label={t("config.versionLabelLabel")}>
          <TextInput
            value={versionLabel}
            onChange={setVersionLabel}
            placeholder={t("config.versionLabelPlaceholder")}
          />
        </FormField>
      )}
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} loading={update.isPending}>
          {t("config.save")}
        </Button>
        {update.isSuccess && (
          <span style={s.savedNote}>{t("config.savedToast", { version: update.data?.version })}</span>
        )}
      </div>
    </div>
  );
}
