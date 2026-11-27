/** Where the database is and who reads it. */
export interface Connection {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface ReadOptions {
  /** PostgreSQL schemas to read (default `public`); names are qualified when there are several. */
  schemas?: string[];
  /** Tables to leave out, by name or qualified name; `*` matches any run of characters. */
  exclude?: string[];
}
