import { writeFileSync } from "node:fs";
import path from "node:path";

/** Looks up the seeded users' ids once, through the admin API, and writes them where the tests read them. */
export default async function globalSetup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("e2e needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (the staging project's)");
  if (!/wmdgbmlpvszyapewygvs/.test(url) && !process.env.E2E_ALLOW_OTHER_PROJECT) throw new Error("e2e runs against the staging project only");
  const res = await fetch(`${url}/rest/v1/profiles?select=id,email,role&email=like.seed-%25@seed.invalid`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`could not read the seeded users: HTTP ${res.status}`);
  const rows = (await res.json()) as { id: string; email: string; role: string | null }[];
  if (rows.length < 4) throw new Error(`staging has ${rows.length} seeded users, expected 4: run scripts/staging/seed.mjs`);
  writeFileSync(path.join(__dirname, ".users.json"), JSON.stringify(rows));
}
