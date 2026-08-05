// Manual/backfill rollup run: pnpm --filter @pollen/data rollups
// Requires NEON_DATABASE_URL in the environment. Safe to re-run: recompute is
// delete-first inside the rolling window and upsert-idempotent.
import { computeRollups } from '../src/rollups'

computeRollups()
  .then(cells => {
    console.log(`computeRollups wrote ${cells} cells`)
    process.exit(0)
  })
  .catch(err => {
    console.error('computeRollups failed:', err)
    process.exit(1)
  })
