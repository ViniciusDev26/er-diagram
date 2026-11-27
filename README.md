# Database ER Diagram Generator

A GitHub Action that generates Entity-Relationship (ER) diagrams in Mermaid format from PostgreSQL and MySQL databases.

- 🗄️ Supports **PostgreSQL** and **MySQL**
- 🔑 Detects Primary Keys, Foreign Keys, Unique Keys, indexes, and ENUM types
- 📝 Can embed the diagram directly into your README
- ⚡ Runs on [Bun](https://bun.sh)

## Quick Start

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
        uses: ViniciusDev26/er-diagram@v1.0.0
        with:
          db-type: postgresql
          db-host: localhost
          db-port: 5432
          db-name: mydb
          db-user: postgres
          db-pass: ${{ secrets.DB_PASSWORD }}
          write-to-readme: true
```

This connects to your database, extracts the schema, and writes a Mermaid ER diagram to `docs/database-er-diagram.mmd` (and to your README if `write-to-readme: true`).

👉 For a full walkthrough with a real schema and sample output, see [`example/README.md`](example/README.md).

## Inputs

| Input                 | Description                                             | Required | Default                                                 |
| --------------------- | ------------------------------------------------------- | -------- | ------------------------------------------------------- |
| `db-type`             | Type of database (`postgresql` or `mysql`)              | No       | `postgresql`                                            |
| `db-host`             | Host of the database                                    | No       | `localhost`                                             |
| `db-port`             | Port of the database                                    | No       | `5432`                                                  |
| `db-name`             | Name of the database                                    | Yes      | -                                                       |
| `db-user`             | User of the database                                    | Yes      | -                                                       |
| `db-pass`             | Password of the database                                | Yes      | -                                                       |
| `output-dir`          | Directory where the diagram will be saved               | No       | `docs`                                                  |
| `write-to-readme`     | Whether to write the diagram to the README file         | No       | `false`                                                 |
| `readme-path`         | Path to the README file                                 | No       | `README.md`                                             |
| `excluded-tables`     | Comma-separated list of table names to exclude          | No       | `flyway_schema_history`                                 |
| `show-indexes`        | Whether to show database indexes in the diagram         | No       | `true`                                                  |
| `auto-commit`         | Automatically commit and push changes to the repository | No       | `false`                                                 |
| `commit-message`      | Commit message for auto-commit                          | No       | `docs: update ER diagram [skip ci]`                     |
| `commit-author-name`  | Author name for the commit                              | No       | `github-actions[bot]`                                   |
| `commit-author-email` | Author email for the commit                             | No       | `41898282+github-actions[bot]@users.noreply.github.com` |

## Local Development

```bash
bun install

DB_TYPE=postgresql DB_HOST=localhost DB_PORT=5432 \
DB_NAME=mydb DB_USER=postgres DB_PASS=secret \
bun run generate
```

See [`CLAUDE.md`](CLAUDE.md) for architecture details, testing instructions, and how to add support for other databases.

## License

[MIT](LICENSE)

## Author

ViniciusDev26
