// Shared by the migration and schema tools: connect to DATABASE_URL, and refuse to continue unless it
// is the project the caller expects. CI sets EXPECTED_PROJECT_REF per job (staging / production), so a
// secret pointing at the wrong database stops the job before it touches anything.
import pg from "pg";

export function projectRef(connectionString) {
  return new URL(connectionString).username.split(".")[1] ?? "unknown";
}

export async function connect(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const ref = projectRef(connectionString);
  const expected = process.env.EXPECTED_PROJECT_REF;
  if (expected && ref !== expected) throw new Error(`refusing to run: DATABASE_URL is project ${ref}, expected ${expected}`);
  console.log(`target project: ${ref}${expected ? " (matches EXPECTED_PROJECT_REF)" : ""}`);
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}
