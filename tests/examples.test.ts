// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { expectValidMermaid } from "./syntax.ts";

test("mermaid reads the example diagram", async () => {
  await expectValidMermaid(readFileSync(new URL("../example/database.mmd", import.meta.url), "utf8"));
});
