// this file matches a chroma profile against a template for every chord in the library.
// templates include overtones, because a guitar string also sounds its fifth and third above the note.
// weak or ambiguous evidence returns no chord, so the app can say Unknown honestly.
import { QUALITIES, mod12, sameChord, type Chord, type Quality } from '../theory/chords'

export type Candidate = { chord: Chord; score: number }

export type Recognition = {
  chord: Chord | null
  // 0 to 1, combines how well the best chord fits and how far it leads the runner-up
  confidence: number
  candidates: Candidate[]
}

// how strongly each overtone shows up, starting with the note itself
const HARMONIC_WEIGHTS = [1, 0.6, 0.45, 0.3, 0.2, 0.15]
// semitone distance of each overtone above the note, folded into one octave
const HARMONIC_SHIFTS = [0, 0, 7, 0, 4, 7]

// simple chords are far more common, so extended chords must fit noticeably better to win
const QUALITY_PRIOR: Record<Quality, number> = {
  maj: 1, min: 1, '7': 0.97, maj7: 0.96, m7: 0.97, sus4: 0.95, sus2: 0.95,
  dim: 0.94, aug: 0.92, m7b5: 0.93, dim7: 0.92, '6': 0.93, m6: 0.93,
}

const BASS_BONUS = 0.06
const FIT_FLOOR = 0.55
const FIT_RANGE = 0.4
const MARGIN_RANGE = 0.1
const MIN_CONFIDENCE = 0.3
const CANDIDATE_COUNT = 4

type Template = { chord: Chord; vector: number[] }

let templates: Template[] | null = null

function buildTemplates(): Template[] {
  const built: Template[] = []
  for (let root = 0; root < 12; root += 1) {
    for (const quality of Object.keys(QUALITIES) as Quality[]) {
      const vector = new Array<number>(12).fill(0)
      for (const interval of QUALITIES[quality].intervals) {
        HARMONIC_WEIGHTS.forEach((weight, harmonic) => {
          vector[mod12(root + interval + HARMONIC_SHIFTS[harmonic])] += weight
        })
      }
      const length = Math.hypot(...vector)
      built.push({ chord: { root, quality }, vector: vector.map((value) => value / length) })
    }
  }
  return built
}

function cosine(a: number[], unitB: number[]): number {
  const lengthA = Math.hypot(...a)
  if (lengthA === 0) {
    return 0
  }
  let dot = 0
  for (let index = 0; index < 12; index += 1) {
    dot += a[index] * unitB[index]
  }
  return dot / lengthA
}

export function recognizeChord(chroma: number[], bassPitch: number): Recognition {
  templates ??= buildTemplates()

  const scored = templates
    .map((template) => ({
      chord: template.chord,
      score: cosine(chroma, template.vector) * QUALITY_PRIOR[template.chord.quality] + (template.chord.root === bassPitch ? BASS_BONUS : 0),
    }))
    .sort((a, b) => b.score - a.score)

  const best = scored[0]
  // the runner-up must be a different chord, since overlapping qualities score alike by design
  const runnerUp = scored.find((entry) => !sameChord(entry.chord, best.chord)) ?? best
  const fit = Math.min(1, Math.max(0, (best.score - FIT_FLOOR) / FIT_RANGE))
  const margin = Math.min(1, Math.max(0, (best.score - runnerUp.score) / MARGIN_RANGE))
  const confidence = fit * (0.5 + 0.5 * margin)
  const candidates = scored.slice(0, CANDIDATE_COUNT)

  return { chord: confidence >= MIN_CONFIDENCE ? best.chord : null, confidence, candidates }
}
