// these tests pin the behavior of the theory suggestion engine.
// they cover chord parsing, key inference, and the shape of the suggestions.
import { describe, expect, it } from 'vitest'
import { chordPitchClasses, formatChord, parseChord, transposeChord, type Chord } from './chords'
import { inferKeys, keyLabel } from './keys'
import { suggestChords } from './suggest'

function chords(...symbols: string[]): Chord[] {
  return symbols.map((symbol) => {
    const chord = parseChord(symbol)
    if (!chord) {
      throw new Error(`bad chord in test: ${symbol}`)
    }
    return chord
  })
}

function symbolsFor(history: string[], limit = 8): string[] {
  return suggestChords(chords(...history), limit).map((suggestion) => suggestion.symbol)
}

describe('chord parsing', () => {
  it('round trips sharps, flats, and extended qualities', () => {
    for (const symbol of ['C', 'Am', 'F#m7', 'Bbmaj7', 'Edim', 'G7', 'Dsus4', 'Abm7b5']) {
      const chord = parseChord(symbol)
      expect(chord).not.toBeNull()
      expect(formatChord(chord!, /^[A-G]b/.test(symbol))).toBe(symbol)
    }
  })

  it('rejects text that is not a chord', () => {
    expect(parseChord('H')).toBeNull()
    expect(parseChord('Cxyz')).toBeNull()
  })

  it('builds the right notes for a chord', () => {
    expect(chordPitchClasses(parseChord('Am')!).sort((a, b) => a - b)).toEqual([0, 4, 9])
  })
})

describe('transposing for a capo', () => {
  it('a C shape with a capo on fret 3 sounds as Eb', () => {
    expect(formatChord(transposeChord(parseChord('C')!, 3), true)).toBe('Eb')
  })

  it('moving down by the capo recovers the shape', () => {
    const sounding = parseChord('Eb')!
    expect(formatChord(transposeChord(sounding, -3))).toBe('C')
  })

  it('wraps around the octave and keeps the quality', () => {
    expect(formatChord(transposeChord(parseChord('Am7')!, 5))).toBe('Dm7')
    expect(formatChord(transposeChord(parseChord('B')!, 1))).toBe('C')
  })
})

describe('key inference', () => {
  it('prefers the key where the chords are all diatonic', () => {
    const [best] = inferKeys(chords('C', 'F', 'G', 'C'))
    expect(keyLabel(best.key)).toBe('C major')
  })

  it('finds the minor key when the minor chord is home', () => {
    const [best] = inferKeys(chords('Am', 'Dm', 'E', 'Am'))
    expect(keyLabel(best.key)).toBe('A minor')
  })

  it('returns probabilities that sum to one', () => {
    const total = inferKeys(chords('C', 'Am')).reduce((sum, estimate) => sum + estimate.probability, 0)
    expect(total).toBeCloseTo(1)
  })

  it('returns nothing for an empty history', () => {
    expect(inferKeys([])).toEqual([])
  })
})

describe('suggestions', () => {
  it('returns nothing before any chord is played', () => {
    expect(suggestChords([])).toEqual([])
  })

  it('gives Am real suggestions, with no special case', () => {
    const suggestions = symbolsFor(['C', 'Am'])
    expect(suggestions.length).toBeGreaterThanOrEqual(4)
    expect(suggestions).not.toContain('Am')
  })

  it('never suggests the chord that was just played', () => {
    for (const history of [['C'], ['G'], ['Am'], ['F'], ['Dm'], ['F#m']]) {
      expect(symbolsFor(history)).not.toContain(history[0])
    }
  })

  it('suggests chords outside the original four, such as Dm and Em', () => {
    expect(symbolsFor(['C', 'Am'])).toEqual(expect.arrayContaining(['Dm']))
  })

  it('works in every key, not only the open-chord keys', () => {
    const suggestions = symbolsFor(['F#m', 'D', 'A'])
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions).toContain('E')
  })

  it('spells flat keys with flats and sharp keys with sharps', () => {
    expect(symbolsFor(['Bb', 'Eb', 'F'])).toEqual(expect.arrayContaining(['Bb']))
    expect(symbolsFor(['Bb', 'Eb', 'F']).join(' ')).not.toContain('#')
    expect(symbolsFor(['G', 'D', 'Em']).join(' ')).not.toMatch(/[A-G]b/)
  })

  it('ranks resolving to home first after a dominant', () => {
    const [first] = suggestChords(chords('C', 'F', 'G'), 5)
    expect(first.symbol).toBe('C')
    expect(first.roman).toBe('I')
    expect(first.score).toBe(1)
  })

  it('prefers the deceptive vi over iii after a dominant', () => {
    const symbols = symbolsFor(['C', 'F', 'G'])
    expect(symbols.indexOf('Am')).toBeLessThan(symbols.indexOf('Em'))
  })

  it('explains every suggestion', () => {
    for (const suggestion of suggestChords(chords('C', 'G'), 8)) {
      expect(suggestion.reason.length).toBeGreaterThan(10)
      expect(suggestion.key).toMatch(/major|minor/)
    }
  })

  it('keeps scores between zero and one, best first', () => {
    const scores = suggestChords(chords('Em'), 8).map((suggestion) => suggestion.score)
    expect(scores[0]).toBe(1)
    expect([...scores].sort((a, b) => b - a)).toEqual(scores)
    expect(Math.min(...scores)).toBeGreaterThan(0)
  })

  it('respects the limit', () => {
    expect(suggestChords(chords('C'), 3)).toHaveLength(3)
  })
})
