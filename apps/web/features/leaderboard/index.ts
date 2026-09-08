/**
 * The room leaderboard: the board itself, the stats tab, and the rank delta the
 * result sheet shows.
 *
 * Workstream 2 wants `useRankDelta` — see its module comment for the exact call.
 * Everything else is the sheet, which the game header opens.
 */
export {
  type AnswerFreeAttempt,
  ATTEMPT_PUBLIC_COLUMNS,
  ATTEMPT_PUBLIC_SELECT,
  forbiddenColumns,
  narrowAttempt,
} from './answer-free'
export { type DistributionBar, distributionBars } from './distribution'
export { formatAverage, formatClock, ordinal } from './format'
export { GuessDistribution, type GuessDistributionProps } from './guess-distribution'
export { LeaderboardList, type LeaderboardListProps } from './leaderboard-list'
export { LeaderboardRow, type LeaderboardRowProps } from './leaderboard-row'
export { LeaderboardSheet, type LeaderboardSheetProps } from './leaderboard-sheet'
export {
  clearRankMemory,
  type RankDelta,
  type RankDirection,
  rankDelta,
  rankMemoryKey,
  readPreviousRank,
  readRank,
  recordRank,
} from './rank-delta'
export { StatsPanel, type StatsPanelProps } from './stats-panel'
export { createLeaderboardSource } from './supabase-source'
export type {
  BoardEntry,
  BoardQuery,
  BoardRange,
  BoardTab,
  LeaderboardSource,
  PuzzleProgress,
  PuzzleQuery,
  PuzzleStatus,
  StatsQuery,
} from './types'
export {
  type UseLeaderboardOptions,
  type UseLeaderboardResult,
  useLeaderboard,
} from './use-leaderboard'
export { type UseRankDeltaOptions, type UseRankDeltaResult, useRankDelta } from './use-rank-delta'
export { type UseStatsOptions, type UseStatsResult, useStats } from './use-stats'
