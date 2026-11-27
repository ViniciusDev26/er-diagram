<p align="center">
  <img src=".github/assets/banner.png" alt="erdraw: the ER diagram of your database, always current" width="100%">
</p>

# erdraw

**Draws the ER diagram of your PostgreSQL, MySQL or MariaDB database, in Mermaid, into your docs.**
Run it after your migrations and the diagram in the README is always the schema you have. A GitHub
Action, and a command line.

- **Reads the real schema**: tables, columns, primary, foreign and unique keys, enum values, the
  columns' comments and, if you want, indexes. Views, partitions and migration tools' tables are
  left out.
- **Draws real cardinality**: optional or required parent, one-to-one or one-to-many child, and a
  solid line when the foreign key is part of the child's primary key.
- **Writes where you read**: a `.mmd` file and, between two markers, your README. GitHub renders
  Mermaid in Markdown.
- **Keeps itself up to date**: commit the diagram from the workflow when the schema changes, or
  fail a pull request whose diagram is stale with `check: true`.

```mermaid
erDiagram
    coupons {
        text code PK
        integer percent
    }
    events {
        bigint id PK
        date at PK
    }
    order_items {
        integer order_id PK, FK
        integer product_id PK, FK
        integer quantity
    }
    orders {
        integer id PK
        integer user_id FK
        text coupon_code FK
        order_status status "pending, paid, shipped, cancelled"
    }
    products {
        integer id PK
        text name UK
        numeric(10_2) price
    }
    profiles {
        integer user_id PK, FK
        text bio
        text[] tags
    }
    shipments {
        bigint id PK
        integer order_id FK
        integer product_id FK
        timestamp shipped_at
    }
    users {
        integer id PK
        varchar(255) email UK "Where the receipts go"
        text name
        user_status status "active, inactive, suspended"
        integer invited_by FK
        timestamptz created_at
    }
    orders ||--o{ order_items : order_id
    products ||--o{ order_items : product_id
    users ||..o{ orders : user_id
    coupons |o..o{ orders : coupon_code
    users ||--o| profiles : user_id
    order_items ||..o| shipments : "order_id, product_id"
    users |o..o{ users : invited_by
```

<sub>The example schema of the tests, drawn by erdraw: [`tests/fixtures/postgres.sql`](tests/fixtures/postgres.sql).</sub>

## Quick start

Run your migrations against a database service, then draw it. The diagram lands in
`docs/database.mmd` and in the README, and is committed when it changed:

```yaml
name: database diagram

on:
  push:
    branches: [main]

permissions:
  contents: write

jobs:
  diagram:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_PASSWORD: postgres
        ports: ["5432:5432"]
        options: --health-cmd pg_isready --health-interval 2s --health-retries 30
    steps:
      - uses: actions/checkout@v7
      - run: npm ci && npx prisma migrate deploy # or flyway, knex, rails db:migrate...
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/postgres
      - uses: sugomi-dev/erdraw@v5
        with:
          url: postgres://postgres:postgres@localhost:5432/postgres
          readme: README.md
          commit: true
```

Against a database you already have, pass its URL as a secret: `url: ${{ secrets.DATABASE_URL }}`.
To encrypt the connection, add `?sslmode=require` (or `verify-full`, with `ssl-ca` when its CA is not
a public one) to the URL, or set `ssl`.

### Check the diagram in pull requests

`check: true` writes nothing and fails when `docs/database.mmd` (and the README) are not the
diagram of the database, so a pull request that changes the schema also updates its diagram. It
needs no write permission, and works on pull requests from forks:

```yaml
      - uses: sugomi-dev/erdraw@v5
        with:
          url: postgres://postgres:postgres@localhost:5432/postgres
          readme: README.md
          check: true
```

## Command line

The same diagram, from your machine (Node 24):

```sh
DATABASE_URL=postgres://localhost/shop npx erdraw -o -           # print it
npx erdraw --url mysql://root@localhost/shop --readme README.md   # write docs/database.mmd and the README
npx erdraw --check                                                # exit 1 when they are stale
npx erdraw --help
```

The options are the inputs below; `--ssl-ca` takes a file.

## What the diagram shows

| In the database | In the diagram |
|---|---|
| A column | `type name`, as the database writes the type (`varchar(255)`, `timestamptz`) |
| Primary, foreign, unique key | `PK`, `FK`, `UK` after the column (a column can be several) |
| A column's comment (`COMMENT ON COLUMN`, `COMMENT '...'`) | The column's comment |
| An enum column | Its values in the column's comment |
| An index (`indexes: true`) | `index name (columns)` in the comment of its first column; a partial one is `partial unique` or `partial index` |
| A unique index with a `WHERE` (partial) | No `UK`, and no one-to-one: it is unique only among some rows |
| A required foreign key | `\|\|` on the parent: exactly one |
| A nullable foreign key | `\|o` on the parent: zero or one |
| A unique foreign key (or the primary key) | `o\|` on the child: one to one |
| Any other foreign key | `o{` on the child: one to many |
| A foreign key inside the primary key | A solid line (`--`): the child is identified by its parent |
| Any other foreign key | A dashed line (`..`) |

