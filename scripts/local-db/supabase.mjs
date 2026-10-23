#!/usr/bin/env node
// A stand-in for the Supabase API in front of a local PostgREST (audit R-21), so the app can run against
// the disposable database scripts/local-db/load.ts builds. The app only reads and writes data through
// supabase-js's REST client (src/lib/supabase/admin.ts), which talks to `<url>/rest/v1/*`: that prefix is
// proxied to PostgREST. Auth answers "no user" (the browser tests sign in with the app's own session cookie,
// never through Supabase Auth); storage and realtime answer 404.
//
//   node scripts/local-db/supabase.mjs          serves on LOCAL_SUPABASE_PORT (54321), PostgREST at POSTGREST_URL
//   node scripts/local-db/supabase.mjs --env    prints the app's Supabase env for it (append to $GITHUB_ENV)
//
// The keys are JWTs signed with a fixed, test-only secret that PostgREST is started with (e2e.yml). They
// open nothing but this local database.
import crypto from "node:crypto";
import http from "node:http";

export const JWT_SECRET = "apex-local-only-jwt-secret-not-used-anywhere-real";
const PORT = Number(process.env.LOCAL_SUPABASE_PORT ?? 54321);
const POSTGREST_URL = process.env.POSTGREST_URL ?? "http://127.0.0.1:3000";

const b64 = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
function jwt(role) {
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role, iss: "apex-local", iat: 1767225600, exp: 4102444800 })}`;
  return `${body}.${crypto.createHmac("sha256", JWT_SECRET).update(body).digest("base64url")}`;
}

if (process.argv.includes("--env")) {
  console.log(`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:${PORT}`);
  console.log(`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${jwt("anon")}`);
  console.log(`SUPABASE_SECRET_KEY=${jwt("service_role")}`);
} else {
  const json = (res, status, body) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
  http
    .createServer((req, res) => {
      if (req.url === "/") return json(res, 200, { ok: true });
      if (req.url.startsWith("/auth/v1/")) return json(res, 401, { code: 401, msg: "no Supabase Auth in the local stand-in" });
      if (!req.url.startsWith("/rest/v1/")) return json(res, 404, { message: "not served locally" });
      const target = new URL(req.url.slice("/rest/v1".length), POSTGREST_URL);
      const upstream = http.request(target, { method: req.method, headers: { ...req.headers, host: target.host } }, (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      });
      upstream.on("error", (err) => json(res, 502, { message: `PostgREST unreachable: ${err.message}` }));
      req.pipe(upstream);
    })
    .listen(PORT, "127.0.0.1", () => console.log(`local Supabase stand-in on :${PORT} -> ${POSTGREST_URL}`));
}
