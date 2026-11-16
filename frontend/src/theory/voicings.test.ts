// these tests check that generated fingerings are playable, correct, and include the familiar open shapes.
import { describe, expect, it } from 'vitest'
import { QUALITIES, chordPitchClasses, mod12, parseChord, type Quality } from './chords'
import { OPEN_STRINGS, diagramLayout, fretString, voicingsFor } from './voicings'

function shapes(symbol: string): string[] {
  return voicingsFor(parseChord(symbol)!).map(fretString)
}

describe('familiar open shapes', () => {
  it.each([
    ['C', 'x32010'],
    ['G', '320003'],
    ['Am', 'x02210'],
    ['Em', '022000'],
    ['E', '022100'],
    ['A', 'x02220'],
    ['D', 'xx0232'],
    ['Dm', 'xx0231'],
    ['E7', '020100'],
    ['G7', '320001'],
  ])('%s includes %s', (symbol, expected) => {
    expect(shapes(symbol)).toContain(expected)
  })

  it('finds an F shape, either small or barred', () => {
    const found = shapes('F')
    expect(found.some((shape) => shape === 'xx3211' || shape === '133211')).toBe(true)
  })

  it('offers the real barre Bb and does not lead with the awkward split-finger shape', () => {
    expect(shapes('Bb')).toContain('x13331')
    expect(shapes('Bb')[0]).not.toBe('x10331')
  })

  it('ranks the plain open C first', () => {
    expect(shapes('C')[0]).toBe('x32010')
  })
})

describe('every generated fingering is valid', () => {
  const qualities = Object.keys(QUALITIES) as Quality[]

  it('sounds only chord tones, with the root in the bass and at most four fingers', () => {
    for (let root = 0; root < 12; root += 1) {
      for (const quality of qualities) {
        const chord = { root, quality }
        const tones = new Set(chordPitchClasses(chord))
        for (const voicing of voicingsFor(chord)) {
          const sounding = voicing.frets.flatMap((fret, string) => (fret === 'x' ? [] : [mod12(OPEN_STRINGS[string] + fret)]))
          expect(sounding.every((pitch) => tones.has(pitch))).toBe(true)
          expect(sounding[0]).toBe(root)
          expect(sounding.length).toBeGreaterThanOrEqual(4)
          expect(voicing.fingers).toBeLessThanOrEqual(4)
        }
      }
    }
  })

  it('gives every common chord at least one shape in all twelve keys', () => {
    for (let root = 0; root < 12; root += 1) {
      for (const quality of ['maj', 'min', '7', 'maj7', 'm7'] as Quality[]) {
        expect(voicingsFor({ root, quality }).length).toBeGreaterThan(0)
      }
    }
  })

  it('returns at most four alternatives, easiest first', () => {
    const list = voicingsFor(parseChord('F#m')!)
    expect(list.length).toBeLessThanOrEqual(4)
    const difficulties = list.map((voicing) => voicing.difficulty)
    expect([...difficulties].sort((a, b) => a - b)).toEqual(difficulties)
  })
})

describe('diagram layout', () => {
  it('keeps open shapes at the nut', () => {
    const layout = diagramLayout(voicingsFor(parseChord('C')!)[0])
    expect(layout.baseFret).toBe(1)
  })

  it('shifts shapes that sit high on the neck and keeps positions within four frets', () => {
    let shifted = 0
    for (let root = 0; root < 12; root += 1) {
      for (const voicing of voicingsFor({ root, quality: 'min' })) {
        const layout = diagramLayout(voicing)
        if (layout.baseFret > 1) {
          shifted += 1
        }
        for (const fret of layout.relative) {
          if (typeof fret === 'number') {
            expect(fret).toBeLessThanOrEqual(4)
          }
        }
      }
    }
    expect(shifted).toBeGreaterThan(0)
  })

  it('reports a barre for a full barre chord', () => {
    expect(voicingsFor(parseChord('F#m')!).some((voicing) => voicing.barre !== null)).toBe(true)
  })
})
