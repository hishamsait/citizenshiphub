/**
 * Thin accessor for the Cloudflare D1 binding attached to the request context.
 * This is the only place that reaches into `App.Locals` to obtain the database,
 * so every repository can stay trivially testable (accept a `Db` instance).
 */
export type Db = Env['DB'];

export function getDb(locals: App.Locals): Db {
  const db = locals.runtime?.env?.DB;
  if (!db) {
    throw new Error('D1 database binding "DB" is not available in the current runtime.');
  }
  return db;
}
