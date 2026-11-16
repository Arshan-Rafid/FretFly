// this file describes keys through the roles chords play in them, not through fixed progressions.
// each degree carries a harmonic function, and key inference scores how well a chord history fits each key.
import { QUALITIES, mod12, noteName, type Chord, type Quality } from './chords'

export type Mode = 'major' | 'minor'
export type Func = 'tonic' | 'predominant' | 'dominant'
export type Origin = 'diatonic' | 'borrowed' | 'secondary'

export type Key = { tonic: number; mode: Mode }

export type DegreeSpec = {
  roman: string
  offset: number
  // the first quality is what gets suggested, the rest also count as matching this degree
  qualities: Quality[]
  func: Func
  origin: Origin
  weight: number
  note: string
  flat?: boolean
}

const MAJOR_DEGREES: DegreeSpec[] = [
  { roman: 'I', offset: 0, qualities: ['maj', 'maj7', '6'], func: 'tonic', origin: 'diatonic', weight: 1.0, note: 'the home chord, where everything feels resolved' },
  { roman: 'ii', offset: 2, qualities: ['min', 'm7'], func: 'predominant', origin: 'diatonic', weight: 0.6, note: 'a gentle departure that leads toward the dominant' },
  { roman: 'iii', offset: 4, qualities: ['min', 'm7'], func: 'tonic', origin: 'diatonic', weight: 0.4, note: 'a soft, dreamy color close to the home chord' },
  { roman: 'IV', offset: 5, qualities: ['maj', 'maj7'], func: 'predominant', origin: 'diatonic', weight: 0.8, note: 'an open, lifting move away from home' },
  { roman: 'V', offset: 7, qualities: ['maj', '7'], func: 'dominant', origin: 'diatonic', weight: 0.9, note: 'builds tension that wants to resolve home' },
  { roman: 'vi', offset: 9, qualities: ['min', 'm7'], func: 'tonic', origin: 'diatonic', weight: 0.7, note: 'the relative minor, a moodier version of home' },
  { roman: 'vii°', offset: 11, qualities: ['dim', 'm7b5'], func: 'dominant', origin: 'diatonic', weight: 0.2, note: 'tense and unstable, it pulls strongly toward home' },
  { roman: '♭VII', offset: 10, qualities: ['maj', '7'], func: 'predominant', origin: 'borrowed', weight: 0.5, flat: true, note: 'borrowed from the parallel minor, it gives a rock and mixolydian color' },
  { roman: 'iv', offset: 5, qualities: ['min', 'm7'], func: 'predominant', origin: 'borrowed', weight: 0.4, note: 'borrowed from the parallel minor, it adds a bittersweet turn' },
  { roman: 'V/vi', offset: 4, qualities: ['maj', '7'], func: 'dominant', origin: 'secondary', weight: 0.4, note: 'a secondary dominant that points at the vi chord' },
  { roman: 'V/ii', offset: 9, qualities: ['maj', '7'], func: 'dominant', origin: 'secondary', weight: 0.3, note: 'a secondary dominant that points at the ii chord' },
  { roman: 'V/V', offset: 2, qualities: ['maj', '7'], func: 'dominant', origin: 'secondary', weight: 0.3, note: 'a secondary dominant that points at the V chord' },
]

// natural minor, plus the raised-leading-tone dominant from harmonic minor
const MINOR_DEGREES: DegreeSpec[] = [
  { roman: 'i', offset: 0, qualities: ['min', 'm7'], func: 'tonic', origin: 'diatonic', weight: 1.0, note: 'the home chord, where everything feels resolved' },
  { roman: 'ii°', offset: 2, qualities: ['dim', 'm7b5'], func: 'predominant', origin: 'diatonic', weight: 0.3, note: 'a tense, unsettled step away from home' },
  { roman: 'III', offset: 3, qualities: ['maj', 'maj7'], func: 'tonic', origin: 'diatonic', weight: 0.5, note: 'the relative major, a brighter version of home' },
  { roman: 'iv', offset: 5, qualities: ['min', 'm7'], func: 'predominant', origin: 'diatonic', weight: 0.8, note: 'a dark, lifting move away from home' },
  { roman: 'v', offset: 7, qualities: ['min', 'm7'], func: 'dominant', origin: 'diatonic', weight: 0.4, note: 'a softer dominant that leans back toward home' },
  { roman: 'VI', offset: 8, qualities: ['maj', 'maj7'], func: 'predominant', origin: 'diatonic', weight: 0.6, note: 'a wide, warm lift away from home' },
  { roman: '♭VII', offset: 10, qualities: ['maj', '7'], func: 'dominant', origin: 'diatonic', weight: 0.7, note: 'a bright step down that leads back toward home' },
  { roman: 'V', offset: 7, qualities: ['maj', '7'], func: 'dominant', origin: 'borrowed', weight: 0.9, note: 'the raised leading tone from harmonic minor makes the strongest pull home' },
]

