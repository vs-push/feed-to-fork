// Minimal .env loader (no extra dependency). Imported first so other modules see the values.
import { readFileSync, existsSync } from "node:fs";

const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
