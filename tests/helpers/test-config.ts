export const postgresConfig = {
  host: process.env.TEST_POSTGRES_HOST || "localhost",
  port: parseInt(process.env.TEST_POSTGRES_PORT || "5432", 10),
  database: process.env.TEST_POSTGRES_DB || "er-diagram",
  username: process.env.TEST_POSTGRES_USER || "postgres",
  password: process.env.TEST_POSTGRES_PASS || "postgres",
};

export const mysqlConfig = {
  host: process.env.TEST_MYSQL_HOST || "localhost",
  port: parseInt(process.env.TEST_MYSQL_PORT || "3306", 10),
  database: process.env.TEST_MYSQL_DB || "er-diagram",
  user: process.env.TEST_MYSQL_USER || "mysql",
  password: process.env.TEST_MYSQL_PASS || "mysql",
};