const FLAT_MAJOR_TONICS = new Set([5, 10, 3, 8, 1])

export function degreesFor(key: Key): DegreeSpec[] {
  return key.mode === 'major' ? MAJOR_DEGREES : MINOR_DEGREES
}

export function keyUsesFlats(key: Key): boolean {
  const majorTonic = key.mode === 'major' ? key.tonic : mod12(key.tonic + 3)
  return FLAT_MAJOR_TONICS.has(majorTonic)
}

export function keyLabel(key: Key): string {
  return `${noteName(key.tonic, keyUsesFlats(key))} ${key.mode}`
}

export function allKeys(): Key[] {
  const keys: Key[] = []
  for (let tonic = 0; tonic < 12; tonic += 1) {
    keys.push({ tonic, mode: 'major' }, { tonic, mode: 'minor' })
  }
  return keys
}

// find the degree a chord plays in a key, preferring plain diatonic roles
export function matchDegree(key: Key, chord: Chord): DegreeSpec | null {
  const offset = mod12(chord.root - key.tonic)
  const candidates = degreesFor(key).filter((spec) => spec.offset === offset && spec.qualities.includes(chord.quality))
  if (candidates.length === 0) {
    return null
  }
  const order: Origin[] = ['diatonic', 'borrowed', 'secondary']
  return candidates.sort((a, b) => order.indexOf(a.origin) - order.indexOf(b.origin))[0]
}

export type KeyEstimate = { key: Key; probability: number }

const KEY_TEMPERATURE = 0.5
const MIN_KEY_PROBABILITY = 0.1
const MAX_KEYS = 3

export function inferKeys(history: Chord[]): KeyEstimate[] {
  if (history.length === 0) {
    return []
  }

  const last = history.length - 1
  const scored = allKeys().map((key) => {
    let score = 0
    history.forEach((chord, index) => {
      // later chords count a little more, since the key can move as the player does
      const recency = 1 + (last === 0 ? 0 : (index / last) * 0.5)
      const spec = matchDegree(key, chord)
      if (spec?.origin === 'diatonic') {
        score += recency * (0.5 + spec.weight)
      } else if (spec) {
        score += recency * 0.15
      } else if (QUALITIES[chord.quality].triad !== 'sus') {
        score -= recency
      }
    })

    const firstSpec = matchDegree(key, history[0])
    const lastSpec = matchDegree(key, history[last])
    const firstIsTonic = firstSpec?.origin === 'diatonic' && firstSpec.offset === 0
    const lastIsTonic = lastSpec?.origin === 'diatonic' && lastSpec.offset === 0
    if (last === 0) {
      score += firstIsTonic ? 0.5 : 0
    } else {
      score += (firstIsTonic ? 0.4 : 0) + (lastIsTonic ? 0.4 : 0)
    }
    return { key, score }
  })

  const peak = Math.max(...scored.map((entry) => entry.score))
  const weights = scored.map((entry) => ({ key: entry.key, weight: Math.exp((entry.score - peak) / KEY_TEMPERATURE) }))
  const total = weights.reduce((sum, entry) => sum + entry.weight, 0)
  const ranked = weights
    .map((entry) => ({ key: entry.key, probability: entry.weight / total }))
    .sort((a, b) => b.probability - a.probability)
    .filter((entry, index) => index === 0 || entry.probability >= MIN_KEY_PROBABILITY)
    .slice(0, MAX_KEYS)

  const kept = ranked.reduce((sum, entry) => sum + entry.probability, 0)
  return ranked.map((entry) => ({ key: entry.key, probability: entry.probability / kept }))
}
