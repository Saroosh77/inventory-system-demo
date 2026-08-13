import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(path) ? [path] : [];
  });
}

test("browser and API source contains no caller-selected identity plumbing", () => {
  const files = ["app", "components", "lib"]
    .flatMap(sourceFiles)
    .filter((path) => !path.endsWith("audit-service.ts"));
  const source = files.map((path) => readFileSync(path, "utf8")).join("\n");

  assert.doesNotMatch(source, /x-user-id/i);
  assert.doesNotMatch(source, /[?&]actorId=/);
  assert.doesNotMatch(source, /session\.users/);
  assert.doesNotMatch(source, /Demo identity/i);
});

test("the shared API handler resolves actors through the session service", () => {
  const source = readFileSync("lib/server/platform/api-handler.ts", "utf8");
  assert.match(source, /auth\/session-service/);
  assert.match(source, /export \{ requireRequestActor \}/);
});

test("the root page redirects guests and passes an authenticated session", () => {
  const source = readFileSync("app/page.tsx", "utf8");
  assert.match(source, /if \(!actor\) redirect\("\/login"\)/);
  assert.match(source, /initialSession=\{await loadSession\(actor\)\}/);
});
