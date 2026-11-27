// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { expectValidMermaid } from "./syntax.ts";

test("mermaid reads the example diagram", async () => {
  await expectValidMermaid(readFileSync(join(import.meta.dirname, "../example/database.mmd"), "utf8"));
});
