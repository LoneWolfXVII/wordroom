# Share image

`/api/share/…` renders the result card people post to Instagram and WhatsApp.
1080×1350, warm white, the same headline and the same grid as the share text.

Two variants, as the build plan specifies: **spoiler-free** (colours only, the
default) and **with letters** (the guesses in the tiles, which for a solved
puzzle means the answer).

## Calling it — for the result sheet

Two calls, because an `<img>` sends no credentials and the second call therefore
cannot be authenticated. Mint first, then use the URL you get back.

```ts
const minted = await fetch(`/api/share/${attemptId}`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${accessToken}`, // the Supabase session token
    'content-type': 'application/json',
  },
  body: JSON.stringify({ variant: 'spoiler-free' }), // or 'with-letters'
}).then((r) => r.json())

// { variant, path, url, expiresAt, width: 1080, height: 1350 }
```

`url` is absolute and safe to hand to `navigator.share`, an `<img src>` or an
`og:image`. It renders the same bytes for as long as it is valid, so it can be
cached anywhere.

Failures come back as `{ error, message }` with a stable `error` code:

| Status | `error`               | When                                          |
| ------ | --------------------- | --------------------------------------------- |
| 400    | `bad_request`         | The path segment is not an attempt id.        |
| 401    | `unauthorized`        | No `Authorization: Bearer …`.                 |
| 404    | `attempt_not_found`   | No such attempt, **or** it is not the caller's. |
| 409    | `attempt_unfinished`  | The puzzle is still in play.                  |
| 503    | `not_configured`      | `SHARE_TOKEN_SECRET` is unset in production.  |

The letters variant still needs the confirm the build plan calls for
(`lettersShareWarning()` in `features/game/share.ts`). Nothing here enforces
that — it is the player's own result either way; the confirm is about who they
are about to spoil it for.

## Why the two calls

`GET /api/share/<attemptId>.png` takes a `?t=` token and renders exactly what
that token carries. It reads no database and takes no id it would trust. The
token is minted only by `POST`, only for the caller's own attempt, only once
that attempt has finished, and it is HMAC-SHA256 signed so it cannot be forged
or edited. A spoiler-free token has no letters in it at all — not redacted,
absent. `token.ts` sets out the full argument.

Tokens expire: a year for spoiler-free, a week for with-letters, so a forwarded
letters card stops spoiling a puzzle number the room has moved past.

## Configuration

| Variable             | Required                      | Notes                                                        |
| -------------------- | ----------------------------- | ------------------------------------------------------------ |
| `SHARE_TOKEN_SECRET` | **yes, in production**        | Any long random string. Rotating it invalidates live cards.  |

Unset in development, a fixed dev secret is used so a minted URL survives a
server restart. Unset in production, minting and rendering both return 503
rather than falling back to something guessable.
