import type { DatabaseSchema } from "../types/database-adapter";

export class MermaidGenerator {
  generate(schema: DatabaseSchema): string {
    let diagram = "erDiagram\n";

    // Add ENUMs
    diagram += this.generateEnums(schema.enums);

    // Add Tables
    diagram += this.generateTables(schema.tables);

    diagram += "\n";

    // Add Relationships
    diagram += this.generateRelationships(schema.relationships);

    // Add ENUM Relationships
    diagram += this.generateEnumRelationships(schema.enumRelationships);

    return diagram;
  }

  private generateEnums(enums: DatabaseSchema["enums"]): string {
    if (enums.length === 0) return "";

    let result = "";

    for (const enumType of enums) {
      result += `\n    "${enumType.name} (ENUM)" {\n`;

      for (const value of enumType.values) {
        result += `        ${value} string\n`;
      }

      result += "    }\n";
    }

    return result;
  }

  private generateTables(tables: DatabaseSchema["tables"]): string {
    let result = "";

    for (const table of tables) {
      result += `\n    ${table.name} {\n`;

      for (const column of table.columns) {
        const keyIndicator = this.getKeyIndicator(column);
        const cleanType = this.cleanType(column.type);

        result += `        ${column.name} ${cleanType}${keyIndicator}\n`;
      }

      // Add indexes if available
      if (table.indexes && table.indexes.length > 0) {
        result += "\n";
        for (const index of table.indexes) {
          const indexType = index.isUnique ? "UNIQUE INDEX" : "INDEX";
          const columns = index.columns.join(", ");
          result += `        string "${indexType}: ${index.name} (${columns})"\n`;
        }
      }

      result += "    }\n";
    }

    return result;
  }

  private getKeyIndicator(column: DatabaseSchema["tables"][0]["columns"][0]): string {
    if (column.isPrimaryKey) {
      return " PK";
    } else if (column.isForeignKey) {
      return " FK";
    } else if (column.isUnique) {
      return " UK";
    }
    return "";
  }

  private cleanType(type: string): string {
    return type
      .replace(/NULL/g, "")
      .replace(/,/g, "_")
      .replace(/\s+/g, "_")
      .trim();
  }

  private generateRelationships(relationships: DatabaseSchema["relationships"]): string {
    if (relationships.length === 0) return "";

    let result = "";

    for (const rel of relationships) {
      if (rel.type === "identifying") {
        // Strong relationship (CASCADE)
        result += `    ${rel.fromTable} ||--o{ ${rel.toTable} : "has"\n`;
      } else {
        // Weak relationship (non-CASCADE)
        result += `    ${rel.fromTable} ||..o{ ${rel.toTable} : "references"\n`;
      }
    }

    return result;
  }

  private generateEnumRelationships(enumRelationships: DatabaseSchema["enumRelationships"]): string {
    if (enumRelationships.length === 0) return "";

    let result = "\n";

    for (const rel of enumRelationships) {
      result += `    ${rel.table} }o--|| "${rel.enumType} (ENUM)" : "uses"\n`;
    }

    return result;
  }
}
