import type { Connection, ReadOptions } from "./connection.ts";

export type DatabaseType = "postgresql" | "mysql";

export interface CommitOptions {
  message: string;
  name: string;
  email: string;
}

export interface Config {
  type: DatabaseType;
  connection: Connection;
  read: ReadOptions;
  output: string;
  readme?: string;
  indexes: boolean;
  commit?: CommitOptions;
}

/** The tables migration tools keep their history in: never part of the model. */
export const DEFAULT_EXCLUDE = [
  "flyway_schema_history",
  "_prisma_migrations",
  "__drizzle_migrations",
  "knex_migrations",
  "knex_migrations_lock",
  "schema_migrations",
  "ar_internal_metadata",
  "SequelizeMeta",
  "goose_db_version",
  "alembic_version",
  "doctrine_migration_versions",
  "__EFMigrationsHistory",
];

const PORTS: Record<DatabaseType, number> = { postgresql: 5432, mysql: 3306 };
const SCHEMES: Record<string, DatabaseType> = {
  "postgres:": "postgresql",
  "postgresql:": "postgresql",
  "mysql:": "mysql",
};
const BOT = "github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>";

const list = (text: string) =>
  text
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");

function flag(name: string, value: string): boolean {
  if (value === "" || value === "false") return false;
  if (value === "true") return true;
  throw new Error(`${name} must be true or false, not '${value}'`);
}

function port(value: string, type: DatabaseType): number {
  if (value === "") return PORTS[type];
  if (!/^\d+$/.test(value)) throw new Error(`port must be a number, not '${value}'`);
  return Number(value);
}

function fromUrl(text: string, ssl: boolean): { type: DatabaseType; connection: Connection } {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error("url is not a URL");
  }
  const type = SCHEMES[url.protocol];
  if (!type) throw new Error("url must start with postgres://, postgresql:// or mysql://");
  const mode = url.searchParams.get("sslmode") ?? url.searchParams.get("ssl-mode") ?? "";
  return {
    type,
    connection: {
      host: url.hostname,
      port: port(url.port, type),
      database: decodeURIComponent(url.pathname.slice(1)),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      ssl: ssl || /^(require|verify|required)/i.test(mode),
    },
  };
}

function connect(get: (name: string) => string, ssl: boolean) {
  const type = get("type") || "postgresql";
  if (type !== "postgresql" && type !== "mysql") {
    throw new Error(`type must be postgresql or mysql, not '${type}'`);
  }
  const required = (name: string) => {
    const value = get(name);
    if (value === "") throw new Error(`${name} is required (or a url)`);
    return value;
  };
  return {
    type,
    connection: {
      host: get("host") || "localhost",
      port: port(get("port"), type),
      database: required("database"),
      user: required("user"),
      password: get("password"),
      ssl,
    },
  } as const;
}

function author(text: string): { name: string; email: string } {
  const match = /^(.+?)\s*<([^>]+)>$/.exec(text.trim());
  if (!match) throw new Error(`commit-author must be 'Name <email>', not '${text}'`);
  return { name: match[1] as string, email: match[2] as string };
}

/** The action's configuration from its inputs (`get` returns "" for an input not given). */
export function parseInputs(get: (name: string) => string): Config {
  const ssl = flag("ssl", get("ssl"));
  const url = get("url");
  const { type, connection } = url ? fromUrl(url, ssl) : connect(get, ssl);
  const commitAuthor = author(get("commit-author") || BOT);
  const config: Config = {
    type,
    connection,
    read: {
      schemas: list(get("schemas") || "public"),
      exclude: [...DEFAULT_EXCLUDE, ...list(get("exclude"))],
    },
    output: get("output") || "docs/database.mmd",
    indexes: flag("indexes", get("indexes")),
  };
  const readme = get("readme");
  if (readme) config.readme = readme;
  if (flag("commit", get("commit"))) {
    config.commit = {
      message: get("commit-message") || "docs: update the database diagram",
      ...commitAuthor,
    };
  }
  return config;
}
