// this file generates playable guitar fingerings for any chord in standard tuning.
// shapes are searched from the chord formula and ranked by ease, so no chord has to be typed in by hand.
import { QUALITIES, mod12, type Chord } from './chords'

export type Fret = number | 'x'

export type Barre = { fret: number; from: number; to: number }

export type Voicing = {
  // low e string first, 'x' for a muted string, 0 for open
  frets: Fret[]
  fingers: number
  barre: Barre | null
  difficulty: number
}

// open string pitch classes from low e to high e
export const OPEN_STRINGS = [4, 9, 2, 7, 11, 4]

const MAX_FRET = 12
const MAX_SPAN = 3
const MAX_FINGERS = 4
const MIN_SOUNDING_STRINGS = 4
const MAX_VOICINGS = 4
const FAR_APART = 3

function countFingers(frets: Fret[]): { fingers: number; barre: Barre | null } {
  const fretted = frets.map((fret, index) => ({ fret, index })).filter((entry): entry is { fret: number; index: number } => typeof entry.fret === 'number' && entry.fret > 0)
  if (fretted.length === 0) {
    return { fingers: 0, barre: null }
  }

  const lowest = Math.min(...fretted.map((entry) => entry.fret))
  const onLowest = fretted.filter((entry) => entry.fret === lowest)
  if (onLowest.length >= 2) {
    const from = onLowest[0].index
    const to = onLowest[onLowest.length - 1].index
    // a barre covers every string between its ends, so none of them can be open or muted
    const covered = frets.slice(from, to + 1).every((fret) => typeof fret === 'number' && fret >= lowest)
    if (covered) {
      return { fingers: 1 + fretted.filter((entry) => entry.fret > lowest).length, barre: { fret: lowest, from, to } }
    }
  }
  return { fingers: fretted.length, barre: null }
}

function scoreVoicing(frets: Fret[], fingers: number, barre: Barre | null, hasFifth: boolean): number {
  const fretted = frets.filter((fret): fret is number => typeof fret === 'number' && fret > 0)
  const open = frets.filter((fret) => fret === 0).length
  // muting low strings is common, but muting treble strings in the middle of a strum sounds thin
  const bass = frets.findIndex((fret) => fret !== 'x')
  const leadingMutes = bass < 0 ? 0 : bass
  const trailingMutes = frets.filter((fret) => fret === 'x').length - leadingMutes
  const muted = leadingMutes * 0.5 + trailingMutes * 1.2
  const span = fretted.length > 0 ? Math.max(...fretted) - Math.min(...fretted) : 0
  const lowest = fretted.length > 0 ? Math.min(...fretted) : 0
  // two notes on the lowest fret that are not a real barre need two fingers fighting for one fret
  const splitLowest = !barre && fretted.filter((fret) => fret === lowest).length >= 2 ? 1.5 : 0
  return fingers + span * 0.5 + lowest * 0.12 + muted + (hasFifth ? 0 : 0.4) + (barre ? 0.8 : 0) + splitLowest - open * 0.25
}

