import type { Connection, ReadOptions, SslMode } from "./connection.ts";

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
  /** Only compare: fail when the files are not the diagram, and write nothing. */
  check: boolean;
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
  "mariadb:": "mysql",
};
/** sslmode (PostgreSQL) and ssl-mode (MySQL) values; the others (disable, prefer) are no SSL. */
const URL_SSL: Record<string, SslMode> = {
  require: "require",
  required: "require",
  "verify-ca": "verify-ca",
  verify_ca: "verify-ca",
  "verify-full": "verify-full",
  verify_identity: "verify-full",
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

/** The ssl input: undefined when not given, null for no SSL. */
function sslInput(value: string): SslMode | null | undefined {
  if (value === "") return undefined;
  if (value === "false") return null;
  if (value === "true") return "require";
  if (value === "require" || value === "verify-ca" || value === "verify-full") return value;
  throw new Error(`ssl must be true, false, require, verify-ca or verify-full, not '${value}'`);
}

function fromUrl(text: string): { type: DatabaseType; connection: Connection } {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error("url is not a URL");
  }
  const type = SCHEMES[url.protocol];
  if (!type) {
    throw new Error("url must start with postgres://, postgresql://, mysql:// or mariadb://");
  }
  const mode = url.searchParams.get("sslmode") ?? url.searchParams.get("ssl-mode") ?? "";
  const ssl = URL_SSL[mode.toLowerCase()];
  return {
    type,
    connection: {
      host: url.hostname,
      port: port(url.port, type),
      database: decodeURIComponent(url.pathname.slice(1)),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      ...(ssl ? { ssl } : {}),
    },
  };
}

function connect(get: (name: string) => string): { type: DatabaseType; connection: Connection } {
  const given = get("type") || "postgresql";
  if (given !== "postgresql" && given !== "mysql" && given !== "mariadb") {
    throw new Error(`type must be postgresql, mysql or mariadb, not '${given}'`);
  }
  const type = given === "mariadb" ? "mysql" : given;
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
    },
  };
}

function author(text: string): { name: string; email: string } {
  const match = /^(.+?)\s*<([^>]+)>$/.exec(text.trim());
  if (!match) throw new Error(`commit-author must be 'Name <email>', not '${text}'`);
  return { name: match[1] as string, email: match[2] as string };
}

/** The action's configuration from its inputs (`get` returns "" for an input not given). */
export function parseInputs(get: (name: string) => string): Config {
  const url = get("url");
  const { type, connection } = url ? fromUrl(url) : connect(get);
  const ca = get("ssl-ca");
  if (ca) {
    connection.ca = ca;
    connection.ssl = "verify-full";
  }
  const ssl = sslInput(get("ssl"));
  if (ssl === null) delete connection.ssl;
  else if (ssl) connection.ssl = ssl;
  const commitAuthor = author(get("commit-author") || BOT);
  const schemas = list(get("schemas"));
  const config: Config = {
    type,
    connection,
    read: {
      schemas: schemas.length > 0 ? schemas : [type === "mysql" ? connection.database : "public"],
      include: list(get("include")),
      exclude: [...DEFAULT_EXCLUDE, ...list(get("exclude"))],
    },
    output: get("output") || "docs/database.mmd",
    indexes: flag("indexes", get("indexes")),
    check: flag("check", get("check")),
  };
  const readme = get("readme");
  if (readme) config.readme = readme;
  if (flag("commit", get("commit"))) {
    if (config.check) throw new Error("check only reads: it cannot commit");
    config.commit = {
      message: get("commit-message") || "docs: update the database diagram",
      ...commitAuthor,
    };
  }
  return config;
}
