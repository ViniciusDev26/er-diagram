import { z } from "zod"

const EnvSchema = z.object({
  DB_TYPE: z.enum(["postgresql", "mysql"]).optional().default("postgresql"),
  DB_HOST: z.string().optional().default("localhost"),
  DB_PORT: z.string().optional().default("5432").transform((val) => parseInt(val, 10)),
  DB_NAME: z.string(),
  DB_USER: z.string(),
  DB_PASS: z.string(),
  OUTPUT_DIR: z.string().optional().default("docs"),
  WRITE_TO_README: z.string().optional().default("false").transform((val) => val === "true"),
  README_PATH: z.string().optional().default("README.md"),
  EXCLUDED_TABLES: z.string().optional().default("flyway_schema_history").transform((val) => val.split(",").map(s => s.trim())),
  SHOW_INDEXES: z.string().optional().default("false").transform((val) => val === "true"),
  AUTO_COMMIT: z.string().optional().default("false").transform((val) => val === "true"),
  COMMIT_MESSAGE: z.string().optional().default("docs: update ER diagram [skip ci]"),
  COMMIT_AUTHOR_NAME: z.string().optional().default("github-actions[bot]"),
  COMMIT_AUTHOR_EMAIL: z.string().optional().default("41898282+github-actions[bot]@users.noreply.github.com"),
})

export const env = EnvSchema.parse(process.env)