/**
 * Hold the SQL guess path to the TypeScript one, answer for answer.
 *
 * `submit_guess` moved the domain rules into Postgres so a guess costs one
 * round trip instead of an Edge Function invocation plus two. That is only
 * defensible while the two implementations agree, so this is the thing that
 * says they do — run it against a local stack after any change to either.
 *
 *     supabase start && supabase db reset
 *     npx tsx supabase/scripts/verify-sql-parity.mts
 *
 * It compares far more than the unit tests can: every answer against itself and
 * against a rotation of itself, which is where repeated-letter scoring goes
 * wrong, and thousands of real hard-mode histories including the exact toast
 * text, which depends on the order constraints were revealed in.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { isHardModeValid, type ScoredGuess } from '../../packages/shared/src/hard-mode.js'
import { scoreGuess } from '../../packages/shared/src/score.js'
import { puzzleIndex } from '../functions/_shared/puzzle.ts'

const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const lists = JSON.parse(
  readFileSync(new URL('../../docs/wordlists/wordlists.json', import.meta.url), 'utf8'),
) as Record<string, { answers: string[]; guesses: string[] }>

interface Case {
  guess: string
  history: ScoredGuess[]
}

const cases: Case[] = []
for (const v of Object.values(lists)) {
  const { answers, guesses } = v
  const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)] as string as T
  for (let i = 0; i < 3000; i++) {
    const answer = pick(answers)
    const rows = 1 + Math.floor(Math.random() * 3)
    const history: ScoredGuess[] = []
    for (let r = 0; r < rows; r++) {
      const word = pick(guesses)
      history.push({ guess: word, marks: scoreGuess(word, answer) })
    }
    // Half the candidates are drawn from the same answer's family, so plenty of
    // them actually satisfy the constraints rather than all failing at row one.
    cases.push({ guess: Math.random() < 0.5 ? answer : pick(guesses), history })
  }
}

const values = cases
  .map(
    (c) =>
      `('${c.guess}', array[${c.history.map((h) => `'${h.guess}'`).join(',')}]::text[], array[${c.history
        .map((h) => `'${h.marks.join(',')}'`)
        .join(',')}]::text[])`,
  )
  .join(',')

// 1.3MB of VALUES does not fit in argv, so it goes through a file.
writeFileSync(
  '/tmp/parity.sql',
  `select coalesce(public.hard_mode_violation(g, gs, ms) ->> 'reason', 'valid'),
          coalesce(public.hard_mode_violation(g, gs, ms) ->> 'message', '')
     from (values ${values}) as t(g, gs, ms);`,
)
const out = execFileSync('psql', [DB, '-t', '-A', '-F', '\t', '-f', '/tmp/parity.sql'], {
  encoding: 'utf8',
  maxBuffer: 1 << 28,
})

const rows = out.split('\n').filter((l) => l.trim())
let checked = 0
const verdictMismatch: string[] = []
const messageMismatch: string[] = []

rows.forEach((line, i) => {
  const [reason, message] = line.split('\t')
  const c = cases[i] as Case
  const ts = isHardModeValid(c.guess, c.history)
  checked++
  const tsReason = ts.valid ? 'valid' : ts.reason
  if (reason !== tsReason) {
    verdictMismatch.push(`${c.guess}: sql=${reason} ts=${tsReason}`)
  } else if (!ts.valid && message !== ts.message) {
    messageMismatch.push(`${c.guess}: sql="${message}" ts="${ts.message}"`)
  }
})

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------
const scorePairs: [string, string][] = []
for (const v of Object.values(lists)) {
  const { answers, guesses } = v
  for (let i = 0; i < 4000; i++) {
    scorePairs.push([
      guesses[Math.floor(Math.random() * guesses.length)] as string,
      answers[Math.floor(Math.random() * answers.length)] as string,
    ])
  }
  for (const a of answers) {
    scorePairs.push([a, a])
    scorePairs.push([a.slice(1) + a[0], a])
  }
}

writeFileSync(
  '/tmp/parity-score.sql',
  `select g, a, array_to_string(public.score_guess(g, a), ',')
     from (values ${scorePairs.map(([g, a]) => `('${g}','${a}')`).join(',')}) as t(g, a);`,
)
const scoreOut = execFileSync('psql', [DB, '-t', '-A', '-F', '\t', '-f', '/tmp/parity-score.sql'], {
  encoding: 'utf8',
  maxBuffer: 1 << 28,
})

let scoreChecked = 0
const scoreBad: string[] = []
for (const line of scoreOut.split('\n')) {
  if (!line.trim()) continue
  const [g, a, marks] = line.split('\t')
  scoreChecked++
  const expected = scoreGuess(g as string, a as string).join(',')
  if (marks !== expected) scoreBad.push(`${g} vs ${a}: sql=${marks} ts=${expected}`)
}

console.log(`compared ${scoreChecked} scoring pairs across all three modes`)
console.log(`scoring mismatches  ${scoreBad.length}`)
if (scoreBad.length) console.log(scoreBad.slice(0, 6).join('\n'))

console.log(`compared ${checked} hard-mode cases across all three modes`)
console.log(`verdict mismatches  ${verdictMismatch.length}`)
console.log(`message mismatches  ${messageMismatch.length}`)
if (verdictMismatch.length) console.log(verdictMismatch.slice(0, 6).join('\n'))
if (messageMismatch.length) console.log(messageMismatch.slice(0, 6).join('\n'))

// ---------------------------------------------------------------------------
// The puzzle sequence
//
// This one decides which word a room sees for every puzzle it will ever play,
// so it is compared at the end of the chain - the word, not the index. An
// implementation that is nearly right changes every room's sequence silently.
// ---------------------------------------------------------------------------
const counts = JSON.parse(
  execFileSync(
    'psql',
    [
      DB,
      '-t',
      '-A',
      '-c',
      'select json_object_agg(len, n) from (select len, count(*) n from public.word_bank group by len) x;',
    ],
    { encoding: 'utf8' },
  ),
) as Record<string, number>

const seqRows: string[] = []
const seqLabels: string[] = []
for (const mode of [5, 6, 7] as const) {
  const count = counts[String(mode)] as number
  for (let room = 0; room < 25; room++) {
    const seed = [...crypto.getRandomValues(new Uint8Array(16))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    // Early numbers, mid-bank, and either side of the wrap where the epoch
    // re-keys the shuffle.
    for (const n of [1, 2, 9, 250, count - 1, count, count + 1, count * 2 + 3]) {
      const index = await puzzleIndex(seed, mode, n, count)
      seqRows.push(`('${seed}',${mode},${n},${count},${index})`)
      seqLabels.push(`${seed.slice(0, 8)} mode ${mode} no.${n}`)
    }
  }
}

writeFileSync(
  '/tmp/parity-sequence.sql',
  `select (select wb.word from public.word_bank wb where wb.len = t.m
             order by wb.rank, wb.word offset public.puzzle_index(t.s, t.m, t.n, t.c) limit 1),
          (select wb.word from public.word_bank wb where wb.len = t.m
             order by wb.rank, wb.word offset t.ts_index limit 1)
     from (values ${seqRows.join(',')}) as t(s,m,n,c,ts_index);`,
)
const seqOut = execFileSync(
  'psql',
  [DB, '-t', '-A', '-F', '\t', '-f', '/tmp/parity-sequence.sql'],
  { encoding: 'utf8' },
)
const seqLines = seqOut.split('\n').filter((l) => l.trim())
const seqBad = seqLines
  .map((line, i) => {
    const [sqlWord, tsWord] = line.split('\t')
    return sqlWord === tsWord ? null : `${seqLabels[i]}: sql=${sqlWord} ts=${tsWord}`
  })
  .filter((x): x is string => x !== null)

console.log(`compared ${seqLines.length} puzzle answers across all three modes`)
console.log(`sequence mismatches ${seqBad.length}`)
if (seqBad.length) console.log(seqBad.slice(0, 6).join('\n'))

const failures = scoreBad.length + verdictMismatch.length + messageMismatch.length + seqBad.length
console.log(failures === 0 ? '\nIDENTICAL' : `\n${failures} DIVERGENCES`)
process.exit(failures === 0 ? 0 : 1)
