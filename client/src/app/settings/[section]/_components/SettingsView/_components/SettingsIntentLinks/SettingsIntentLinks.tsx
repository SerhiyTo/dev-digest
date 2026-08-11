"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, FormField, IconBtn } from "@devdigest/ui";
import { useSettings, useUpdateSettings } from "../../../../../../../lib/hooks";
import { SectionTitle } from "../SectionTitle";
import { normaliseDomain } from "./helpers";
import { s } from "./styles";

export function SettingsIntentLinks() {
  const t = useTranslations("settings");
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  const [draft, setDraft] = React.useState("");

  const domains = (settings?.intent_link_domains ?? []) as string[];

  const save = (next: string[]) => update.mutate({ intent_link_domains: next });

  const add = () => {
    const domain = normaliseDomain(draft);
    if (!domain || domains.includes(domain)) return;
    save([...domains, domain]);
    setDraft("");
  };

  return (
    <div style={s.wrap}>
      <SectionTitle title={t("intentLinks.title")} body={t("intentLinks.body")} />

      <div style={s.warning}>{t("intentLinks.warning")}</div>

      <FormField label={t("intentLinks.label")} hint={t("intentLinks.hint")}>
        <div style={s.row}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder={t("intentLinks.placeholder")}
            style={s.input}
          />
          <Button kind="secondary" icon="Plus" onClick={add} disabled={draft.trim().length === 0}>
            {t("intentLinks.add")}
          </Button>
        </div>
      </FormField>

      {domains.length === 0 ? (
        <div style={s.empty}>{t("intentLinks.empty")}</div>
      ) : (
        <div style={s.list}>
          {domains.map((domain) => (
            <span key={domain} style={s.item}>
              <Badge mono>{domain}</Badge>
              <IconBtn
                icon="X"
                label={t("intentLinks.remove", { domain })}
                onClick={() => save(domains.filter((d) => d !== domain))}
              />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
