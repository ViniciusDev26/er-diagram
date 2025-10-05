# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a GitHub Action that generates Entity-Relationship (ER) diagrams in Mermaid format from PostgreSQL databases. It extracts database schema metadata including tables, columns, foreign keys, and ENUM types, then creates a visual diagram that can be embedded in documentation.

## Key Commands

### Running the Diagram Generator

```bash
# Install dependencies (first time only)
bun install

# Run the script with database connection parameters
PGHOST=localhost PGPORT=5432 PGDATABASE=your_db PGUSER=your_user PGPASSWORD=your_pass \
  bun run generate-pg-diagram.ts

# Or using npm script
PGHOST=localhost PGPORT=5432 PGDATABASE=your_db PGUSER=your_user PGPASSWORD=your_pass \
  bun run generate
```

### Testing the Action Locally

The action expects these environment variables:
- `PGHOST` - PostgreSQL host (default: localhost)
- `PGPORT` - PostgreSQL port (default: 5432)
- `PGDATABASE` - Database name (required)
- `PGUSER` - Database user (required)
- `PGPASSWORD` - Database password (required)

## Architecture

### Core Script: generate-pg-diagram.ts

The TypeScript script using Bun performs the following operations in sequence:

1. **Database Connection**: Uses the `postgres` library to connect to PostgreSQL with credentials from environment variables

2. **ENUM Extraction**: Queries `pg_type` to find all user-defined ENUM types and their values, rendering them as pseudo-entities in the diagram

3. **Table Discovery**: Retrieves all tables from the public schema (excluding Flyway history), then for each table:
   - Queries `information_schema.columns` for column metadata
   - Determines primary keys (PK), foreign keys (FK), and unique keys (UK) via `pg_index` and constraints
   - Formats data types with proper precision/scale information

4. **Relationship Mapping**:
   - Queries `information_schema.table_constraints` and `referential_constraints` to find foreign key relationships
   - Distinguishes CASCADE relationships (identifying, rendered as `||--o{`) from non-CASCADE (non-identifying, rendered as `||..o{`)

5. **ENUM Relationships**: Connects tables to ENUM types via `USER-DEFINED` columns

6. **File Output**: Writes the Mermaid diagram to `docs/database-er-diagram.mmd` using Bun's native file API

### Output Files

- `docs/database-er-diagram.mmd` - Standalone Mermaid diagram file

### GitHub Action Interface

The `action.yml` defines inputs for database connection parameters and uses Bun to execute the TypeScript script. The action:
1. Sets up Bun runtime using `oven-sh/setup-bun@v2`
2. Installs dependencies with `bun install`
3. Runs the diagram generator with `bun run generate-pg-diagram.ts`

## Important Details

- Uses `postgres` library for type-safe database queries
- All queries target the `public` schema only
- The `flyway_schema_history` table is explicitly excluded from the diagram
- Relationship cardinality in Mermaid is determined by the DELETE rule: CASCADE = identifying, others = non-identifying
- Bun Shell (`$`) is used for directory creation (`mkdir -p`)
- The script exports only the `.mmd` file (no README integration)
