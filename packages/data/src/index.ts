// @pollen/data — the shared rollup data layer.
//
// k-anonymity boundary: public surfaces (the site's /trending pages, every
// /api/v1 endpoint, and the pollen-api worker) may import ONLY the readers in
// rollup-queries.ts (plus the pure week helpers). computeRollups() is the one
// path that reads raw tables, and it suppresses every cell below K=5 distinct
// contributors at write time.

export * from './week'
export * from './rollups'
export * from './rollup-queries'
export { configureDb, getDb } from './neon'
