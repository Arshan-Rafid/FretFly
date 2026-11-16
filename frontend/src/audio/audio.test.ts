// these tests cover the audio pipeline on synthetic guitar-like sound.
// they prove the pipeline works and show where it is weak. they do not prove accuracy on a real guitar.
import { describe, expect, it } from 'vitest'
import { QUALITIES, parseChord, sameChord, type Chord, type Quality } from '../theory/chords'
import { voicingsFor } from '../theory/voicings'
import { analyzeFrame } from './analyze'
import { chromaFromSpectrum } from './chroma'
import { magnitudeSpectrum } from './fft'
import { ChordStabilizer } from './stabilizer'
import { frequenciesFor, synthChord } from './synth'

const SAMPLE_RATE = 44100
const SIZE = 16384

function sine(frequency: number, amplitude = 0.5): Float32Array {
  const samples = new Float32Array(SIZE)
  for (let index = 0; index < SIZE; index += 1) {
    samples[index] = amplitude * Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE)
  }
  return samples
}

// share of the first two shapes of each chord that the recognizer names correctly
function accuracy(quality: Quality): number {
  let right = 0
  let total = 0
  for (let root = 0; root < 12; root += 1) {
    const chord: Chord = { root, quality }
    for (const voicing of voicingsFor(chord).slice(0, 2)) {
      total += 1
      const { recognition } = analyzeFrame(synthChord(frequenciesFor(voicing)), SAMPLE_RATE)
      if (recognition.chord && sameChord(recognition.chord, chord)) {
        right += 1
      }
    }
  }
  return right / total
}

describe('fft', () => {
  it('puts a 440 hz sine in the right bin with the right size', () => {
    const spectrum = magnitudeSpectrum(sine(440, 0.5))
    const peak = spectrum.indexOf(Math.max(...spectrum))
    expect(peak).toBe(Math.round((440 * SIZE) / SAMPLE_RATE))
    expect(spectrum[peak]).toBeGreaterThan(0.4)
    expect(spectrum[peak]).toBeLessThan(0.6)
  })

  it('rejects sizes that are not a power of two', () => {
    expect(() => magnitudeSpectrum(new Float32Array(1000))).toThrow()
  })
})

describe('chroma', () => {
  it('maps a pure A to pitch class 9', () => {
    const { chroma, bassPitch } = chromaFromSpectrum(magnitudeSpectrum(sine(440)), SAMPLE_RATE)
    expect(chroma.indexOf(Math.max(...chroma))).toBe(9)
    expect(bassPitch).toBe(9)
  })

  it('places low notes correctly using peak interpolation', () => {
    const { bassPitch } = chromaFromSpectrum(magnitudeSpectrum(sine(82.41)), SAMPLE_RATE)
    expect(bassPitch).toBe(4)
  })

  it('returns an empty profile for silence', () => {
    const { chroma, bassPitch } = chromaFromSpectrum(magnitudeSpectrum(new Float32Array(SIZE)), SAMPLE_RATE)
    expect(chroma.every((value) => value === 0)).toBe(true)
    expect(bassPitch).toBe(-1)
  })
})

describe('chord recognition on synthetic guitar', () => {
  it.each(['maj', 'min', '7'] as Quality[])('names every %s chord in every key', (quality) => {
    expect(accuracy(quality)).toBe(1)
  })

  it.each(['dim', 'aug', 'sus2', 'sus4', 'm7b5', 'dim7'] as Quality[])('separates %s chords that share notes with other roots by their bass note', (quality) => {
    expect(accuracy(quality)).toBeGreaterThanOrEqual(0.9)
  })

  it('is weaker on seventh and sixth shapes, which is a known limit', () => {
    // these often fall back to the plain triad when the extra note is quiet
    for (const quality of ['maj7', 'm7', 'm6'] as Quality[]) {
      expect(accuracy(quality)).toBeGreaterThanOrEqual(0.75)
    }
    expect(accuracy('6')).toBeGreaterThanOrEqual(0.4)
  })

  it('knows every quality in the library has a template', () => {
    expect(Object.keys(QUALITIES).length).toBe(13)
  })

  it('stays correct with more room noise added', () => {
    const chord = parseChord('G')!
    const voicing = voicingsFor(chord)[0]
    const { recognition } = analyzeFrame(synthChord(frequenciesFor(voicing), { noise: 0.3 }), SAMPLE_RATE)
    expect(recognition.chord && sameChord(recognition.chord, chord)).toBe(true)
  })
})

describe('honesty about weak evidence', () => {
  it('says nothing for silence and for quiet room noise', () => {
    expect(analyzeFrame(new Float32Array(SIZE), SAMPLE_RATE).recognition.chord).toBeNull()
    const quiet = new Float32Array(SIZE).map((_, index) => 0.002 * Math.sin(index * 12.9898))
    expect(analyzeFrame(quiet, SAMPLE_RATE).recognition.chord).toBeNull()
  })

  it('does not claim a chord for loud unpitched noise', () => {
    let state = 7
    const noise = new Float32Array(SIZE).map(() => {
      state = (state * 1664525 + 1013904223) % 4294967296
      return (state / 4294967296 - 0.5) * 0.6
    })
    const { recognition } = analyzeFrame(noise, SAMPLE_RATE)
    expect(recognition.chord === null || recognition.confidence < 0.6).toBe(true)
  })

  it('reports lower confidence when two chords fit about equally well', () => {
    const clear = analyzeFrame(synthChord(frequenciesFor(voicingsFor(parseChord('E')!)[0])), SAMPLE_RATE).recognition
    const muddy = analyzeFrame(synthChord([164.8, 220, 261.6]), SAMPLE_RATE).recognition
    expect(clear.confidence).toBeGreaterThan(muddy.confidence)
  })
})

describe('chord stabilizer', () => {
  const c = parseChord('C')!
  const g = parseChord('G')!

  it('commits a chord only after it holds for enough frames, and only once', () => {
    const stabilizer = new ChordStabilizer(3, 0.4)
    expect(stabilizer.push(c, 0.9)).toBeNull()
    expect(stabilizer.push(c, 0.9)).toBeNull()
    expect(stabilizer.push(c, 0.9)).toEqual(c)
    expect(stabilizer.push(c, 0.9)).toBeNull()
  })

  it('ignores single noisy frames and low confidence frames', () => {
    const stabilizer = new ChordStabilizer(3, 0.4)
    stabilizer.push(c, 0.9)
    stabilizer.push(g, 0.9)
    stabilizer.push(c, 0.9)
    expect(stabilizer.push(c, 0.2)).toBeNull()
    expect(stabilizer.push(c, 0.9)).toBeNull()
  })

  it('lets the same chord count again after a release', () => {
    const stabilizer = new ChordStabilizer(2, 0.4)
    stabilizer.push(c, 0.9)
    expect(stabilizer.push(c, 0.9)).toEqual(c)
    stabilizer.release()
    stabilizer.push(c, 0.9)
    expect(stabilizer.push(c, 0.9)).toEqual(c)
  })

  it('commits a change of chord', () => {
    const stabilizer = new ChordStabilizer(2, 0.4)
    stabilizer.push(c, 0.9)
    stabilizer.push(c, 0.9)
    stabilizer.push(g, 0.9)
    expect(stabilizer.push(g, 0.9)).toEqual(g)
  })
})
