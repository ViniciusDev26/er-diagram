import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PostgreSQLAdapter } from "../../src/adapters/postgresql-adapter";
import { MermaidGenerator } from "../../src/generators/mermaid-generator";
import { postgresConfig } from "../helpers/test-config";
import {
  assertSchemaHasBasicStructure,
  assertTableExists,
  assertEnumExists,
  assertColumnIsPrimaryKey,
  assertColumnIsForeignKey,
  assertRelationshipExists,
  assertMermaidDiagramValid,
  assertMermaidContainsTable,
  assertMermaidContainsEnum,
} from "../helpers/assertions";

describe("PostgreSQL Integration Tests", () => {
  let adapter: PostgreSQLAdapter;

  beforeAll(async () => {
    adapter = new PostgreSQLAdapter(postgresConfig);
    await adapter.connect();
  });

  afterAll(async () => {
    await adapter.disconnect();
  });

  test("should connect to PostgreSQL database", async () => {
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

  test("should extract ENUM types correctly", async () => {
    const schema = await adapter.getSchema(["flyway_schema_history", "audit_log"]);

    const userStatusEnum = assertEnumExists(schema, "user_status");
    expect(userStatusEnum.values).toContain("active");
    expect(userStatusEnum.values).toContain("inactive");
    expect(userStatusEnum.values).toContain("suspended");

    const orderStatusEnum = assertEnumExists(schema, "order_status");
    expect(orderStatusEnum.values).toContain("pending");
    expect(orderStatusEnum.values).toContain("processing");
    expect(orderStatusEnum.values).toContain("shipped");
    expect(orderStatusEnum.values).toContain("delivered");
    expect(orderStatusEnum.values).toContain("cancelled");

    const paymentMethodEnum = assertEnumExists(schema, "payment_method");
    expect(paymentMethodEnum.values).toContain("credit_card");
    expect(paymentMethodEnum.values).toContain("debit_card");
    expect(paymentMethodEnum.values).toContain("pix");
    expect(paymentMethodEnum.values).toContain("boleto");
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
    expect(usersEnumRel?.enumType).toBe("user_status");

    const ordersEnumRel = schema.enumRelationships.find((r) => r.table === "orders");
    expect(ordersEnumRel).toBeDefined();
    expect(ordersEnumRel?.enumType).toBe("order_status");
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

  test("Mermaid diagram should contain all ENUMs", async () => {
    const schema = await adapter.getSchema(["flyway_schema_history", "audit_log"]);
    const generator = new MermaidGenerator();
    const diagram = generator.generate(schema);

    assertMermaidContainsEnum(diagram, "user_status (ENUM)");
    assertMermaidContainsEnum(diagram, "order_status (ENUM)");
    assertMermaidContainsEnum(diagram, "payment_method (ENUM)");
  });

  test("Mermaid diagram should contain key indicators", async () => {
    const schema = await adapter.getSchema(["flyway_schema_history", "audit_log"]);
    const generator = new MermaidGenerator();
    const diagram = generator.generate(schema);

    expect(diagram).toContain("id integer PK");
    expect(diagram).toContain("user_id integer FK");
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
});
