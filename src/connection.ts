/**
 * How the connection is encrypted: `require` without checking the certificate, `verify-ca`
 * checking it is signed by a trusted CA, `verify-full` also checking it names the host.
 */
export type SslMode = "require" | "verify-ca" | "verify-full";

/** Where the database is and who reads it. */
export interface Connection {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: SslMode;
  /** The CA certificate(s) to trust, PEM, instead of the system's. */
  ca?: string;
}

export interface ReadOptions {
  /**
   * PostgreSQL schemas (default `public`) or MySQL databases (default the connection's) to read;
   * names are qualified when there are several.
   */
  schemas?: string[];
  /** Tables to draw, by name or qualified name; `*` matches any run of characters. All if empty. */
  include?: string[];
  /** Tables to leave out, the same way. */
  exclude?: string[];
}