Mermaid accepts only letters, digits, `_`, `-`, `()` and `[]` in types and names: anything else
becomes `_` (`numeric(10,2)` is `numeric(10_2)`). A table name with other characters keeps its name
as the entity's label. With several schemas (or MySQL databases), tables are named `schema.table`.
A foreign key to a table outside the diagram is not drawn; the log names it.

## Inputs

| Input | Default | What it does |
|---|---|---|
| `url` | | `postgres://user:password@host:5432/db`, `mysql://...` or `mariadb://...`; replaces the six below |
| `type` | `postgresql` | `postgresql`, `mysql` or `mariadb` |
| `host` | `localhost` | |
| `port` | `5432` or `3306` | |
| `database` | | Required without `url` |
| `user` | | Required without `url` |
| `password` | | |
| `ssl` | the URL's `sslmode` | `true` or `require` (encrypted, certificate not verified), `verify-ca`, `verify-full`, `false` |
| `ssl-ca` | | The CA certificate (PEM) to verify the server with; `verify-full` unless `ssl` says otherwise |
| `schemas` | `public`, or the database | PostgreSQL schemas or MySQL databases to draw, comma-separated |
| `include` | | Only these tables, comma-separated; `*` matches anything (`order*`, `billing.*`) |
| `exclude` | | Tables to leave out, comma-separated; `*` matches anything (`audit_*`). The tables of Flyway, Prisma, Drizzle, Knex, Rails, Sequelize, goose, Alembic, Doctrine and EF are always left out |
| `output` | `docs/database.mmd` | The diagram file |
| `readme` | | A Markdown file to write the diagram into |
| `indexes` | `false` | Show indexes |
| `check` | `false` | Write nothing; fail when the files are not the diagram |
| `commit` | `false` | Commit and push the files when they changed |
| `commit-message` | `docs: update the database diagram` | |
| `commit-author` | the github-actions bot | `Name <email>` |

| Output | |
|---|---|
| `diagram` | The Mermaid diagram |
| `path` | The file it was written to |
| `changed` | `true` when the diagram or the README changed (with `check`: are stale) |

### In the README

The diagram goes between `<!-- ER_DIAGRAM_START -->` and `<!-- ER_DIAGRAM_END -->`, and only
what is between them changes. A README without them gets a `## Database diagram` section at the
end, which you can then move anywhere.

### Committing

`commit: true` needs `permissions: contents: write` and a branch: in a pull request, check out
its branch (`actions/checkout` with `ref: ${{ github.head_ref }}`), since the default checkout of
a pull request is a merge commit nobody can push to. A push with the workflow's `GITHUB_TOKEN`
starts no other workflow, so the commit cannot loop. When the branch moved during the run, the
commit is rebased on it and pushed again.

## Coming from er-diagram

erdraw is the next major version of `ViniciusDev26/er-diagram` (v1 to v4), renamed and moved to
sugomi-dev. Workflows on `@v1` to `@v4` keep working through GitHub's redirect. To move to
`sugomi-dev/erdraw@v5`, rename the inputs:

| er-diagram | erdraw |
|---|---|
| `db-type`, `db-host`, `db-port`, `db-name`, `db-user`, `db-pass` | `type`, `host`, `port`, `database`, `user`, `password` (or one `url`) |
| `output-dir: docs` (writing `database-er-diagram.mmd`) | `output: docs/database.mmd` |
| `write-to-readme` and `readme-path` | `readme: README.md` |
| `excluded-tables` | `exclude` (migration tables need no listing) |
| `show-indexes` | `indexes` |
| `auto-commit`, `commit-author-name`, `commit-author-email` | `commit`, `commit-author: Name <email>` |

The diagram changes too: columns are written `type name` (they were reversed), enums are the
values of their columns instead of extra entities, and the cardinality is read from the keys
instead of from `ON DELETE CASCADE`.

## Development

Node 24 ([`mise.toml`](mise.toml)) and Docker: the tests start PostgreSQL 13 and 17, MySQL 8.4 and
MariaDB 11.4 in containers with [Testcontainers](https://testcontainers.com).

```sh
npm ci
npm test          # every test, with 100% coverage
npm run check     # biome and tsc
npm run build     # dist/index.cjs (the Action) and dist/cli.cjs (npx erdraw): commit them
```

`UPDATE_EXAMPLES=1 npm test` writes [`example/database.mmd`](example/database.mmd) again after a
change to the diagram. Rules for contributors are in [`CLAUDE.md`](CLAUDE.md).

## License

[MIT](LICENSE). erdraw is a [sugomi](https://github.com/sugomi-dev) tool.
