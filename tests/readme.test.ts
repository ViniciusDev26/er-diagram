import { describe, expect, test } from "vitest";
import { embed } from "../src/readme.ts";

const diagram = "erDiagram\n    t {\n    }\n";
const block = `<!-- ER_DIAGRAM_START -->\n\`\`\`mermaid\n${diagram}\`\`\`\n<!-- ER_DIAGRAM_END -->`;

describe("embed", () => {
  test("a missing README is created around the diagram", () => {
    expect(embed(undefined, diagram)).toBe(`# Database\n\n${block}\n`);
  });

  test("a README without markers gets a section at the end", () => {
    expect(embed("# App\n\nText.\n", diagram)).toBe(
      `# App\n\nText.\n\n## Database diagram\n\n${block}\n`,
    );
    expect(embed("# App", diagram)).toBe(`# App\n\n## Database diagram\n\n${block}\n`);
  });

  test("the diagram between the markers is replaced, and only it", () => {
    const readme = `# App\n\n## Schema\n\n${block.replace("t {", "old {")}\n\nAfter.\n`;
    const updated = embed(readme, diagram);
    expect(updated).toBe(`# App\n\n## Schema\n\n${block}\n\nAfter.\n`);
    // Running again changes nothing: the heading stays outside the markers.
    expect(embed(updated, diagram)).toBe(updated);
  });

  test("markers out of order are an error, not a guess", () => {
    expect(() => embed("<!-- ER_DIAGRAM_END -->\n<!-- ER_DIAGRAM_START -->\n", diagram)).toThrow(
      /ER_DIAGRAM_START.*before.*ER_DIAGRAM_END/,
    );
    expect(() => embed("<!-- ER_DIAGRAM_START -->\n", diagram)).toThrow(/ER_DIAGRAM_END/);
  });
});
