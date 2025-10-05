# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a GitHub Action that generates Entity-Relationship (ER) diagrams in Mermaid format from PostgreSQL and MySQL databases. It extracts database schema metadata including tables, columns, foreign keys, and ENUM types, then creates a visual diagram that can be embedded in documentation.

## Key Commands

### Running the Diagram Generator

```bash
# Install dependencies (first time only)
bun install

# Start test databases (optional)
docker compose up -d

# PostgreSQL (using docker-compose database)
DB_TYPE=postgresql DB_HOST=localhost DB_PORT=5432 DB_NAME=er-diagram DB_USER=postgres DB_PASS=postgres \
  bun run generate-diagram.ts

# MySQL (using docker-compose database)
DB_TYPE=mysql DB_HOST=localhost DB_PORT=3306 DB_NAME=er-diagram DB_USER=mysql DB_PASS=mysql \
  bun run generate-diagram.ts

# Or using npm script
DB_TYPE=postgresql DB_HOST=localhost DB_PORT=5432 DB_NAME=er-diagram DB_USER=postgres DB_PASS=postgres \
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
- `SHOW_INDEXES` - Whether to show database indexes in the diagram (default: true)
- `AUTO_COMMIT` - Automatically commit and push changes to the repository (default: false)
- `COMMIT_MESSAGE` - Commit message for auto-commit (default: "docs: update ER diagram [skip ci]")
- `COMMIT_AUTHOR_NAME` - Author name for the commit (default: "github-actions[bot]")
- `COMMIT_AUTHOR_EMAIL` - Author email for the commit (default: "41898282+github-actions[bot]@users.noreply.github.com")

### Running Integration Tests

The project uses Bun's built-in test runner for integration tests:

```bash
# Start test databases
docker compose up -d

# Run all integration tests
bun test

# Run specific database tests
bun run test:postgresql
bun run test:mysql

