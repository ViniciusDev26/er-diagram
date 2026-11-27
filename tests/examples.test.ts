// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { expectValidMermaid } from "./syntax.ts";

const read = (path: string) => readFileSync(join(import.meta.dirname, "..", path), "utf8");
const example = read("example/database.mmd");

test("mermaid reads the example diagram", async () => {
  await expectValidMermaid(example);
});

test("the README shows the example diagram, in a block of its own", async () => {
  const block = /^```mermaid\n([\s\S]*?)^```$/m.exec(read("README.md"));
  expect(block?.[1]).toBe(example);
  await expectValidMermaid(block?.[1] as string);
});
