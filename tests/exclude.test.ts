import { describe, expect, test } from "vitest";
import { tableFilter } from "../src/exclude.ts";

describe("tableFilter", () => {
  test("keeps every table by default", () => {
    expect(tableFilter()("users", "public.users")).toBe(true);
  });

  test("leaves out what exclude matches, by name or qualified name", () => {
    const drawn = tableFilter([], ["audit_*", "billing.*"]);
    expect(drawn("audit_log", "public.audit_log")).toBe(false);
    expect(drawn("invoices", "billing.invoices")).toBe(false);
    expect(drawn("users", "public.users")).toBe(true);
  });

  test("keeps only what include matches, then leaves out what exclude matches", () => {
    const drawn = tableFilter(["order*", "public.users"], ["orders_archive"]);
    expect(drawn("orders", "public.orders")).toBe(true);
    expect(drawn("order_items", "public.order_items")).toBe(true);
    expect(drawn("users", "public.users")).toBe(true);
    expect(drawn("orders_archive", "public.orders_archive")).toBe(false);
    expect(drawn("products", "public.products")).toBe(false);
  });

  test("dots and other characters match themselves", () => {
    expect(tableFilter(["a.b"])("axb", "public.axb")).toBe(false);
  });
});
