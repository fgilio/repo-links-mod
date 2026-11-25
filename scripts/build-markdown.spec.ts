// Named .spec.ts, not .test.ts: `claude plugin test .` loads every
// *.test.ts in the mod as a mod test, and this file runs under `bun test`.
import { beforeAll, expect, test } from "bun:test";
import { join } from "node:path";

import {
  type Built,
  LICENSES_PATH,
  OUTPUT_PATH,
  buildMarkdown,
  packagesIn,
} from "./build-markdown";

let built: Built;

beforeAll(async () => {
  built = await buildMarkdown();
});

async function committed(path: string): Promise<string> {
  return Bun.file(join(import.meta.dir, "..", path)).text();
}

test("the committed parser and its notices match a fresh build", async () => {
  expect((await committed(OUTPUT_PATH)) === built.bundle).toBe(true);
  expect((await committed(LICENSES_PATH)) === built.licenses).toBe(true);
});

test("the parser imports nothing, as the mod's environment has no modules", () => {
  expect(built.bundle).not.toMatch(/\bfrom\s*["']|\brequire\(|\bimport\(/);
});

test("the notices name the bundled packages", () => {
  for (const name of [
    "micromark",
    "mdast-util-from-markdown",
    "character-entities",
  ]) {
    expect(built.licenses).toContain(`\n${name}@`);
  }
});

test("packagesIn reads package folders, scoped ones included", () => {
  expect(
    packagesIn([
      "scripts/markdown-entry.ts",
      "node_modules/micromark/lib/a.js",
      "node_modules/micromark/lib/b.js",
      "node_modules/@types/mdast/index.d.ts",
    ]),
  ).toEqual(["node_modules/@types/mdast", "node_modules/micromark"]);
});
