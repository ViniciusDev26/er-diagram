import mermaid from "mermaid";
import { expect } from "vitest";

/** Asserts that Mermaid itself (the library GitHub renders with) reads the diagram. */
export async function expectValidMermaid(diagram: string): Promise<void> {
  const result = await mermaid
    .parse(diagram, { suppressErrors: false })
    .catch((error: unknown) => String(error));
  expect(result, diagram).toMatchObject({ diagramType: "er" });
}
