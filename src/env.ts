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
})

export const env = EnvSchema.parse(process.env)