# Run tests in watch mode
bun run test:watch
```

**Test Structure:**

- `tests/integration/postgresql.test.ts` - PostgreSQL adapter tests
- `tests/integration/mysql.test.ts` - MySQL adapter tests
- `tests/integration/auto-commit.test.ts` - Git auto-commit tests
- `tests/helpers/assertions.ts` - Reusable test assertions
- `tests/helpers/test-config.ts` - Test database configurations

**What is Tested:**

- Database connection and schema extraction
- ENUM type extraction (native types vs column ENUMs)
- Table, column, and constraint detection
- Primary keys, foreign keys, unique keys, and indexes
- Relationship mapping with CASCADE detection
- Mermaid diagram generation and validation
- Proper handling of excluded tables
- Index extraction and rendering (when enabled)
- Git commit and push automation

## Architecture

The project follows a modular architecture with clear separation of concerns, designed to be extensible for multiple database systems in the future.

### Module Structure

```text
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
├── git/
│   └── committer.ts             # Git commit and push automation
├── env.ts                       # Environment variable validation
└── generate-diagram.ts          # Main orchestration script
```

### Core Components

#### 1. Database Adapter Interface (`types/database-adapter.ts`)

Defines the contract for database adapters:

- `DatabaseAdapter` interface with `connect()`, `disconnect()`, and `getSchema()` methods
- Type definitions for `EnumType`, `Column`, `Table`, `Index`, `Relationship`, `EnumRelationship`
- `DatabaseSchema` structure that normalizes schema data from any database

#### 2. PostgreSQL Adapter (`adapters/postgresql-adapter.ts`)

Implements `DatabaseAdapter` for PostgreSQL:

- **Connection Management**: Handles PostgreSQL connection internally using `postgres` library
- **Configuration**: Accepts `PostgreSQLConfig` with host, port, database, username, and password
- **ENUM Extraction**: Queries `pg_type` to find all user-defined ENUM types and their values
- **Table Discovery**: Retrieves all tables from the public schema (excluding specified tables)
- **Column Metadata**: Queries `information_schema.columns` with proper data type formatting (varchar, numeric, etc.)
- **Constraint Detection**: Determines primary keys (PK), foreign keys (FK), and unique keys (UK) via `pg_index` and constraints
- **Index Extraction**: Queries `pg_index` to find all indexes (excluding PRIMARY keys) with unique/regular detection
- **Relationship Mapping**: Extracts foreign key relationships with CASCADE detection
- **ENUM Relationships**: Identifies connections between tables and ENUM types via `USER-DEFINED` columns

#### 3. Mermaid Generator (`generators/mermaid-generator.ts`)

Database-agnostic diagram generation:

- Takes normalized `DatabaseSchema` and produces Mermaid ER diagram syntax
- Renders ENUMs as pseudo-entities
- Formats tables with columns and key indicators (PK, FK, UK)
- Renders indexes when `showIndexes` is true (INDEX: name (columns), UNIQUE INDEX: name (columns))
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
- **Index Extraction**: Queries `INFORMATION_SCHEMA.STATISTICS` to find all indexes (excluding PRIMARY keys)
- **Relationship Mapping**: Extracts foreign key relationships with CASCADE detection
- **ENUM Relationships**: Identifies connections between tables and ENUM columns

#### 6. Git Committer (`git/committer.ts`)

Handles automatic git commit and push:

- **Configuration**: Accepts files, commit message, author name and email
- **Change Detection**: Checks if files have uncommitted changes using `git status`
- **Git Setup**: Configures git user name and email
- **Staging**: Adds specified files to git staging area
- **Commit**: Creates commit with custom message
- **Push**: Pushes changes to remote repository

#### 7. Main Script (`generate-diagram.ts`)

Orchestrates the entire process:

1. Creates adapter instance based on `DB_TYPE` environment variable using a Record-based factory
2. Connects to database via adapter
3. Retrieves normalized schema via adapter (with optional index extraction)
4. Generates Mermaid diagram from schema
5. Writes diagram to `.mmd` file
6. Optionally updates README file
7. Optionally commits and pushes changes to git
8. Handles cleanup and error cases

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
- `show-indexes` → `SHOW_INDEXES`
- `auto-commit` → `AUTO_COMMIT`
- `commit-message` → `COMMIT_MESSAGE`
- `commit-author-name` → `COMMIT_AUTHOR_NAME`
- `commit-author-email` → `COMMIT_AUTHOR_EMAIL`

The action workflow:

1. Sets up Bun runtime using `oven-sh/setup-bun@v2`
2. Installs dependencies with `bun install` (includes both `postgres` and `mysql2`)
3. Runs the diagram generator with `bun run generate-diagram.ts`

## Important Details

- **PostgreSQL**: Uses `postgres` library for type-safe database queries, targets the `public` schema only
- **MySQL**: Uses `mysql2/promise` library, queries `INFORMATION_SCHEMA` for metadata
- **ENUM Handling**:
  - PostgreSQL: ENUMs are standalone types in `pg_type`
  - MySQL: ENUMs are column-specific definitions extracted from `COLUMN_TYPE`
- **Index Handling**: Indexes are extracted when `SHOW_INDEXES=true`, excluding PRIMARY key indexes automatically
- **Auto-Commit**: Uses official GitHub Actions bot credentials (`github-actions[bot]` with ID `41898282`)
- Environment variables are validated using Zod schema in `src/env.ts`
- The `flyway_schema_history` table is excluded by default (configurable via `EXCLUDED_TABLES`)
- Relationship cardinality in Mermaid is determined by the DELETE rule: CASCADE = identifying, others = non-identifying
- Bun Shell (`$`) is used for directory creation and git operations
- The script can optionally integrate the diagram into README files between markers
- Git commits include `[skip ci]` tag by default to prevent workflow loops

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
   - `getSchema(excludedTables, showIndexes)`: Return normalized `DatabaseSchema` with ENUMs, tables, columns, indexes, relationships

4. **Update `src/env.ts`** to add the new database type to the `DB_TYPE` enum:

   ```typescript
   DB_TYPE: z.enum(["postgresql", "mysql", "sqlserver"]).optional().default("postgresql")
   ```

5. **Update the main script** `generate-diagram.ts` to include the new adapter in the Record:

   ```typescript
   const adapters: Record<typeof env.DB_TYPE, DatabaseAdapter> = {
     postgresql: new PostgreSQLAdapter({ ... }),
     mysql: new MySQLAdapter({ ... }),
     sqlserver: new SQLServerAdapter({ ... }),
   };
   ```

6. **Update `action.yml`** description to include the new database type

The `MermaidGenerator`, `ReadmeWriter`, and `GitCommitter` modules are already database-agnostic and will work with any adapter that returns a properly formatted `DatabaseSchema`.
