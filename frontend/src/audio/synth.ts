// this file builds guitar-like test audio from a fingering, for tests and for checking the recognizer offline.
// it is a rough model: harmonics, a decaying envelope, and a little noise. real recordings will differ.
import { OPEN_STRINGS, type Voicing } from '../theory/voicings'

// open string frequencies in standard tuning, low e to high e
const OPEN_FREQUENCIES = [82.407, 110, 146.832, 195.998, 246.942, 329.628]

export type SynthOptions = { sampleRate?: number; size?: number; noise?: number; harmonics?: number; seed?: number }

export function frequenciesFor(voicing: Voicing): number[] {
  return voicing.frets.flatMap((fret, string) => (fret === 'x' ? [] : [OPEN_FREQUENCIES[string] * 2 ** (fret / 12)]))
}

export function synthChord(frequencies: number[], options: SynthOptions = {}): Float32Array {
  const { sampleRate = 44100, size = 16384, noise = 0.02, harmonics = 8, seed = 1 } = options
  const samples = new Float32Array(size)
  let state = seed
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296 - 0.5
  }

  frequencies.forEach((frequency, index) => {
    // each string is plucked a few milliseconds apart, like a real strum
    const delay = Math.floor((index * 0.004) * sampleRate)
    for (let harmonic = 1; harmonic <= harmonics; harmonic += 1) {
      const partial = frequency * harmonic
      if (partial > sampleRate / 2) {
        break
      }
      const amplitude = 0.12 / harmonic
      for (let time = delay; time < size; time += 1) {
        const seconds = (time - delay) / sampleRate
        samples[time] += amplitude * Math.exp(-seconds * (1.5 + harmonic * 0.4)) * Math.sin(2 * Math.PI * partial * seconds)
      }
    }
  })

  for (let time = 0; time < size; time += 1) {
    samples[time] += noise * 0.1 * random()
  }
  return samples
}

export { OPEN_STRINGS }
