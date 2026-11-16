// this file folds a magnitude spectrum into twelve pitch-class energies, called chroma.
// it keeps only spectral peaks, so noise between the notes does not leak into the result.

const MIN_FREQUENCY = 70
const MAX_FREQUENCY = 2000
const PEAK_FLOOR = 0.04
// the lowest peak at least this loud is taken as the bass note, which helps find the chord root
const BASS_FLOOR = 0.25

export type ChromaResult = { chroma: number[]; bassPitch: number }

function frequencyToPitchClass(frequency: number): number {
  const midi = Math.round(69 + 12 * Math.log2(frequency / 440))
  return ((midi % 12) + 12) % 12
}

export function chromaFromSpectrum(magnitudes: Float32Array, sampleRate: number): ChromaResult {
  const size = magnitudes.length * 2
  const chroma = new Array<number>(12).fill(0)
  let bassPitch = -1
  const first = Math.max(1, Math.ceil((MIN_FREQUENCY * size) / sampleRate))
  const last = Math.min(magnitudes.length - 2, Math.floor((MAX_FREQUENCY * size) / sampleRate))

  let loudest = 0
  for (let bin = first; bin <= last; bin += 1) {
    loudest = Math.max(loudest, magnitudes[bin])
  }
  if (loudest <= 0) {
    return { chroma, bassPitch }
  }

  for (let bin = first; bin <= last; bin += 1) {
    const centre = magnitudes[bin]
    const below = magnitudes[bin - 1]
    const above = magnitudes[bin + 1]
    if (centre < PEAK_FLOOR * loudest || centre <= below || centre < above) {
      continue
    }

    // parabolic interpolation places the peak between bins, so low notes land on the right pitch
    const curvature = below - 2 * centre + above
    const offset = curvature === 0 ? 0 : (0.5 * (below - above)) / curvature
    const frequency = ((bin + offset) * sampleRate) / size
    const pitchClass = frequencyToPitchClass(frequency)
    const weight = Math.sqrt(centre / loudest)
    chroma[pitchClass] += weight
    // an octave overtone has the same pitch class, so a weak fundamental still gives the right note
    if (bassPitch < 0 && centre >= BASS_FLOOR * loudest) {
      bassPitch = pitchClass
    }
  }

  return { chroma: normalize(chroma), bassPitch }
}

function normalize(values: number[]): number[] {
  const peak = Math.max(...values)
  return peak > 0 ? values.map((value) => value / peak) : values
}
