# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a GitHub Action that generates Entity-Relationship (ER) diagrams in Mermaid format from PostgreSQL and MySQL databases. It extracts database schema metadata including tables, columns, foreign keys, and ENUM types, then creates a visual diagram that can be embedded in documentation.

## Key Commands

### Running the Diagram Generator

```bash
# Install dependencies (first time only)
bun install

# PostgreSQL
DB_TYPE=postgresql DB_HOST=localhost DB_PORT=5432 DB_NAME=your_db DB_USER=your_user DB_PASS=your_pass \
  bun run generate-pg-diagram.ts

# MySQL
DB_TYPE=mysql DB_HOST=localhost DB_PORT=3306 DB_NAME=your_db DB_USER=your_user DB_PASS=your_pass \
  bun run generate-pg-diagram.ts

# Or using npm script
DB_TYPE=postgresql DB_HOST=localhost DB_PORT=5432 DB_NAME=your_db DB_USER=your_user DB_PASS=your_pass \
  bun run generate
```

### Testing the Action Locally

The action expects these environment variables:
- `DB_TYPE` - Database type: `postgresql` or `mysql` (default: postgresql)
- `DB_HOST` - Database host (default: localhost)
- `DB_PORT` - Database port (default: 5432)
- `DB_NAME` - Database name (required)
- `DB_USER` - Database user (required)
- `DB_PASS` - Database password (required)
- `OUTPUT_DIR` - Directory where the diagram will be saved (default: docs)
- `WRITE_TO_README` - Whether to write the diagram to the README file (default: false)
- `README_PATH` - Path to the README file (default: README.md)
- `EXCLUDED_TABLES` - Comma-separated list of table names to exclude (default: flyway_schema_history)

## Architecture

The project follows a modular architecture with clear separation of concerns, designed to be extensible for multiple database systems in the future.

### Module Structure

```
src/
├── types/
│   └── database-adapter.ts      # Database adapter interface and type definitions
├── adapters/
│   ├── postgresql-adapter.ts    # PostgreSQL-specific implementation
│   └── mysql-adapter.ts         # MySQL-specific implementation
├── generators/
│   └── mermaid-generator.ts     # Mermaid diagram generation logic
├── writers/
│   └── readme-writer.ts         # README file update logic
├── config/
│   └── sql-connection.ts        # Database connection configuration
├── env.ts                       # Environment variable validation
└── generate-pg-diagram.ts       # Main orchestration script
```

### Core Components

#### 1. Database Adapter Interface (`types/database-adapter.ts`)

Defines the contract for database adapters:
- `DatabaseAdapter` interface with `connect()`, `disconnect()`, and `getSchema()` methods
- Type definitions for `EnumType`, `Column`, `Table`, `Relationship`, `EnumRelationship`
- `DatabaseSchema` structure that normalizes schema data from any database

#### 2. PostgreSQL Adapter (`adapters/postgresql-adapter.ts`)

Implements `DatabaseAdapter` for PostgreSQL:
- **Connection Management**: Handles PostgreSQL connection internally using `postgres` library
- **Configuration**: Accepts `PostgreSQLConfig` with host, port, database, username, and password
- **ENUM Extraction**: Queries `pg_type` to find all user-defined ENUM types and their values
- **Table Discovery**: Retrieves all tables from the public schema (excluding specified tables)
- **Column Metadata**: Queries `information_schema.columns` with proper data type formatting (varchar, numeric, etc.)
- **Constraint Detection**: Determines primary keys (PK), foreign keys (FK), and unique keys (UK) via `pg_index` and constraints
- **Relationship Mapping**: Extracts foreign key relationships with CASCADE detection
- **ENUM Relationships**: Identifies connections between tables and ENUM types via `USER-DEFINED` columns

#### 3. Mermaid Generator (`generators/mermaid-generator.ts`)

Database-agnostic diagram generation:
- Takes normalized `DatabaseSchema` and produces Mermaid ER diagram syntax
- Renders ENUMs as pseudo-entities
- Formats tables with columns and key indicators (PK, FK, UK)
- Generates relationship syntax:
  - `||--o{` for identifying relationships (CASCADE)
  - `||..o{` for non-identifying relationships (non-CASCADE)
  - `}o--||` for ENUM usage

#### 4. README Writer (`writers/readme-writer.ts`)

Handles README file integration:
- Creates new README if it doesn't exist
- Updates existing README with diagram markers (`<!-- ER_DIAGRAM_START -->` / `<!-- ER_DIAGRAM_END -->`)
- Appends diagram if markers don't exist

#### 5. MySQL Adapter (`adapters/mysql-adapter.ts`)