function search(chord: Chord): Voicing[] {
  const info = QUALITIES[chord.quality]
  const tonePitches = new Set(info.intervals.map((interval) => mod12(chord.root + interval)))
  // the fifth may be dropped, every other tone defines the chord's sound
  const required = info.intervals.filter((interval) => interval !== 7).map((interval) => mod12(chord.root + interval))
  const fifth = mod12(chord.root + 7)
  const found: Voicing[] = []
  const frets: Fret[] = []

  function walk(string: number, started: boolean, ended: boolean, minFret: number, maxFret: number, hasOpen: boolean) {
    if (string === OPEN_STRINGS.length) {
      const played = frets.filter((fret) => fret !== 'x')
      if (played.length < MIN_SOUNDING_STRINGS) {
        return
      }
      const sounded = new Set(frets.map((fret, index) => (fret === 'x' ? -1 : mod12(OPEN_STRINGS[index] + fret))))
      if (!required.every((pitch) => sounded.has(pitch))) {
        return
      }
      const { fingers, barre } = countFingers(frets)
      if (fingers > MAX_FINGERS) {
        return
      }
      found.push({ frets: [...frets], fingers, barre, difficulty: scoreVoicing(frets, fingers, barre, sounded.has(fifth)) })
      return
    }

    const options: Fret[] = ['x']
    for (let fret = 0; fret <= MAX_FRET; fret += 1) {
      options.push(fret)
    }

    for (const option of options) {
      if (option === 'x') {
        frets.push('x')
        walk(string + 1, started, started, minFret, maxFret, hasOpen)
        frets.pop()
        continue
      }

      // a played string after a muted one would leave a gap inside the chord
      if (ended) {
        continue
      }
      const pitch = mod12(OPEN_STRINGS[string] + option)
      if (!tonePitches.has(pitch)) {
        continue
      }
      // the lowest sounding string must carry the root, so every shape is in root position
      if (!started && pitch !== chord.root) {
        continue
      }

      const nextHasOpen = hasOpen || option === 0
      let nextMin = minFret
      let nextMax = maxFret
      if (option > 0) {
        nextMin = Math.min(minFret, option)
        nextMax = Math.max(maxFret, option)
      }
      if (nextMax - nextMin > MAX_SPAN && nextMax > 0) {
        continue
      }
      // open strings keep the hand near the nut
      if (nextHasOpen && nextMax > MAX_SPAN + 1) {
        continue
      }

      frets.push(option)
      walk(string + 1, true, false, nextMin, nextMax, nextHasOpen)
      frets.pop()
    }
  }

  walk(0, false, false, Number.POSITIVE_INFINITY, 0, false)
  return found
}

function windowStart(voicing: Voicing): number {
  const fretted = voicing.frets.filter((fret): fret is number => typeof fret === 'number' && fret > 0)
  return fretted.length > 0 ? Math.min(...fretted) : 0
}

// which strings sound, so a full barre and a thinner shape at the same spot count as different options
function mutePattern(voicing: Voicing): string {
  return voicing.frets.map((fret) => (fret === 'x' ? 'x' : 'o')).join('')
}

const cache = new Map<string, Voicing[]>()

// ranked fingerings, easiest first, spread across different parts of the neck
export function voicingsFor(chord: Chord): Voicing[] {
  const id = `${chord.root}:${chord.quality}`
  const cached = cache.get(id)
  if (cached) {
    return cached
  }

  const ranked = search(chord).sort((a, b) => a.difficulty - b.difficulty)
  const chosen: Voicing[] = []
  for (const candidate of ranked) {
    const distinct = chosen.every((other) => mutePattern(other) !== mutePattern(candidate) || Math.abs(windowStart(other) - windowStart(candidate)) >= FAR_APART)
    if (distinct) {
      chosen.push(candidate)
    }
    if (chosen.length === MAX_VOICINGS) {
      break
    }
  }

  cache.set(id, chosen)
  return chosen
}

// place a voicing on a four-fret diagram, showing a fret number when it sits up the neck
export function diagramLayout(voicing: Voicing): { baseFret: number; relative: Fret[]; barre: Barre | null } {
  const fretted = voicing.frets.filter((fret): fret is number => typeof fret === 'number' && fret > 0)
  const highest = fretted.length > 0 ? Math.max(...fretted) : 0
  const baseFret = highest <= MAX_SPAN + 1 ? 1 : Math.min(...fretted)
  const shift = baseFret - 1
  return {
    baseFret,
    relative: voicing.frets.map((fret) => (typeof fret === 'number' && fret > 0 ? fret - shift : fret)),
    barre: voicing.barre ? { ...voicing.barre, fret: voicing.barre.fret - shift } : null,
  }
}

export function fretString(voicing: Voicing): string {
  return voicing.frets.join(voicing.frets.some((fret) => typeof fret === 'number' && fret > 9) ? ' ' : '')
}
