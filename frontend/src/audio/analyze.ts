// this file runs one block of microphone audio through the whole pipeline.
// it is pure, so tests and the browser use exactly the same code path.
import { chromaFromSpectrum } from './chroma'
import { magnitudeSpectrum } from './fft'
import { recognizeChord, type Recognition } from './recognizer'

// below this level the signal is room noise, not a strummed chord
export const SILENCE_RMS = 0.008

export type Analysis = { rms: number; chroma: number[]; recognition: Recognition }

export function analyzeFrame(samples: Float32Array, sampleRate: number): Analysis {
  let sumSquares = 0
  for (let index = 0; index < samples.length; index += 1) {
    sumSquares += samples[index] * samples[index]
  }
  const rms = Math.sqrt(sumSquares / samples.length)

  const { chroma, bassPitch } = chromaFromSpectrum(magnitudeSpectrum(samples), sampleRate)
  if (rms < SILENCE_RMS) {
    return { rms, chroma, recognition: { chord: null, confidence: 0, candidates: [] } }
  }
  return { rms, chroma, recognition: recognizeChord(chroma, bassPitch) }
}
