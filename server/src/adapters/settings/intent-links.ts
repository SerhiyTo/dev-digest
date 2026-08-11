import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

const Allowlist = z.array(z.string().trim().min(1).max(253)).max(50);

export async function readLinkAllowlist(db: Db, workspaceId: string): Promise<string[]> {
  const rows = await db
    .select({ key: t.settings.key, value: t.settings.value })
    .from(t.settings)
    .where(eq(t.settings.workspaceId, workspaceId));

  const row = rows.find((r) => r.key === 'intent_link_domains');
  const parsed = Allowlist.safeParse(row?.value);
  return parsed.success ? parsed.data : [];
}
