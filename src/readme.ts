const START = "<!-- ER_DIAGRAM_START -->";
const END = "<!-- ER_DIAGRAM_END -->";

/**
 * The README with the diagram between its markers. Without markers, the diagram goes at the end
 * under a heading of its own (outside the markers, so updates keep it); without a README, one is
 * created.
 */
export function embed(readme: string | undefined, diagram: string): string {
  const block = `${START}\n\`\`\`mermaid\n${diagram}\`\`\`\n${END}`;
  if (readme === undefined) return `# Database\n\n${block}\n`;
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (start === -1 && end === -1) {
    return `${readme.trimEnd()}\n\n## Database diagram\n\n${block}\n`;
  }
  if (start === -1 || end < start) {
    throw new Error(`the README needs ${START} before ${END}, around the diagram`);
  }
  return readme.slice(0, start) + block + readme.slice(end + END.length);
}
