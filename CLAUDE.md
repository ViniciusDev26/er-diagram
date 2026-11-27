# erdraw

A GitHub Action and a command line (`npx erdraw`) that draw the Mermaid ER diagram of a
PostgreSQL, MySQL or MariaDB database. TypeScript on Node 24; esbuild bundles `dist/index.cjs` (the
Action) and `dist/cli.cjs` (the npm package's bin).

## Rules

- **TDD**: the test comes first, in its own commit (`test: ...`), then the code (`feat:`/`fix:`).
- **100% coverage** of lines, branches, functions and statements (`npm test` fails below it).
  Only the entries `src/index.ts` and `src/bin.ts`, which hand `@actions/core` or the process to
  `run` and `cli`, are left out.
- **Real databases**: the readers are tested against PostgreSQL 13 and 17, MySQL and MariaDB started
  by Testcontainers, never against mocks. Docker must be running.
- **Every diagram is valid Mermaid**: `tests/syntax.ts` checks it with the Mermaid parser.
- **The example is the truth**: `example/database.mmd` is the diagram of
  `tests/fixtures/postgres.sql`; `UPDATE_EXAMPLES=1 npm test` writes it again, on purpose only.
- **Commit `dist/`**: run `npm run build` after any change under `src/`; CI fails when `dist/` is
  stale.
- **Conventional Commits** in English (`committed.toml`); PRs are squash-merged, so the PR title is
  the commit release-please reads.
- Gate before pushing: `npm run check && npm test && npm run build`.

## Layout

- `src/schema.ts`: the model (tables, columns, primary key, indexes, foreign keys).
- `src/postgres.ts`, `src/mysql.ts`: read a schema from the catalog, four queries each. A foreign
  key to a table outside the diagram keeps the table's qualified name.
- `src/exclude.ts`: the include and exclude patterns.
- `src/mermaid.ts`: render a schema; cardinality comes from nullability, uniqueness and the
  primary key.
- `src/readme.ts`: put the diagram between `<!-- ER_DIAGRAM_START -->` and `<!-- ER_DIAGRAM_END -->`.
- `src/inputs.ts`: the Action's inputs, validated, with their defaults.
- `src/git.ts`: commit only the diagram's files to the checked-out branch and push.
- `src/run.ts`: the whole run (or the check), with `@actions/core` behind the `Io` interface.
- `src/cli.ts`: the command line's options, mapped to the Action's inputs, around `run`.
