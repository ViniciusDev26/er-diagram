#!/usr/bin/env bun
import { $ } from "bun";
import { env } from "./env";
import { PostgreSQLAdapter } from "./adapters/postgresql-adapter";
import { MySQLAdapter } from "./adapters/mysql-adapter";
import { MermaidGenerator } from "./generators/mermaid-generator";
import { ReadmeWriter } from "./writers/readme-writer";
import type { DatabaseAdapter } from "./types/database-adapter";

// Configuration from environment variables
const EXCLUDED_TABLES = env.EXCLUDED_TABLES;
const OUTPUT_DIR = env.OUTPUT_DIR;
const MERMAID_FILE = `${OUTPUT_DIR}/database-er-diagram.mmd`;
const WRITE_TO_README = env.WRITE_TO_README;
const README_PATH = env.README_PATH;
const SHOW_INDEXES = env.SHOW_INDEXES;

function createAdapter(): DatabaseAdapter {
  const adapters: Record<typeof env.DB_TYPE, DatabaseAdapter> = {
    postgresql: new PostgreSQLAdapter({
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      username: env.DB_USER,
      password: env.DB_PASS,
    }),
    mysql: new MySQLAdapter({
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASS,
    }),
  };

  return adapters[env.DB_TYPE];
}

async function main() {
  const adapter = createAdapter();

  try {
    await $`mkdir -p ${OUTPUT_DIR}`;

    console.log(`🎨 Generating Mermaid ER diagram for ${env.DB_TYPE}...`);

    // Connect to database
    await adapter.connect();

    // Get database schema using adapter
    const schema = await adapter.getSchema(EXCLUDED_TABLES, SHOW_INDEXES);

    // Generate Mermaid diagram
    const generator = new MermaidGenerator();
    const diagram = generator.generate(schema);

    // Write the Mermaid file
    await Bun.write(MERMAID_FILE, diagram);
    console.log(`✅ Mermaid diagram with ENUMs generated: ${MERMAID_FILE}`);

    // Write to README if requested
    if (WRITE_TO_README) {
      console.log("📝 Updating README...");
      const readmeWriter = new ReadmeWriter(README_PATH);
      await readmeWriter.writeDiagram(diagram);
    }

    console.log("🎉 ER diagram with ENUMs generation complete!");

    // Close database connection
    await adapter.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error generating diagram:", error);
    await adapter.disconnect();
    process.exit(1);
  }
}

main();
