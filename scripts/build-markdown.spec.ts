// Named .spec.ts, not .test.ts: `claude plugin test .` loads every
// *.test.ts in the mod as a mod test, and this file runs under `bun test`.
import { expect, test } from "bun:test";
import { join } from "node:path";

import { OUTPUT_PATH, buildMarkdown } from "./build-markdown";

test("the committed parser matches a fresh build", async () => {
  const committed = await Bun.file(
    join(import.meta.dir, "..", OUTPUT_PATH),
  ).text();

  expect(committed === (await buildMarkdown())).toBe(true);
});

test("the parser imports nothing, as the mod's environment has no modules", async () => {
  const built = await buildMarkdown();

  expect(built).not.toMatch(/\bfrom\s*["']|\brequire\(|\bimport\(/);
});
