"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, TextInput, SelectInput, Textarea } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useCreateSkill } from "../../../../../../lib/hooks/skills";
import { extractErrorMessage } from "../../helpers";
import { ErrorBanner } from "../ErrorBanner";
import { DEFAULT_TYPE, MODAL_WIDTH, TYPE_VALUES } from "./constants";
import { s } from "./styles";

export function CreateSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>(DEFAULT_TYPE);
  const [body, setBody] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const typeOptions = TYPE_VALUES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));
  const canSubmit = !!name.trim() && !!body.trim();

  const submit = async () => {
    if (!canSubmit) return;
    try {
      const skill = await create.mutateAsync({
        name,
        description,
        type,
        body,
        source: "manual",
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
      title={t("create.title")}
      subtitle={t("create.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Plus"
            onClick={() => void submit()}
            disabled={create.isPending || !canSubmit}
          >
            {create.isPending ? t("create.creating") : t("create.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        {error && <ErrorBanner title={t("create.failed")} message={error} />}
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
          <Textarea value={body} onChange={setBody} placeholder={t("config.bodyPlaceholder")} rows={8} mono />
        </FormField>
      </div>
    </Modal>
  );
}
