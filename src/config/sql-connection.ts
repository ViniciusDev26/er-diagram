import postgres from "postgres";
import { env } from "../env";

export function makeSqlConnection() {
  return postgres({
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    username: env.DB_USER,
    password: env.DB_PASS,
  })
}