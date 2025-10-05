export class ReadmeWriter {
  constructor(private readmePath: string) {}

  async writeDiagram(diagram: string): Promise<void> {
    const readmeExists = await Bun.file(this.readmePath).exists();

    if (readmeExists) {
      await this.updateExistingReadme(diagram);
    } else {
      await this.createNewReadme(diagram);
    }
  }

  private async updateExistingReadme(diagram: string): Promise<void> {
    const readmeContent = await Bun.file(this.readmePath).text();
    const hasMarkers =
      readmeContent.includes("<!-- ER_DIAGRAM_START -->") &&
      readmeContent.includes("<!-- ER_DIAGRAM_END -->");

    if (hasMarkers) {
      await this.replaceExistingDiagram(readmeContent, diagram);
    } else {
      await this.appendDiagram(readmeContent, diagram);
    }
  }

  private async replaceExistingDiagram(readmeContent: string, diagram: string): Promise<void> {
    const beforeDiagram = readmeContent.substring(
      0,
      readmeContent.indexOf("<!-- ER_DIAGRAM_START -->")
    );
    const afterDiagram = readmeContent.substring(
      readmeContent.indexOf("<!-- ER_DIAGRAM_END -->") + "<!-- ER_DIAGRAM_END -->".length
    );

    const diagramSection = `<!-- ER_DIAGRAM_START -->\n\`\`\`mermaid\n${diagram}\`\`\`\n<!-- ER_DIAGRAM_END -->`;

    const updatedContent = beforeDiagram + diagramSection + afterDiagram;
    await Bun.write(this.readmePath, updatedContent);
    console.log(`✅ README updated (diagram section replaced): ${this.readmePath}`);
  }

  private async appendDiagram(readmeContent: string, diagram: string): Promise<void> {
    const diagramSection = `\n\n<!-- ER_DIAGRAM_START -->\n## Database ER Diagram\n\n\`\`\`mermaid\n${diagram}\`\`\`\n<!-- ER_DIAGRAM_END -->\n`;
    await Bun.write(this.readmePath, readmeContent + diagramSection);
    console.log(`✅ README updated (diagram appended): ${this.readmePath}`);
  }

  private async createNewReadme(diagram: string): Promise<void> {
    const newReadme = `# Database Documentation\n\n<!-- ER_DIAGRAM_START -->\n## ER Diagram\n\n\`\`\`mermaid\n${diagram}\`\`\`\n<!-- ER_DIAGRAM_END -->\n`;
    await Bun.write(this.readmePath, newReadme);
    console.log(`✅ README created with diagram: ${this.readmePath}`);
  }
}
