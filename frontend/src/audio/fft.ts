// this file turns a block of audio samples into a magnitude spectrum.
// it is a plain radix-2 fft with a hann window, so the same code runs in the browser and in tests.

type Tables = { window: Float64Array; cos: Float64Array; sin: Float64Array; reversed: Uint32Array }

const tableCache = new Map<number, Tables>()

function tablesFor(size: number): Tables {
  const cached = tableCache.get(size)
  if (cached) {
    return cached
  }

  const bits = Math.log2(size)
  if (!Number.isInteger(bits)) {
    throw new Error('fft size must be a power of two')
  }

  const window = new Float64Array(size)
  const cos = new Float64Array(size / 2)
  const sin = new Float64Array(size / 2)
  const reversed = new Uint32Array(size)
  for (let index = 0; index < size; index += 1) {
    window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (size - 1))
    let value = index
    let result = 0
    for (let bit = 0; bit < bits; bit += 1) {
      result = (result << 1) | (value & 1)
      value >>= 1
    }
    reversed[index] = result
  }
  for (let index = 0; index < size / 2; index += 1) {
    cos[index] = Math.cos((2 * Math.PI * index) / size)
    sin[index] = -Math.sin((2 * Math.PI * index) / size)
  }

  const tables = { window, cos, sin, reversed }
  tableCache.set(size, tables)
  return tables
}

// returns size / 2 magnitudes, scaled so a full-scale sine reads close to 1
export function magnitudeSpectrum(samples: Float32Array): Float32Array {
  const size = samples.length
  const { window, cos, sin, reversed } = tablesFor(size)
  const real = new Float64Array(size)
  const imag = new Float64Array(size)
  for (let index = 0; index < size; index += 1) {
    real[reversed[index]] = samples[index] * window[index]
  }

  for (let span = 2; span <= size; span *= 2) {
    const half = span / 2
    const step = size / span
    for (let start = 0; start < size; start += span) {
      for (let offset = 0; offset < half; offset += 1) {
        const twiddleCos = cos[offset * step]
        const twiddleSin = sin[offset * step]
        const top = start + offset
        const bottom = top + half
        const productReal = real[bottom] * twiddleCos - imag[bottom] * twiddleSin
        const productImag = real[bottom] * twiddleSin + imag[bottom] * twiddleCos
        real[bottom] = real[top] - productReal
        imag[bottom] = imag[top] - productImag
        real[top] += productReal
        imag[top] += productImag
      }
    }
  }

  const magnitudes = new Float32Array(size / 2)
  const scale = 4 / size
  for (let index = 0; index < size / 2; index += 1) {
    magnitudes[index] = Math.hypot(real[index], imag[index]) * scale
  }
  return magnitudes
}
