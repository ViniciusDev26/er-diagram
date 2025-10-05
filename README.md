# PostgreSQL ER Diagram Generator

A GitHub Action that generates Entity-Relationship (ER) diagrams in Mermaid format from PostgreSQL databases. Built with TypeScript and Bun for fast execution.

## Features

- 🎨 Generates Mermaid ER diagrams from PostgreSQL schema
- 🔄 Supports ENUM types as pseudo-entities
- 🔑 Identifies Primary Keys (PK), Foreign Keys (FK), and Unique Keys (UK)
- 📊 Shows relationship cardinality (CASCADE vs non-CASCADE)
- 📝 Optional README integration with diagram embedding
- ⚡ Fast execution with Bun runtime

## Usage

### As a GitHub Action

```yaml
name: Generate ER Diagram

on:
  push:
    branches: [main]

jobs:
  generate-diagram:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Generate ER Diagram
        uses: ViniciusDev26/er-diagram@main
        with:
          pg-host: localhost
          pg-port: 5432
          pg-database: mydb
          pg-user: postgres
          pg-password: ${{ secrets.DB_PASSWORD }}
          write-to-readme: true
          readme-path: docs/README.md
```

### Local Development

```bash
# Install dependencies
bun install

# Run the generator
PGHOST=localhost \
PGPORT=5432 \
PGDATABASE=mydb \
PGUSER=postgres \
PGPASSWORD=secret \
bun run generate

# With README integration
PGHOST=localhost \
PGDATABASE=mydb \
PGUSER=postgres \
PGPASSWORD=secret \
WRITE_TO_README=true \
README_PATH=docs/README.md \
bun run generate-pg-diagram.ts
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `pg-host` | PostgreSQL host | No | `localhost` |
| `pg-port` | PostgreSQL port | No | `5432` |
| `pg-database` | Database name | Yes | - |
| `pg-user` | Database user | Yes | - |
| `pg-password` | Database password | Yes | - |
| `write-to-readme` | Write diagram to README | No | `false` |
| `readme-path` | Path to README file | No | `README.md` |
| `output-dir` | Output directory for .mmd file | No | `docs` |

## Output

The action generates:

- **`docs/database-er-diagram.mmd`** - Standalone Mermaid diagram file
- **README file (optional)** - If `write-to-readme: true`, embeds the diagram between `<!-- ER_DIAGRAM_START -->` and `<!-- ER_DIAGRAM_END -->` markers

## README Integration

When `write-to-readme` is enabled, the action will:

1. **If markers exist**: Replace content between `<!-- ER_DIAGRAM_START -->` and `<!-- ER_DIAGRAM_END -->`
2. **If no markers**: Append diagram to the end of the README
3. **If README doesn't exist**: Create a new README with the diagram

### Markers Example

```markdown
# My Database

## Schema

<!-- ER_DIAGRAM_START -->
```mermaid
erDiagram
  users {
    id integer PK
    email varchar FK
  }
```
<!-- ER_DIAGRAM_END -->
```

## Diagram Features

### Entity Types

- **Tables**: Rendered with all columns and their types
- **ENUMs**: Shown as pseudo-entities with possible values

### Key Indicators

- `PK` - Primary Key
- `FK` - Foreign Key
- `UK` - Unique Key

### Relationship Types

- `||--o{` - Strong/identifying relationship (CASCADE delete)
- `||..o{` - Weak/non-identifying relationship (non-CASCADE delete)
- `}o--||` - Table uses ENUM type

### Excluded Tables

- `flyway_schema_history` - Automatically excluded from diagram

## Development

### Requirements

- Bun >= 1.0
- PostgreSQL database access

### Project Structure

```
.
├── generate-pg-diagram.ts   # Main TypeScript script
├── action.yml               # GitHub Action definition
├── package.json             # Dependencies
├── CLAUDE.md               # AI assistant guidance
└── README.md               # This file
```

### How It Works

1. Connects to PostgreSQL using the `postgres` library
2. Queries database metadata from `information_schema` and `pg_catalog`
3. Extracts ENUMs, tables, columns, and relationships
4. Generates Mermaid diagram syntax
5. Writes to `.mmd` file and optionally updates README

## Example Output

```mermaid
erDiagram
    "status_enum (ENUM)" {
        active string
        inactive string
    }

    users {
        id integer PK
        email varchar UK
        status status_enum
    }

    posts {
        id integer PK
        user_id integer FK
        title varchar
    }

    users ||--o{ posts : "has"
    users }o--|| "status_enum (ENUM)" : "uses"
```

## License

MIT

## Author

ViniciusDev26
