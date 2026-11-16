// this file turns a chord history into ranked next-chord suggestions with a reason for each.
// suggestions come from key inference and harmonic function, never from a stored list of progressions.
import { chordPitchClasses, formatChord, mod12, sameChord, type Chord } from './chords'
import {
  degreesFor,
  inferKeys,
  keyLabel,
  keyUsesFlats,
  matchDegree,
  type Func,
  type KeyEstimate,
  type Origin,
} from './keys'

export type Suggestion = {
  chord: Chord
  symbol: string
  roman: string
  role: Func
  origin: Origin
  // 1 for the best suggestion, lower for the rest
  score: number
  reason: string
  key: string
}

// how naturally one harmonic function leads to another, from the current chord to the next
const FUNCTION_FLOW: Record<Func, Record<Func, number>> = {
  tonic: { tonic: 0.5, predominant: 0.8, dominant: 0.6 },
  predominant: { tonic: 0.5, predominant: 0.4, dominant: 0.9 },
  dominant: { tonic: 1.0, predominant: 0.3, dominant: 0.3 },
}

const NEUTRAL_FLOW = 0.5
const NON_DIATONIC_PENALTY = 0.65

// bonus for how far the root moves, in semitones upward from the current root
function rootMotionBonus(interval: number): number {
  switch (interval) {
    case 5: return 0.3
    case 7: return 0.12
    case 9: return 0.12
    case 3: return 0.08
    case 2:
    case 10: return 0.1
    default: return 0
  }
}

function motionPhrase(interval: number): string {
  switch (interval) {
    case 5: return 'the root falls a fifth, one of the strongest pulls in music'
    case 7: return 'the root rises a fifth, a bright and open move'
    case 9: return 'the root falls a minor third, a smooth and common slide'
    case 3: return 'the root rises a minor third, a gentle lift'
    case 2: return 'the root moves up a step'
    case 10: return 'the root moves down a step'
    default: return ''
  }
}

type Contribution = { suggestion: Omit<Suggestion, 'score'>; total: number; best: number }

export function suggestChords(history: Chord[], limit = 5, keys: KeyEstimate[] = inferKeys(history)): Suggestion[] {
  if (history.length === 0) {
    return []
  }

  const current = history[history.length - 1]
  const currentNotes = new Set(chordPitchClasses(current))
  const merged = new Map<string, Contribution>()

  for (const { key, probability } of keys) {
    const fromSpec = matchDegree(key, current)
    const flow = fromSpec ? FUNCTION_FLOW[fromSpec.func] : null

    for (const spec of degreesFor(key)) {
      const chord: Chord = { root: mod12(key.tonic + spec.offset), quality: spec.qualities[0] }
      if (sameChord(chord, current)) {
        continue
      }

      const interval = mod12(chord.root - current.root)
      const shared = chordPitchClasses(chord).filter((note) => currentNotes.has(note)).length
      // scale the flow by how central the degree is, so vi beats iii after a dominant
      const flowScore = (flow ? flow[spec.func] : NEUTRAL_FLOW) * (0.4 + 0.6 * spec.weight)
      let score = flowScore + rootMotionBonus(interval) + shared * 0.08 + spec.weight * 0.2
      if (spec.origin !== 'diatonic') {
        score *= NON_DIATONIC_PENALTY
      }

      const symbol = formatChord(chord, keyUsesFlats(key) || Boolean(spec.flat))
      const phrases = [`${spec.note}`]
      const motion = motionPhrase(interval)
      if (motion) {
        phrases.push(motion)
      }
      if (shared >= 2) {
        phrases.push(`it shares ${shared} notes with ${formatChord(current, keyUsesFlats(key))}, so the change is easy to hear and play`)
      }

      const id = `${chord.root}:${chord.quality}`
      const weighted = probability * score
      const entry = merged.get(id)
      if (!entry) {
        merged.set(id, {
          total: weighted,
          best: weighted,
          suggestion: { chord, symbol, roman: spec.roman, role: spec.func, origin: spec.origin, reason: capitalize(phrases.join('; ')), key: keyLabel(key) },
        })
      } else {
        entry.total += weighted
        if (weighted > entry.best) {
          entry.best = weighted
          entry.suggestion = { chord, symbol, roman: spec.roman, role: spec.func, origin: spec.origin, reason: capitalize(phrases.join('; ')), key: keyLabel(key) }
        }
      }
    }
  }

  const ranked = [...merged.values()].sort((a, b) => b.total - a.total)
  const top = ranked[0]?.total ?? 1
  return ranked.slice(0, limit).map(({ suggestion, total }) => ({ ...suggestion, score: total / top }))
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
