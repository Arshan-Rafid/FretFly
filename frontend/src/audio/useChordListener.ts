// this file connects the microphone stream to the audio pipeline.
// it analyzes a short window about ten times a second and reports chords that hold steady.
import { useEffect, useRef, useState } from 'react'
import type { Chord } from '../theory/chords'
import { SILENCE_RMS, analyzeFrame, type Analysis } from './analyze'
import { ChordStabilizer } from './stabilizer'

const FFT_SIZE = 16384
const INTERVAL_MS = 100
// about half a second of quiet means the next strum is a fresh chord, even if it repeats
const QUIET_FRAMES_BEFORE_RELEASE = 5

export type Listener = { active: boolean; analysis: Analysis | null }

export function useChordListener(stream: MediaStream | null, onStableChord: (chord: Chord) => void): Listener {
  const [listener, setListener] = useState<Listener>({ active: false, analysis: null })
  const callbackRef = useRef(onStableChord)

  useEffect(() => {
    callbackRef.current = onStableChord
  }, [onStableChord])

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      setListener({ active: false, analysis: null })
      return
    }

    const context = new AudioContext()
    const source = context.createMediaStreamSource(stream)
    const analyser = context.createAnalyser()
    analyser.fftSize = FFT_SIZE
    // the analyser is never connected to the speakers, so there is no feedback
    source.connect(analyser)
    void context.resume()

    const buffer = new Float32Array(analyser.fftSize)
    const stabilizer = new ChordStabilizer()
    let quietFrames = 0

    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buffer)
      const analysis = analyzeFrame(buffer, context.sampleRate)

      if (analysis.rms < SILENCE_RMS) {
        quietFrames += 1
        if (quietFrames >= QUIET_FRAMES_BEFORE_RELEASE) {
          stabilizer.release()
        }
      } else {
        quietFrames = 0
      }

      const committed = stabilizer.push(analysis.recognition.chord, analysis.recognition.confidence)
      if (committed) {
        callbackRef.current(committed)
      }
      setListener({ active: true, analysis })
    }, INTERVAL_MS)

    return () => {
      window.clearInterval(timer)
      source.disconnect()
      void context.close()
    }
  }, [stream])

  return listener
}
