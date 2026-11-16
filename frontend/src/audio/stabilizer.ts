// this file decides when a detected chord has been steady long enough to count as played.
// a strum settles over a few frames, so single noisy frames must not change the progression.
import { sameChord, type Chord } from '../theory/chords'

export class ChordStabilizer {
  private candidate: Chord | null = null
  private count = 0
  private committed: Chord | null = null

  constructor(private readonly framesNeeded = 4, private readonly minConfidence = 0.45) {}

  // returns the chord once it has held for enough frames, and only once per run
  push(chord: Chord | null, confidence: number): Chord | null {
    if (!chord || confidence < this.minConfidence) {
      this.candidate = null
      this.count = 0
      return null
    }

    if (this.candidate && sameChord(this.candidate, chord)) {
      this.count += 1
    } else {
      this.candidate = chord
      this.count = 1
    }

    if (this.count >= this.framesNeeded && !(this.committed && sameChord(this.committed, chord))) {
      this.committed = chord
      return chord
    }
    return null
  }

  // after silence the same chord can be played again and should count as a new strum
  release() {
    this.candidate = null
    this.count = 0
    this.committed = null
  }
}
