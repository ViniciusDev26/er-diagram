import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { MySQLAdapter } from "../../src/adapters/mysql-adapter";
import { MermaidGenerator } from "../../src/generators/mermaid-generator";
import { mysqlConfig } from "../helpers/test-config";
import {
  assertSchemaHasBasicStructure,
  assertTableExists,
  assertColumnIsPrimaryKey,
  assertColumnIsForeignKey,
  assertRelationshipExists,
  assertMermaidDiagramValid,
  assertMermaidContainsTable,
} from "../helpers/assertions";

describe("MySQL Integration Tests", () => {
  let adapter: MySQLAdapter;

  beforeAll(async () => {
    adapter = new MySQLAdapter(mysqlConfig);
    await adapter.connect();
  });

  afterAll(async () => {
    await adapter.disconnect();
  });

  test("should connect to MySQL database", async () => {
    expect(adapter).toBeDefined();
  });

  test("should extract schema from database", async () => {
    const schema = await adapter.getSchema(["flyway_schema_history", "audit_log"]);

    expect(schema).toBeDefined();
    expect(schema.tables).toBeDefined();
    expect(schema.enums).toBeDefined();
    expect(schema.relationships).toBeDefined();
    expect(schema.enumRelationships).toBeDefined();
  });

  test("should have basic schema structure", async () => {
    const schema = await adapter.getSchema(["flyway_schema_history", "audit_log"]);
    assertSchemaHasBasicStructure(schema);
  });

  test("should extract all expected tables", async () => {
    const schema = await adapter.getSchema(["flyway_schema_history", "audit_log"]);

    const expectedTables = ["users", "products", "orders", "order_items", "payments", "addresses", "reviews"];

    for (const tableName of expectedTables) {
      assertTableExists(schema, tableName);
    }

    // Should not include excluded tables
    expect(schema.tables.find((t) => t.name === "audit_log")).toBeUndefined();
  });

  test("should extract ENUM column definitions correctly", async () => {
    const schema = await adapter.getSchema(["flyway_schema_history", "audit_log"]);

    // MySQL ENUMs are column-specific, so they appear as {table}_{column}_enum
    const usersStatusEnum = schema.enums.find((e) => e.name.includes("users_status"));
    expect(usersStatusEnum).toBeDefined();
    expect(usersStatusEnum?.values).toContain("active");
    expect(usersStatusEnum?.values).toContain("inactive");
    expect(usersStatusEnum?.values).toContain("suspended");

    const ordersStatusEnum = schema.enums.find((e) => e.name.includes("orders_status"));
    expect(ordersStatusEnum).toBeDefined();
    expect(ordersStatusEnum?.values).toContain("pending");
    expect(ordersStatusEnum?.values).toContain("processing");
    expect(ordersStatusEnum?.values).toContain("shipped");
    expect(ordersStatusEnum?.values).toContain("delivered");
    expect(ordersStatusEnum?.values).toContain("cancelled");

    const paymentsMethodEnum = schema.enums.find((e) => e.name.includes("payments_payment_method"));
    expect(paymentsMethodEnum).toBeDefined();
    expect(paymentsMethodEnum?.values).toContain("credit_card");
    expect(paymentsMethodEnum?.values).toContain("debit_card");
    expect(paymentsMethodEnum?.values).toContain("pix");
    expect(paymentsMethodEnum?.values).toContain("boleto");
  });

  test("should identify primary keys correctly", async () => {
    const schema = await adapter.getSchema(["flyway_schema_history", "audit_log"]);

    assertColumnIsPrimaryKey(schema, "users", "id");
    assertColumnIsPrimaryKey(schema, "products", "id");
    assertColumnIsPrimaryKey(schema, "orders", "id");
    assertColumnIsPrimaryKey(schema, "order_items", "id");
    assertColumnIsPrimaryKey(schema, "payments", "id");
  });

  test("should identify foreign keys correctly", async () => {
    const schema = await adapter.getSchema(["flyway_schema_history", "audit_log"]);

    assertColumnIsForeignKey(schema, "orders", "user_id");
    assertColumnIsForeignKey(schema, "order_items", "order_id");
    assertColumnIsForeignKey(schema, "order_items", "product_id");
    assertColumnIsForeignKey(schema, "payments", "order_id");
    assertColumnIsForeignKey(schema, "addresses", "user_id");
    assertColumnIsForeignKey(schema, "reviews", "product_id");
    assertColumnIsForeignKey(schema, "reviews", "user_id");
  });

  test("should identify relationships correctly", async () => {
    const schema = await adapter.getSchema(["flyway_schema_history", "audit_log"]);

    const usersOrdersRel = assertRelationshipExists(schema, "users", "orders");
    expect(usersOrdersRel.type).toBe("identifying"); // CASCADE

    const ordersOrderItemsRel = assertRelationshipExists(schema, "orders", "order_items");
    expect(ordersOrderItemsRel.type).toBe("identifying"); // CASCADE

    const productsOrderItemsRel = assertRelationshipExists(schema, "products", "order_items");
    expect(productsOrderItemsRel.type).toBe("non-identifying"); // RESTRICT
  });

  test("should identify ENUM relationships correctly", async () => {
    const schema = await adapter.getSchema(["flyway_schema_history", "audit_log"]);

    const usersEnumRel = schema.enumRelationships.find((r) => r.table === "users");
    expect(usersEnumRel).toBeDefined();
    expect(usersEnumRel?.enumType).toContain("users_status");

    const ordersEnumRel = schema.enumRelationships.find((r) => r.table === "orders");
    expect(ordersEnumRel).toBeDefined();
    expect(ordersEnumRel?.enumType).toContain("orders_status");

    const paymentsEnumRel = schema.enumRelationships.find((r) => r.table === "payments");
    expect(paymentsEnumRel).toBeDefined();
    expect(paymentsEnumRel?.enumType).toContain("payments_payment_method");
  });

  test("should generate valid Mermaid diagram", async () => {
    const schema = await adapter.getSchema(["flyway_schema_history", "audit_log"]);
    const generator = new MermaidGenerator();
    const diagram = generator.generate(schema);

    assertMermaidDiagramValid(diagram);
  });

  test("Mermaid diagram should contain all tables", async () => {
    const schema = await adapter.getSchema(["flyway_schema_history", "audit_log"]);
    const generator = new MermaidGenerator();
    const diagram = generator.generate(schema);

    assertMermaidContainsTable(diagram, "users");
    assertMermaidContainsTable(diagram, "products");
    assertMermaidContainsTable(diagram, "orders");
    assertMermaidContainsTable(diagram, "order_items");
    assertMermaidContainsTable(diagram, "payments");
  });

  test("Mermaid diagram should contain ENUM definitions", async () => {
    const schema = await adapter.getSchema(["flyway_schema_history", "audit_log"]);
    const generator = new MermaidGenerator();
    const diagram = generator.generate(schema);

    // MySQL ENUMs are named as {table}_{column}_enum
    expect(diagram).toContain("users_status_enum (ENUM)");
    expect(diagram).toContain("orders_status_enum (ENUM)");
    expect(diagram).toContain("payments_payment_method_enum (ENUM)");
  });

  test("Mermaid diagram should contain key indicators", async () => {
    const schema = await adapter.getSchema(["flyway_schema_history", "audit_log"]);
    const generator = new MermaidGenerator();
    const diagram = generator.generate(schema);

    expect(diagram).toContain("id int PK");
    expect(diagram).toContain("user_id int FK");
    expect(diagram).toContain("email varchar(255) UK");
  });

  test("Mermaid diagram should contain relationships", async () => {
    const schema = await adapter.getSchema(["flyway_schema_history", "audit_log"]);
    const generator = new MermaidGenerator();
    const diagram = generator.generate(schema);

    expect(diagram).toContain("users ||--o{ orders");
    expect(diagram).toContain("orders ||--o{ order_items");
    expect(diagram).toContain("products ||..o{ order_items");
  });

  test("should handle column types correctly", async () => {
    const schema = await adapter.getSchema(["flyway_schema_history", "audit_log"]);

    const usersTable = assertTableExists(schema, "users");
    const emailColumn = usersTable.columns.find((c) => c.name === "email");
    expect(emailColumn).toBeDefined();
    expect(emailColumn?.type).toContain("varchar");

    const productsTable = assertTableExists(schema, "products");
    const priceColumn = productsTable.columns.find((c) => c.name === "price");
    expect(priceColumn).toBeDefined();
    expect(priceColumn?.type).toContain("decimal");
  });
});