Implements `DatabaseAdapter` for MySQL:
- **Connection Management**: Handles MySQL connection using `mysql2/promise` library
- **Configuration**: Accepts `MySQLConfig` with host, port, database, user, and password
- **ENUM Extraction**: Extracts ENUM column definitions (MySQL ENUMs are column-specific, not standalone types)
- **Table Discovery**: Retrieves all tables from the specified database (excluding specified tables)
- **Column Metadata**: Queries `INFORMATION_SCHEMA.COLUMNS` with proper data type formatting (varchar, decimal, enum, etc.)
- **Constraint Detection**: Determines primary keys, foreign keys, and unique keys via `INFORMATION_SCHEMA`
- **Relationship Mapping**: Extracts foreign key relationships with CASCADE detection
- **ENUM Relationships**: Identifies connections between tables and ENUM columns

#### 6. Main Script (`generate-pg-diagram.ts`)

Orchestrates the entire process:
1. Creates adapter instance based on `DB_TYPE` environment variable using a Record-based factory
2. Connects to database via adapter
3. Retrieves normalized schema via adapter
4. Generates Mermaid diagram from schema
5. Writes diagram to `.mmd` file
6. Optionally updates README file
7. Handles cleanup and error cases

### Output Files

- `docs/database-er-diagram.mmd` - Standalone Mermaid diagram file
- `README.md` (optional) - Updated with embedded diagram

### GitHub Action Interface

The `action.yml` defines inputs for database connection parameters and uses Bun to execute the TypeScript script. The action inputs use kebab-case and are mapped to environment variables:
- `db-type` → `DB_TYPE` (postgresql or mysql)
- `db-host` → `DB_HOST`
- `db-port` → `DB_PORT`
- `db-name` → `DB_NAME`
- `db-user` → `DB_USER`
- `db-pass` → `DB_PASS`
- `output-dir` → `OUTPUT_DIR`
- `write-to-readme` → `WRITE_TO_README`
- `readme-path` → `README_PATH`
- `excluded-tables` → `EXCLUDED_TABLES`

The action workflow:
1. Sets up Bun runtime using `oven-sh/setup-bun@v2`
2. Installs dependencies with `bun install` (includes both `postgres` and `mysql2`)
3. Runs the diagram generator with `bun run generate-pg-diagram.ts`

## Important Details

- **PostgreSQL**: Uses `postgres` library for type-safe database queries, targets the `public` schema only
- **MySQL**: Uses `mysql2/promise` library, queries `INFORMATION_SCHEMA` for metadata
- **ENUM Handling**:
  - PostgreSQL: ENUMs are standalone types in `pg_type`
  - MySQL: ENUMs are column-specific definitions extracted from `COLUMN_TYPE`
- Environment variables are validated using Zod schema in `src/env.ts`
- The `flyway_schema_history` table is excluded by default (configurable via `EXCLUDED_TABLES`)
- Relationship cardinality in Mermaid is determined by the DELETE rule: CASCADE = identifying, others = non-identifying
- Bun Shell (`$`) is used for directory creation (`mkdir -p`)
- The script can optionally integrate the diagram into README files between markers

## Extending to Other Databases

To add support for another database system (e.g., SQL Server, Oracle):

1. **Install the database client library**:
   ```bash
   bun add <database-client-library>
   ```

2. **Create a new adapter** in `src/adapters/` that implements the `DatabaseAdapter` interface
   - Define a configuration interface (e.g., `SQLServerConfig`) with necessary connection parameters
   - The adapter should manage its own database connection internally

3. **Implement the required methods**:
   - `connect()`: Establish database connection using the provided configuration
   - `disconnect()`: Clean up connection
   - `getSchema(excludedTables)`: Return normalized `DatabaseSchema` with ENUMs, tables, columns, relationships

4. **Update `src/env.ts`** to add the new database type to the `DB_TYPE` enum:
   ```typescript
   DB_TYPE: z.enum(["postgresql", "mysql", "sqlserver"]).optional().default("postgresql")
   ```

5. **Update the main script** `generate-pg-diagram.ts` to include the new adapter in the Record:
   ```typescript
   const adapters: Record<typeof env.DB_TYPE, DatabaseAdapter> = {
     postgresql: new PostgreSQLAdapter({ ... }),
     mysql: new MySQLAdapter({ ... }),
     sqlserver: new SQLServerAdapter({ ... }),
   };
   ```

6. **Update `action.yml`** description to include the new database type

The `MermaidGenerator` and `ReadmeWriter` modules are already database-agnostic and will work with any adapter that returns a properly formatted `DatabaseSchema`.
