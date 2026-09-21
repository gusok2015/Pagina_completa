/**
 * Kysely dialect for Better Auth over the app's embedded PGLite instance.
 * Lazy: resolves `getClient` on first connection so migrations can finish first.
 */
import type { PGlite } from "@electric-sql/pglite";
import {
  CompiledQuery,
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type Driver,
  type Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type QueryCompiler,
  type QueryResult,
  type TransactionSettings,
} from "kysely";

type Client = PGlite;

/** Factory used by `auth/server.ts`: `pgliteDialect(() => getPglite())`. */
export function pgliteDialect(
  getClient: () => Promise<Client> | Client,
): Dialect {
  return {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new LazyPGliteDriver(getClient),
    createQueryCompiler: (): QueryCompiler => new PostgresQueryCompiler(),
    createIntrospector: (db: Kysely<unknown>): DatabaseIntrospector =>
      new PostgresIntrospector(db),
  };
}

class LazyPGliteDriver implements Driver {
  private client: Client | undefined;
  private connection: PGliteConnection | undefined;
  private queue: Array<(con: PGliteConnection) => void> = [];

  constructor(private readonly getClient: () => Promise<Client> | Client) {}

  async init(): Promise<void> {
    try {
      this.client = await this.getClient();
    } catch (err) {
      console.warn("[pglite-dialect] Driver init skipped or failed (serverless fallback active):", err);
    }
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    try {
      if (this.client === undefined) {
        this.client = await this.getClient();
      }
      if (this.connection !== undefined) {
        return new Promise((resolve) => {
          this.queue.push(resolve);
        });
      }
      this.connection = new PGliteConnection(this.client);
      return this.connection;
    } catch (err) {
      console.warn("[pglite-dialect] acquireConnection failed, using dummy connection:", err);
      return new DummyPGliteConnection();
    }
  }

  async releaseConnection(connection: DatabaseConnection): Promise<void> {
    if (connection !== this.connection && !(connection instanceof DummyPGliteConnection)) {
      throw new Error("Invalid connection");
    }
    const next = this.queue.shift();
    if (next === undefined) {
      this.connection = undefined;
      return;
    }
    if (this.connection) {
      next(this.connection);
    }
  }

  async beginTransaction(
    conn: DatabaseConnection,
    settings: TransactionSettings,
  ): Promise<void> {
    if (conn instanceof DummyPGliteConnection) return;
    const c = conn as PGliteConnection;
    if (settings.isolationLevel) {
      await c.executeQuery(
        CompiledQuery.raw(
          `start transaction isolation level ${settings.isolationLevel}`,
        ),
      );
    } else {
      await c.executeQuery(CompiledQuery.raw("begin"));
    }
  }

  async commitTransaction(conn: DatabaseConnection): Promise<void> {
    if (conn instanceof DummyPGliteConnection) return;
    await (conn as PGliteConnection).executeQuery(CompiledQuery.raw("commit"));
  }

  async rollbackTransaction(conn: DatabaseConnection): Promise<void> {
    if (conn instanceof DummyPGliteConnection) return;
    await (conn as PGliteConnection).executeQuery(
      CompiledQuery.raw("rollback"),
    );
  }

  async destroy(): Promise<void> {
    // Do not close the client: it is the shared getPglite() singleton used by
    // app SQL (getSql). Only drop our local handle so auth teardown cannot
    // poison the rest of the process.
    this.client = undefined;
    this.connection = undefined;
    this.queue = [];
  }
}

class DummyPGliteConnection implements DatabaseConnection {
  async executeQuery<O>(): Promise<QueryResult<O>> {
    return { rows: [] as O[] };
  }

  async *streamQuery<O>(): AsyncIterableIterator<QueryResult<O>> {
    yield { rows: [] as O[] };
  }
}

class PGliteConnection implements DatabaseConnection {
  constructor(private readonly client: Client) {}

  async executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
    const result = await this.client.query(compiledQuery.sql, [
      ...compiledQuery.parameters,
    ]);
    if (result.affectedRows) {
      return {
        numAffectedRows: BigInt(result.affectedRows),
        rows: result.rows as O[],
      };
    }
    return { rows: result.rows as O[] };
  }

  async *streamQuery<O>(
    compiledQuery: CompiledQuery,
    chunkSize: number,
  ): AsyncIterableIterator<QueryResult<O>> {
    if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
      throw new Error("chunkSize must be a positive integer");
    }
    const result = await this.client.query(compiledQuery.sql, [
      ...compiledQuery.parameters,
    ]);
    for (let i = 0; i < result.rows.length; i += chunkSize) {
      yield { rows: result.rows.slice(i, i + chunkSize) as O[] };
    }
  }
}
