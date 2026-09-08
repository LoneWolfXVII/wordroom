/**
 * Rooms and identity — workstream 3.
 *
 * Home, create, join, the name lock, the lobby, the room sheet, anonymous auth
 * and the upgrade out of it.
 *
 * ---------------------------------------------------------------------------
 * What the other workstreams need from here
 * ---------------------------------------------------------------------------
 *
 * **Workstream 2 (game).**
 *
 *   - `<RoomsProvider>` must be an ancestor of the game route, or `useSession`
 *     and `useActiveSeat` throw. Safe to nest — it shares one query client and
 *     one session. Better still, add it once to `app/layout.tsx`.
 *   - `useActiveSeat()` gives `{ room, player }`: the room id for `get-puzzle`
 *     and the player id for attribution. `null` while it loads.
 *   - `<RoomButton room={room} onClick={...} />` is the header's `.roombtn`, and
 *     `<RoomSheet open onOpenChange />` is what it opens.
 *   - `<SaveProgressNudge />` goes at the bottom of the result sheet and takes no
 *     props. It decides for itself whether this is its one showing; there is no
 *     "first result" flag to pass.
 *   - `GAME_PATH` is where the lobby sends a player. Change it there if the game
 *     route is not `/game`.
 *
 * **Workstream 4 (leaderboard + settings).**
 *
 *   - `useMembers(roomId)` is the room's roster, kept live off the `players`
 *     realtime publication. Names come from here; they never change.
 *   - `<MemberList status={...} />` takes a per-player caption function, which is
 *     the slot for the prototype's "solved" / "playing" column. That state lives
 *     in `attempts`, which is yours.
 *   - `<SignInPanel returnPath={...} />` is the settings sheet's Account row
 *     action. `useSession()` gives `isAnonymous` and `email` for its subtitle.
 *
 * Nothing in this feature reads, stores or renders a puzzle answer, and nothing
 * here has any reason to.
 */

export { type CreateRoomInput, createRoom, type JoinRoomInput, joinRoom } from './api'
export { AuthCallbackScreen } from './auth-callback-screen'
export { codeFromShareInput, isCompleteCode, normaliseCode } from './code'
export { CreateRoomScreen } from './create-room-screen'
export {
  ApiError,
  parseErrorEnvelope,
  type RoomsErrorCode,
  type RoomsErrorField,
  type RoomsErrorResolution,
  resolveRoomsError,
} from './errors'
export { HomeScreen } from './home-screen'
export { IDENTITY_CALLBACK_PATH, linkEmail, linkGoogle, looksLikeEmail } from './identity'
export { JoinRoomScreen } from './join-room-screen'
export { LobbyScreen } from './lobby-screen'
export { MemberList, type MemberListProps } from './member-list'
export { NameScreen } from './name-screen'
export {
  checkPlayerName,
  checkRoomName,
  type NameCheck,
  type NameProblem,
  normaliseName,
  PLAYER_NAME_MAX,
  PLAYER_NAME_MIN,
  playerNameProblemMessage,
  ROOM_NAME_MAX,
  ROOM_NAME_MIN,
} from './names'
export { RoomsProvider } from './provider'
export { RoomButton, RoomSheet } from './room-sheet'
export { GAME_PATH, joinPathForCode } from './routes'
export { RulesSheet } from './rules-sheet'
export { SaveProgressNudge } from './save-progress-nudge'
export type { Seat } from './schemas'
export { SessionProvider, type SessionState, type SessionStatus, useSession } from './session'
export { copyText, type ShareOutcome, shareRoom, shareUrl } from './share'
export { SignInPanel, type SignInPanelProps } from './sign-in-panel'
export {
  type ActiveSeat,
  roomKeys,
  useActiveSeat,
  useMembers,
  useMySeats,
  useRoom,
} from './use-rooms'
