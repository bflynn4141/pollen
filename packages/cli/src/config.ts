import { join } from 'node:path'

// ── Time constants ──

export const MS_PER_DAY = 86_400_000
export const MS_PER_MINUTE = 60_000
export const MS_PER_SECOND = 1_000

// ── Duration bucket thresholds (minutes) ──

export const DURATION_THRESHOLDS = {
  QUICK: 5,
  SHORT: 15,
  MEDIUM: 60,
  LONG: 180,
} as const

// ── Satisfaction score weights ──

export const SATISFACTION_WEIGHTS = {
  GIT_ACTIVITY: 15,
  LOW_FAILURE_RATE: 25,
  NO_RETRY_STORMS: 15,
  REASONABLE_DURATION: 10,
  TOOL_ENGAGEMENT: 15,
  CONSISTENT_INTENT: 10,
  CLEAN_ENDING: 10,
} as const

// ── Satisfaction signal thresholds ──

export const SATISFACTION_THRESHOLDS = {
  FAILURE_RATE_MAX: 0.2,
  MIN_DURATION_MINUTES: 2,
  MAX_DURATION_MINUTES: 240,
  INTENT_CONSISTENCY_MIN: 0.5,
} as const

// ── Paths ──

export const DB_PATH = join(process.env.HOME ?? '~', '.pollen', 'local.db')

// ── Sync ──

export const SYNC_BATCH_SIZE = 100

// ── AI Models ──

export const SUBJECT_MODEL = 'claude-haiku-4-5-20251001'
