import type { ProjectDocCategory } from "@/lib/types";

export const CATEGORY_ORDER: ProjectDocCategory[] = ["specs", "docs", "plans", "insights"];

export const SCANNED_ROOTS = ["docs/", "specs/", "plans/", "insights/"] as const;

export const PREVIEW_URL_SCHEMES: string[] = ["http", "https"];

export const SELECTED_PATH_PARAM = "path";
