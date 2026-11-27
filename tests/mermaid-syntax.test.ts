// @vitest-environment jsdom
import { expect, test } from "vitest";
import { render } from "../src/mermaid.ts";
import type { Table } from "../src/schema.ts";
import { expectValidMermaid } from "./syntax.ts";

const table = (name: string, extra: Partial<Table> = {}): Table => ({
  name,
  columns: [{ name: "id", type: "integer", nullable: false }],
  primaryKey: ["id"],
  indexes: [],
  foreignKeys: [],
  ...extra,
});

test("mermaid reads what render writes, odd names and all", async () => {
  const tables = [
    table("billing.invoices", {
      columns: [
        { name: "id", type: "integer", nullable: false },
        { name: "price", type: "numeric(10,2)", nullable: false },
        { name: "at", type: "timestamp with time zone", nullable: true },
        { name: "1st", type: "text[]", nullable: true },
        { name: "ação", type: "int unsigned", nullable: false },
        { name: "mood", type: "public.mood", nullable: false, values: ['a "b"', "c, d"] },
        { name: "owner id", type: "integer", nullable: true },
      ],
      indexes: [
        { name: "by price", columns: ["price", "at"], unique: false },
        { name: "mood_key", columns: ["mood"], unique: true },
        { name: "by_mood", columns: ["mood"], unique: false },
      ],
      foreignKeys: [
        { columns: ["owner id"], references: { table: "my table", columns: ["id"] } },
        { columns: ["id", "price"], references: { table: "my-table", columns: ["id", "p"] } },
        { columns: ["id"], references: { table: "billing.invoices", columns: ["id"] } },
      ],
    }),
    table("my table"),
    table("my-table"),
    table("a b"),
    table("a_b"),
    table("empty", { columns: [], primaryKey: [] }),
  ];
  await expectValidMermaid(render({ tables }));
  await expectValidMermaid(render({ tables }, { indexes: true }));
  await expectValidMermaid(render({ tables: [] }));
});

test("the check rejects what mermaid cannot read", async () => {
  await expect(expectValidMermaid("erDiagram\n    t {\n        a b c d e\n    }\n")).rejects.toThrow();
});
