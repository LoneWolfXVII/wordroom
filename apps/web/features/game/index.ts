/**
 * The game.
 *
 * Mount `GameScreen` inside a room, register a transport with `setGameApi` (or
 * pass one to `configure`), then `loadPuzzle`. Everything else — the board, the
 * keyboard, the reveal, the result sheet and the share text — is internal.
 *
 * The store never holds a puzzle's word until the server has released it, which
 * it only does once the attempt is solved, failed or timed out.
 */
export {
  createEdgeGameApi,
  type EdgeApiConfig,
  type GameApi,
  GameApiError,
  type GameErrorCode,
  type GuessResult,
  setGameApi,
} from './api'
export { Board, type BoardProps } from './components/board'
export { GameScreen, type GameScreenProps } from './components/game-screen'
export { Keyboard, type KeyboardProps } from './components/keyboard'
export { PuzzleNumber } from './components/puzzle-number'
export { type RankDelta, ResultSheet, type ResultSheetProps } from './components/result-sheet'
export { Tile, type TileProps } from './components/tile'
export { isGuessListReady, loadGuessList, preloadGuessList } from './guess-list'
export { accumulateKeyStates, type KeyStates } from './keys'
export {
  lettersShareWarning,
  SHARE_HOST,
  type ShareInput,
  type ShareVariant,
  shareHeadline,
  shareLink,
  shareOrCopy,
  shareText,
  spoilerFreeShare,
  withLettersShare,
} from './share'
export {
  type BoardPhase,
  type GameStatus,
  type RestoredAttempt,
  type RoomContext,
  useGameStore,
} from './store'
export { type Clock, clampPerPuzzleSeconds, computeClock, formatClock } from './timer'
