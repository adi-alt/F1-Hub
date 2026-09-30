// Regression guard for audit SEC-03/SEC-04 (AI-01/AI-04): three unauthenticated routes let anyone
// spend the project's NVIDIA / Hugging Face credits - one of them an open proxy that accepted a
// caller-supplied model and message body. They were deleted rather than gated because production
// never used those providers (Groq -> OpenRouter is the only live path, providerFallback.ts). If a
// provider health check is needed again, it belongs behind requirePermission() and must not
// generate completions (see roadmap R-13).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "../../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !full.includes(`${path.sep}__tests__${path.sep}`)) out.push(full);
  }
  return out;
}

test("the unauthenticated AI debug routes stay deleted", () => {
  for (const route of ["benchmark-real", "diagnostic", "diagnostic-provider-path"]) {
    assert.equal(fs.existsSync(path.join(SRC, "app/api/ai", route)), false, `src/app/api/ai/${route} must not exist`);
  }
});

test("no source file calls the NVIDIA or Hugging Face inference endpoints", () => {
  const offenders = walk(SRC).filter((file) => /integrate\.api\.nvidia\.com|router\.huggingface\.co|api-inference\.huggingface\.co/.test(fs.readFileSync(file, "utf8")));
  assert.deepEqual(offenders.map((f) => path.relative(SRC, f)), []);
});

test("every /api/ai route requires a session or explicitly allows anonymous callers", () => {
  // homepage-intelligence and race-intelligence deliberately serve anonymous visitors (cached,
  // shared tier); every other AI route must reject a request with no session.
  const anonymousAllowed = new Set(["homepage-intelligence", "race-intelligence"]);
  const dir = path.join(SRC, "app/api/ai");
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name, "route.ts");
    if (!fs.existsSync(file) || anonymousAllowed.has(name)) continue;
    const body = fs.readFileSync(file, "utf8");
    assert.match(body, /getSession\(\)/, `${name} must read the session`);
    assert.match(body, /status:\s*401/, `${name} must return 401 without a session`);
  }
});
