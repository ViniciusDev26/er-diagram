import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { ReadmeWriter } from "../../src/writers/readme-writer";
import { unlink } from "node:fs/promises";

const TEST_README_PATH = "./test-readme.md";
const TEST_DIAGRAM = `erDiagram
    users {
        id integer PK
        name varchar
    }`;

describe("ReadmeWriter Integration Tests", () => {
  afterEach(async () => {
    // Clean up test file after each test
    try {
      await unlink(TEST_README_PATH);
    } catch {
      // File doesn't exist, ignore
    }
  });

  test("should create new README with diagram when file doesn't exist", async () => {
    const writer = new ReadmeWriter(TEST_README_PATH);
    await writer.writeDiagram(TEST_DIAGRAM);

    const content = await Bun.file(TEST_README_PATH).text();

    expect(content).toContain("# Database Documentation");
    expect(content).toContain("<!-- ER_DIAGRAM_START -->");
    expect(content).toContain("<!-- ER_DIAGRAM_END -->");
    expect(content).toContain("```mermaid");
    expect(content).toContain(TEST_DIAGRAM);
  });

  test("should replace diagram when markers exist", async () => {
    // Create initial README with markers
    const initialContent = `# My Database

Some documentation here.

<!-- ER_DIAGRAM_START -->
\`\`\`mermaid
erDiagram
    old_table {
        id integer
    }
\`\`\`
<!-- ER_DIAGRAM_END -->

More content here.`;

    await Bun.write(TEST_README_PATH, initialContent);

    const writer = new ReadmeWriter(TEST_README_PATH);
    await writer.writeDiagram(TEST_DIAGRAM);

    const content = await Bun.file(TEST_README_PATH).text();

    expect(content).toContain("# My Database");
    expect(content).toContain("Some documentation here.");
    expect(content).toContain("More content here.");
    expect(content).toContain(TEST_DIAGRAM);
    expect(content).not.toContain("old_table");
  });

  test("should append diagram when no markers exist", async () => {
    const initialContent = `# My Database

This is my existing documentation.`;

    await Bun.write(TEST_README_PATH, initialContent);

    const writer = new ReadmeWriter(TEST_README_PATH);
    await writer.writeDiagram(TEST_DIAGRAM);

    const content = await Bun.file(TEST_README_PATH).text();

    expect(content).toContain("# My Database");
    expect(content).toContain("This is my existing documentation.");
    expect(content).toContain("## Database ER Diagram");
    expect(content).toContain("<!-- ER_DIAGRAM_START -->");
    expect(content).toContain("<!-- ER_DIAGRAM_END -->");
    expect(content).toContain(TEST_DIAGRAM);
  });

  test("should preserve content before and after markers", async () => {
    const beforeContent = "# Header\n\nBefore diagram\n\n";
    const afterContent = "\n\nAfter diagram\n\n## Section\n\nMore text";

    const initialContent = `${beforeContent}<!-- ER_DIAGRAM_START -->
\`\`\`mermaid
old diagram
\`\`\`
<!-- ER_DIAGRAM_END -->${afterContent}`;

    await Bun.write(TEST_README_PATH, initialContent);

    const writer = new ReadmeWriter(TEST_README_PATH);
    await writer.writeDiagram(TEST_DIAGRAM);

    const content = await Bun.file(TEST_README_PATH).text();

    expect(content).toContain("Before diagram");
    expect(content).toContain("After diagram");
    expect(content).toContain("## Section");
    expect(content).toContain(TEST_DIAGRAM);
    expect(content).not.toContain("old diagram");
  });

  test("should format diagram correctly with mermaid code block", async () => {
    const writer = new ReadmeWriter(TEST_README_PATH);
    await writer.writeDiagram(TEST_DIAGRAM);

    const content = await Bun.file(TEST_README_PATH).text();

    expect(content).toContain("```mermaid");
    expect(content).toContain(TEST_DIAGRAM);
    expect(content).toContain("```");
  });

  test("should handle multiple diagram updates", async () => {
    const writer = new ReadmeWriter(TEST_README_PATH);

    // First write
    await writer.writeDiagram(TEST_DIAGRAM);
    let content = await Bun.file(TEST_README_PATH).text();
    expect(content).toContain("users");

    // Second write with different diagram
    const newDiagram = `erDiagram
    products {
        id integer PK
        name varchar
    }`;

    await writer.writeDiagram(newDiagram);
    content = await Bun.file(TEST_README_PATH).text();

    expect(content).toContain("products");
    expect(content).not.toContain("users");
  });

  test("should create valid markdown structure", async () => {
    const writer = new ReadmeWriter(TEST_README_PATH);
    await writer.writeDiagram(TEST_DIAGRAM);

    const content = await Bun.file(TEST_README_PATH).text();

    // Check for proper markdown structure
    expect(content).toMatch(/^# Database Documentation/);
    expect(content).toContain("## ER Diagram");
    expect(content).toMatch(/```mermaid[\s\S]*```/);
  });

  test("should handle empty diagram gracefully", async () => {
    const writer = new ReadmeWriter(TEST_README_PATH);
    await writer.writeDiagram("");

    const content = await Bun.file(TEST_README_PATH).text();

    expect(content).toContain("<!-- ER_DIAGRAM_START -->");
    expect(content).toContain("<!-- ER_DIAGRAM_END -->");
  });
});
