// this file defines chords as data: a root pitch class plus a quality.
// every chord name is generated from this model, so new qualities need no new code paths.
// it also parses and formats chord symbols for the ui and the suggestion engine.

export type Quality =
  | 'maj' | 'min' | 'dim' | 'aug' | 'sus2' | 'sus4'
  | '7' | 'maj7' | 'm7' | 'm7b5' | 'dim7' | '6' | 'm6'

export type TriadClass = 'maj' | 'min' | 'dim' | 'aug' | 'sus'

export type Chord = { root: number; quality: Quality }

export const QUALITIES: Record<Quality, { suffix: string; intervals: number[]; triad: TriadClass }> = {
  maj: { suffix: '', intervals: [0, 4, 7], triad: 'maj' },
  min: { suffix: 'm', intervals: [0, 3, 7], triad: 'min' },
  dim: { suffix: 'dim', intervals: [0, 3, 6], triad: 'dim' },
  aug: { suffix: 'aug', intervals: [0, 4, 8], triad: 'aug' },
  sus2: { suffix: 'sus2', intervals: [0, 2, 7], triad: 'sus' },
  sus4: { suffix: 'sus4', intervals: [0, 5, 7], triad: 'sus' },
  '7': { suffix: '7', intervals: [0, 4, 7, 10], triad: 'maj' },
  maj7: { suffix: 'maj7', intervals: [0, 4, 7, 11], triad: 'maj' },
  m7: { suffix: 'm7', intervals: [0, 3, 7, 10], triad: 'min' },
  m7b5: { suffix: 'm7b5', intervals: [0, 3, 6, 10], triad: 'dim' },
  dim7: { suffix: 'dim7', intervals: [0, 3, 6, 9], triad: 'dim' },
  '6': { suffix: '6', intervals: [0, 4, 7, 9], triad: 'maj' },
  m6: { suffix: 'm6', intervals: [0, 3, 7, 9], triad: 'min' },
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const LETTER_TO_PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

// common alternate spellings that people type for the same quality
const SUFFIX_ALIASES: Record<string, Quality> = {
  min: 'min', '-': 'min', M: 'maj', major: 'maj',
  o: 'dim', '°': 'dim', '+': 'aug',
  ma7: 'maj7', M7: 'maj7', 'Δ': 'maj7', min7: 'm7', '-7': 'm7', 'ø': 'm7b5', 'ø7': 'm7b5',
}

const SUFFIX_TO_QUALITY = new Map<string, Quality>([
  ...(Object.entries(QUALITIES) as [Quality, (typeof QUALITIES)[Quality]][]).map(([quality, info]) => [info.suffix, quality] as [string, Quality]),
  ...Object.entries(SUFFIX_ALIASES),
])

export function mod12(value: number): number {
  return ((value % 12) + 12) % 12
}

export function noteName(pitchClass: number, flats = false): string {
  return (flats ? FLAT_NAMES : SHARP_NAMES)[mod12(pitchClass)]
}

export function formatChord(chord: Chord, flats = false): string {
  return noteName(chord.root, flats) + QUALITIES[chord.quality].suffix
}

export function parseChord(symbol: string): Chord | null {
  const match = /^([A-G])([#b]?)(.*)$/.exec(symbol.trim())
  if (!match) {
    return null
  }

  const [, letter, accidental, suffix] = match
  const quality = SUFFIX_TO_QUALITY.get(suffix)
  if (!quality) {
    return null
  }

  const shift = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0
  return { root: mod12(LETTER_TO_PITCH[letter] + shift), quality }
}

export function chordPitchClasses(chord: Chord): number[] {
  return QUALITIES[chord.quality].intervals.map((interval) => mod12(chord.root + interval))
}

// move a chord up or down by semitones, used to convert between a fretted shape and its sounding pitch
export function transposeChord(chord: Chord, semitones: number): Chord {
  return { root: mod12(chord.root + semitones), quality: chord.quality }
}

export function sameChord(a: Chord, b: Chord): boolean {
  return a.root === b.root && a.quality === b.quality
}
