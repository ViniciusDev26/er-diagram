#!/usr/bin/env bun
import { $ } from "bun";
import { writeArrayToSqlArray } from "./writers/array-to-sql-array";
import { env } from "./env";
import { makeSqlConnection } from "./config/sql-connection";

// Database connection details from environment variables
const EXCLUDED_TABLES = env.EXCLUDED_TABLES;
const OUTPUT_DIR = env.OUTPUT_DIR;
const MERMAID_FILE = `${OUTPUT_DIR}/database-er-diagram.mmd`;
const WRITE_TO_README = env.WRITE_TO_README;
const README_PATH = env.README_PATH;

// Create PostgreSQL connection
const sql = makeSqlConnection();

async function main() {
  try {
    await $`mkdir -p ${OUTPUT_DIR}`;

    console.log("🎨 Generating Mermaid ER diagram...");

    let diagram = "erDiagram\n";

    const enums = await sql<{ enum_name: string }[]>`
      SELECT t.typname AS enum_name
      FROM pg_type t
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typtype = 'e'
      ORDER BY t.typname;
    `;

    if (enums.length > 0) {
      for (const { enum_name } of enums) {
        diagram += `\n    "${enum_name} (ENUM)" {\n`;

        const enumValues = await sql<{ enumlabel: string }[]>`
          SELECT e.enumlabel
          FROM pg_enum e
          JOIN pg_type t ON e.enumtypid = t.oid
          WHERE t.typname = ${enum_name}
          ORDER BY e.enumsortorder;
        `;

        for (const { enumlabel } of enumValues) {
          diagram += `        ${enumlabel} string\n`;
        }

        diagram += "    }\n";
      }
    }

    const tables = await sql<{ tablename: string }[]>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename not in ${writeArrayToSqlArray(EXCLUDED_TABLES)}
      ORDER BY tablename;
    `;

    for (const { tablename: table } of tables) {
      diagram += `\n    ${table} {\n`;

      // Get columns with their types and constraints
      const columns = await sql<{
        column_name: string;
        full_type: string;
        is_nullable: string;
        column_default: string | null;
      }[]>`
        SELECT
          column_name,
          CASE
            WHEN data_type = 'character varying' THEN 'varchar(' || COALESCE(character_maximum_length::text, '') || ')'
            WHEN data_type = 'numeric' AND numeric_precision IS NOT NULL AND numeric_scale IS NOT NULL AND numeric_scale > 0
              THEN 'numeric(' || numeric_precision || ',' || numeric_scale || ')'
            WHEN data_type = 'numeric' AND numeric_precision IS NOT NULL
              THEN 'numeric(' || numeric_precision || ')'
            WHEN data_type = 'numeric' THEN 'numeric'
            WHEN data_type = 'integer' THEN 'integer'
            WHEN data_type = 'USER-DEFINED' THEN udt_name
            ELSE data_type
          END as full_type,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table}
        ORDER BY ordinal_position;
      `;

      for (const { column_name: col_name, full_type: data_type } of columns) {
        // Determine key type
        const isPk = await sql<{ exists: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE i.indrelid = ${'public.' + table}::regclass
              AND i.indisprimary
              AND a.attname = ${col_name}
          );
        `;

        const isFk = await sql<{ exists: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.key_column_usage kcu
            JOIN information_schema.table_constraints tc ON kcu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema = 'public'
              AND tc.table_name = ${table}
              AND kcu.column_name = ${col_name}
          );
        `;

        const isUnique = await sql<{ exists: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.key_column_usage kcu
            JOIN information_schema.table_constraints tc ON kcu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'UNIQUE'
              AND tc.table_schema = 'public'
              AND tc.table_name = ${table}
              AND kcu.column_name = ${col_name}
          );
        `;

        // Build key indicator
        let keyIndicator = "";
        if (isPk[0].exists) {
          keyIndicator = " PK";
        } else if (isFk[0].exists) {
          keyIndicator = " FK";
        } else if (isUnique[0].exists) {
          keyIndicator = " UK";
        }

        // Clean up data type for Mermaid compatibility
        const cleanType = data_type
          .replace(/NULL/g, "")
          .replace(/,/g, "_")
          .replace(/\s+/g, "_")
          .trim();

        diagram += `        ${col_name} ${cleanType}${keyIndicator}\n`;
      }

      diagram += "    }\n";
    }

    diagram += "\n";

    // Get foreign key relationships
    const fkRelationships = await sql<{
      table_name: string;
      foreign_table_name: string;
      delete_rule: string;
    }[]>`
      SELECT DISTINCT
        tc.table_name,
        ccu.table_name AS foreign_table_name,
        rc.delete_rule
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints AS rc
        ON rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name != 'flyway_schema_history'
      ORDER BY tc.table_name;
    `;

    if (fkRelationships.length > 0) {
      for (const { table_name, foreign_table_name, delete_rule } of fkRelationships) {
        if (delete_rule === "CASCADE") {
          // Strong relationship (identifying)
          diagram += `    ${foreign_table_name} ||--o{ ${table_name} : "has"\n`;
        } else {
          // Weak relationship (non-identifying)
          diagram += `    ${foreign_table_name} ||..o{ ${table_name} : "references"\n`;
        }
      }
    }

    // Add relationships between tables and ENUMs
    if (enums.length > 0) {
      diagram += "\n";

      for (const { tablename: table } of tables) {
        // Get columns that use ENUM types
        const enumColumns = await sql<{
          column_name: string;
          enum_type: string;
        }[]>`
          SELECT
            c.column_name,
            c.udt_name as enum_type
          FROM information_schema.columns c
          WHERE c.table_schema = 'public'
            AND c.table_name = ${table}
            AND c.data_type = 'USER-DEFINED'
          ORDER BY c.ordinal_position;
        `;

        if (enumColumns.length > 0) {
          for (const { enum_type } of enumColumns) {
            diagram += `    ${table} }o--|| "${enum_type} (ENUM)" : "uses"\n`;
          }
        }
      }
    }

    // Write the Mermaid file
    await Bun.write(MERMAID_FILE, diagram);
    console.log(`✅ Mermaid diagram with ENUMs generated: ${MERMAID_FILE}`);

    // Write to README if requested
    if (WRITE_TO_README) {
      console.log("📝 Updating README...");

      const readmeExists = await Bun.file(README_PATH).exists();

      if (readmeExists) {
        const readmeContent = await Bun.file(README_PATH).text();
        const hasMarkers = readmeContent.includes("<!-- ER_DIAGRAM_START -->") &&
                          readmeContent.includes("<!-- ER_DIAGRAM_END -->");

        if (hasMarkers) {
          // Replace diagram section
          const beforeDiagram = readmeContent.substring(0, readmeContent.indexOf("<!-- ER_DIAGRAM_START -->"));
          const afterDiagram = readmeContent.substring(readmeContent.indexOf("<!-- ER_DIAGRAM_END -->") + "<!-- ER_DIAGRAM_END -->".length);

          const diagramSection = `<!-- ER_DIAGRAM_START -->\n\`\`\`mermaid\n${diagram}\`\`\`\n<!-- ER_DIAGRAM_END -->`;

          const updatedContent = beforeDiagram + diagramSection + afterDiagram;
          await Bun.write(README_PATH, updatedContent);
          console.log(`✅ README updated (diagram section replaced): ${README_PATH}`);
        } else {
          // Append diagram to end of README
          const diagramSection = `\n\n<!-- ER_DIAGRAM_START -->\n## Database ER Diagram\n\n\`\`\`mermaid\n${diagram}\`\`\`\n<!-- ER_DIAGRAM_END -->\n`;
          await Bun.write(README_PATH, readmeContent + diagramSection);
          console.log(`✅ README updated (diagram appended): ${README_PATH}`);
        }
      } else {
        // Create new README with diagram
        const newReadme = `# Database Documentation\n\n<!-- ER_DIAGRAM_START -->\n## ER Diagram\n\n\`\`\`mermaid\n${diagram}\`\`\`\n<!-- ER_DIAGRAM_END -->\n`;
        await Bun.write(README_PATH, newReadme);
        console.log(`✅ README created with diagram: ${README_PATH}`);
      }
    }

    console.log("🎉 ER diagram with ENUMs generation complete!");

    // Close database connection
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error generating diagram:", error);
    await sql.end();
    process.exit(1);
  }
}

main();
