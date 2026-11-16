// this file owns the main practice surface for fretfly.
// it connects browser media controls to the chord readout and recommendations.
// it also renders the fretboard reference used by the frontend experience.
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { QUALITIES, formatChord, noteName, parseChord, sameChord, transposeChord, type Chord, type Quality } from './theory/chords'
import { inferKeys, keyLabel, keyUsesFlats } from './theory/keys'
import { suggestChords, type Suggestion } from './theory/suggest'
import { diagramLayout, voicingsFor, type Voicing } from './theory/voicings'
import { SILENCE_RMS } from './audio/analyze'
import { useChordListener } from './audio/useChordListener'

type CalibrationPoint = { x: number; y: number }

const ROOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const QUALITY_LIST = Object.keys(QUALITIES) as Quality[]

// each root gets its own hue so a chord keeps one color everywhere it appears
function chordColor(chord: Chord): string {
  return `hsl(${chord.root * 30} 62% 70%)`
}

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
] as const

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const handLandmarkerRef = useRef<HandLandmarker | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const lastVideoTimeRef = useRef(-1)
  const [history, setHistory] = useState<Chord[]>(() => [parseChord('C')!])
  // manual capo is the fallback until the camera can detect one on its own
  const [capoOn, setCapoOn] = useState(false)
  const [capoText, setCapoText] = useState('2')
  const [pickQuality, setPickQuality] = useState<Quality>('maj')
  const [voicingIndex, setVoicingIndex] = useState(0)
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null)
  const [cameraState, setCameraState] = useState('camera offline')
  const [cameraError, setCameraError] = useState('')
  const [cameraInverted, setCameraInverted] = useState(false)
  const [guitarCalibrated, setGuitarCalibrated] = useState(false)
  const [calibrationPoints, setCalibrationPoints] = useState<CalibrationPoint[]>([])
  const [isCalibrating, setIsCalibrating] = useState(false)

  const keyEstimates = useMemo(() => inferKeys(history), [history])
  const suggestions = useMemo(() => suggestChords(history, 5, keyEstimates), [history, keyEstimates])
  const topKey = keyEstimates[0]
  const currentChord = history[history.length - 1]
  const capoNumber = Number(capoText)
  const capoValid = Number.isInteger(capoNumber) && capoNumber >= 1 && capoNumber <= 12
  const capo = capoOn && capoValid ? capoNumber : 0
  // history holds sounding chords, since theory depends on pitch; shapes are what the hand plays
  const currentSymbol = formatChord(currentChord, topKey ? keyUsesFlats(topKey.key) : false)
  const shapeChord = transposeChord(currentChord, -capo)
  const shapeSymbol = formatChord(shapeChord)
  const voicings = useMemo(() => voicingsFor(shapeChord), [shapeChord.root, shapeChord.quality])
  const voicing: Voicing | undefined = voicings[Math.min(voicingIndex, voicings.length - 1)]
  const accent = chordColor(currentChord)

  // every chord played, picked, or tapped from a suggestion extends the running progression
  function playChord(next: Chord) {
    setVoicingIndex(0)
    setHistory((previous) => (sameChord(previous[previous.length - 1], next) ? previous : [...previous, next]))
  }

  // tapping a shape sounds higher by the capo fret
  function playShape(shape: Chord) {
    playChord(transposeChord(shape, capo))
  }

  // the microphone hears sounding pitch, so a heard chord goes straight into the progression
  const listener = useChordListener(audioStream, playChord)
  const heard = listener.analysis?.recognition ?? null
  const isQuiet = listener.analysis ? listener.analysis.rms < SILENCE_RMS : true
  const flats = topKey ? keyUsesFlats(topKey.key) : false
  const headline = listener.active ? (heard?.chord ? formatChord(heard.chord, flats) : isQuiet ? '–' : 'Unknown') : currentSymbol
  const headlineColor = listener.active && heard?.chord ? chordColor(heard.chord) : accent
  const confidencePercent = listener.active ? Math.round((heard?.confidence ?? 0) * 100) : 0

  function startOver() {
    setHistory([currentChord])
  }

  function beginCalibration() {
    setCalibrationPoints([])
    setGuitarCalibrated(false)
    setIsCalibrating(true)
    setCameraError('click the four fretboard corners, starting at the nut')
  }

  function captureCalibrationPoint(event: MouseEvent<HTMLDivElement>) {
    if (!isCalibrating || calibrationPoints.length >= 4) {
      return
    }

    const bounds = event.currentTarget.getBoundingClientRect()
    const nextPoint = {
      x: ((event.clientX - bounds.left) / bounds.width) * 100,
      y: ((event.clientY - bounds.top) / bounds.height) * 100,
    }
    const nextPoints = [...calibrationPoints, nextPoint]
    setCalibrationPoints(nextPoints)
    if (nextPoints.length === 4) {
      setIsCalibrating(false)
      setGuitarCalibrated(true)
      setCameraError('fretboard calibrated for this camera position')
      window.localStorage.setItem('fretfly-calibration', JSON.stringify(nextPoints))
    } else {
      setCameraError(`corner ${nextPoints.length} captured, select corner ${nextPoints.length + 1}`)
    }
  }

  useEffect(() => {
    const savedCalibration = window.localStorage.getItem('fretfly-calibration')
    if (savedCalibration) {
      try {
        const points = JSON.parse(savedCalibration) as CalibrationPoint[]
        if (points.length === 4) {
          setCalibrationPoints(points)
          setGuitarCalibrated(true)
        }
      } catch {
        window.localStorage.removeItem('fretfly-calibration')
      }
    }
  }, [])

  useEffect(() => {
    // stop captured tracks when the page leaves the practice session
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      handLandmarkerRef.current?.close()
      const stream = videoRef.current?.srcObject as MediaStream | null
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  function drawHandLandmarks(results: ReturnType<HandLandmarker['detectForVideo']>) {
    const canvas = canvasRef.current
    const video = videoRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !video || !context || video.videoWidth === 0) {
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.strokeStyle = '#f3b562'
    context.lineWidth = Math.max(2, canvas.width / 320)
    context.fillStyle = '#76c893'

    for (const landmarks of results.landmarks) {
      for (const [start, end] of HAND_CONNECTIONS) {
        const first = landmarks[start]
        const second = landmarks[end]
        context.beginPath()
        context.moveTo(first.x * canvas.width, first.y * canvas.height)
        context.lineTo(second.x * canvas.width, second.y * canvas.height)
        context.stroke()
      }

      for (const landmark of landmarks) {
        context.beginPath()
        context.arc(landmark.x * canvas.width, landmark.y * canvas.height, 5, 0, Math.PI * 2)
        context.fill()
      }
    }
  }

  function trackHands() {
    const video = videoRef.current
    const detector = handLandmarkerRef.current
    if (!video || !detector) {
      return
    }

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime
      drawHandLandmarks(detector.detectForVideo(video, performance.now()))
    }
    animationFrameRef.current = requestAnimationFrame(trackHands)
  }

  async function initializeHandTracking() {
    try {
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm')
      handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: '/models/hand_landmarker.task' },
        runningMode: 'VIDEO',
        numHands: 1,
      })
      setCameraState('camera and hand tracking live')
      trackHands()
    } catch {
      setCameraState('camera live, hand tracking unavailable')
      setCameraError('add the hand landmark model to frontend/public/models to enable tracking')
    }
  }

  async function startCamera() {
    // keep permission failures visible while preserving manual mode
    setCameraError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is unavailable in this browser or context.')
      return
    }

    try {
      const previousStream = videoRef.current?.srcObject as MediaStream | null
      previousStream?.getTracks().forEach((track) => track.stop())
      // browser voice processing damages guitar tone, so echo cancellation, noise suppression, and gain control stay off
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setAudioStream(stream)
      setCameraState('camera and microphone live')
      await initializeHandTracking()
    } catch {
      setCameraError('Permission was not granted. The demo still works in manual mode.')
      setCameraState('manual mode')
    }
  }

  // compose the capture surface, fused readout, and reference library
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark">GV</span>
          <div>
            <p className="eyebrow">local multimodal lab</p>
            <h1>FretFly</h1>
          </div>
        </div>
        <div className="privacy-chip"><span /> processing stays on this device</div>
      </header>

      <section className="intro-row">
        <div>
          <p className="eyebrow">practice session / 01</p>
          <h2>See the chord.<br /><em>Hear the next one.</em></h2>
        </div>
        <p className="intro-copy">A local-first experiment in camera landmarks, audio features, and useful musical guidance.</p>
      </section>

      <section className="workspace">
        <div className="camera-panel">
          <div className="panel-heading">
            <div><span className="live-dot" /> vision input</div>
            <span className="mono">{cameraState}</span>
          </div>
          <div className={`camera-stage${isCalibrating ? ' calibration-active' : ''}`} onClick={captureCalibrationPoint}>
            <video ref={videoRef} muted playsInline className={`camera-feed${cameraInverted ? ' inverted' : ''}`} />
            <canvas ref={canvasRef} className={`landmark-canvas${cameraInverted ? ' inverted' : ''}`} aria-label="hand landmark overlay" />
            <div className={cameraState.includes('live') ? 'camera-placeholder hidden' : 'camera-placeholder'}><span className="camera-glyph">⌁</span><p>your camera view will appear here</p><small>place the fretting hand inside the frame</small></div>
            <div className="scan-line" />
            <div className={`zone-guide fretboard-zone${guitarCalibrated ? ' calibrated' : ''}`}><span>fretboard / fretting</span></div>
            <div className={`zone-guide strumming-zone${guitarCalibrated ? ' calibrated' : ''}`}><span>strumming</span></div>
            {calibrationPoints.length > 0 && <svg className={`calibration-overlay${cameraInverted ? ' inverted' : ''}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="calibrated fretboard outline"><polyline points={calibrationPoints.map(({ x, y }) => `${x},${y}`).join(' ')} /></svg>}
            {calibrationPoints.map((point, index) => <span className="calibration-point" key={`${point.x}-${point.y}`} style={{ left: `${point.x}%`, top: `${point.y}%` }}>{index + 1}</span>)}
          </div>
          <div className="camera-footer">
            <button className="primary-button" onClick={startCamera}>start camera + mic <span>↗</span></button>
            <button className="camera-toggle" onClick={() => setCameraInverted((inverted) => !inverted)} aria-pressed={cameraInverted}>{cameraInverted ? 'camera inverted' : 'camera upright'} <span>↻</span></button>
            <button className="camera-toggle" onClick={beginCalibration} aria-pressed={isCalibrating}>{isCalibrating ? `click corner ${calibrationPoints.length + 1}/4` : guitarCalibrated ? 'recalibrate guitar' : 'calibrate guitar'} <span>⌖</span></button>
            <button className="camera-toggle" onClick={() => setCapoOn((on) => !on)} aria-pressed={capoOn}>{capoOn ? 'capo on' : 'capo off'} <span>⊓</span></button>
            {capoOn && <label className={`capo-field${capoValid ? '' : ' invalid'}`}>fret <input type="number" min={1} max={12} inputMode="numeric" value={capoText} onChange={(event) => setCapoText(event.target.value)} aria-label="capo fret" /></label>}
            {cameraError && <span className="error-text">{cameraError}</span>}
          </div>
        </div>

        <aside className="insight-panel">
          <div className="panel-heading"><div><span className="signal-icon">◌</span> fused readout</div><span className="mono">baseline / 0.1</span></div>
          <div className="detected-block">
            <p className="eyebrow">detected chord</p>
            <div className="detected-chord" style={{ color: headlineColor }}>{headline}<span>{listener.active ? `heard now · progression is at ${currentSymbol}` : topKey ? `likely key: ${keyLabel(topKey.key)}` : 'play a chord'}{capo > 0 ? ` · ${shapeSymbol} shape, capo ${capo}` : ''}</span></div>
            <div className="confidence-row"><span>confidence</span><strong>{listener.active ? `${confidencePercent}%` : 'mic off'}</strong></div>
            <div className="confidence-bar"><span style={{ width: `${confidencePercent}%`, background: headlineColor }} /></div>
            {listener.active && listener.analysis && (
              <div className="listen-panel">
                <div className="level-bar" aria-label="microphone level"><span style={{ width: `${Math.min(100, listener.analysis.rms * 400)}%` }} /></div>
                <div className="chroma-bars" aria-label="notes heard">{listener.analysis.chroma.map((value, pitch) => <div key={pitch} className="chroma-bar"><span style={{ height: `${Math.round(value * 100)}%` }} /><small>{noteName(pitch)}</small></div>)}</div>
                <p className="candidates">{isQuiet ? 'strum a chord, close to the microphone' : heard && heard.candidates.length > 1 ? `also close: ${heard.candidates.slice(1, 4).map((candidate) => formatChord(candidate.chord, flats)).join(' · ')}` : ''}</p>
              </div>
            )}
          </div>
          <div className="next-block">
            <p className="eyebrow">try next</p>
            <div className="suggestion-list">
              {suggestions.map((suggestion) => <SuggestionRow key={suggestion.symbol} suggestion={suggestion} shape={capo > 0 ? formatChord(transposeChord(suggestion.chord, -capo)) : null} onPlay={() => playChord(suggestion.chord)} />)}
            </div>
            <div className="progression-row">
              <span className="progression">{history.slice(-8).map((played) => formatChord(played, topKey ? keyUsesFlats(topKey.key) : false)).join(' → ')}</span>
              {history.length > 1 && <button className="camera-toggle" onClick={startOver}>start over</button>}
            </div>
          </div>
          <div className="signal-list"><div><span className="signal-dot visual" /> hand position <b>ready</b></div><div><span className="signal-dot audio" /> microphone <b>{listener.active ? (isQuiet ? 'quiet' : 'listening') : 'off'}</b></div><div><span className="signal-dot fusion" /> guitar geometry <b>{guitarCalibrated ? 'calibrated' : 'manual guide'}</b></div></div>
        </aside>
      </section>

      <section className="diagram-section">
        <div className="section-heading"><div><p className="eyebrow">fretboard reference</p><h3>Chord library</h3></div><p>every root and quality in standard tuning. pick one, or tap a suggestion, to keep building the progression</p></div>
        <div className="shape-layout">
          <div className="chord-picker">
            <div className="chord-tabs">{ROOTS.map((root) => <button key={root} className={root === shapeChord.root && pickQuality === shapeChord.quality ? 'active' : ''} onClick={() => playShape({ root, quality: pickQuality })}>{noteName(root)}</button>)}</div>
            <label className="quality-field">quality <select value={pickQuality} onChange={(event) => setPickQuality(event.target.value as Quality)}>{QUALITY_LIST.map((quality) => <option key={quality} value={quality}>{QUALITIES[quality].suffix || 'major'}{QUALITIES[quality].suffix === 'm' ? ' (minor)' : ''}</option>)}</select></label>
          </div>
          {voicing ? <ChordDiagram name={shapeSymbol} voicing={voicing} color={accent} index={Math.min(voicingIndex, voicings.length - 1)} total={voicings.length} onStep={(step) => setVoicingIndex((index) => (index + step + voicings.length) % voicings.length)} /> : <div className="diagram-card"><div className="diagram-title"><strong>{shapeSymbol}</strong><span>no easy shape found</span></div><p>no playable fingering fit in four frets and four fingers. the suggestion engine still works for this chord.</p></div>}
        </div>
      </section>

      <footer><span>FRETFLY / OPEN SOURCE PRACTICE TOOL</span><span className="mono">camera + audio / local only</span></footer>
    </main>
  )
}

function SuggestionRow({ suggestion, shape, onPlay }: { suggestion: Suggestion; shape: string | null; onPlay: () => void }) {
  // each suggestion shows its role and the reason, so the player learns why it fits
  return (
    <button className={`suggestion-row ${suggestion.origin}`} onClick={onPlay}>
      <strong>{suggestion.symbol}{shape && <small>play {shape}</small>}</strong>
      <span className="suggestion-roman">{suggestion.roman}{suggestion.origin !== 'diatonic' ? ` · ${suggestion.origin}` : ''}</span>
      <span className="suggestion-reason">{suggestion.reason}</span>
      <span className="suggestion-bar"><span style={{ width: `${Math.round(suggestion.score * 100)}%` }} /></span>
    </button>
  )
}

function ChordDiagram({ name, voicing, color, index, total, onStep }: { name: string; voicing: Voicing; color: string; index: number; total: number; onStep: (step: number) => void }) {
  // place the shape on a four-fret diagram and show a fret number when it sits up the neck
  const { baseFret, relative, barre } = diagramLayout(voicing)
  const stringLeft = (stringIndex: number) => `${14 + stringIndex * 14.4}%`
  const fretTop = (fret: number) => `${19 + (fret - 1) * 17}%`
  return (
    <div className="diagram-card">
      <div className="diagram-title">
        <strong>{name}</strong>
        <span>standard tuning · E A D G B E</span>
        <div className="voicing-nav">
          <button className="camera-toggle" onClick={() => onStep(-1)} disabled={total < 2} aria-label="previous shape">‹</button>
          <span>shape {index + 1} of {total} · {voicing.fingers} {voicing.fingers === 1 ? 'finger' : 'fingers'}{voicing.barre ? ' · barre' : ''}</span>
          <button className="camera-toggle" onClick={() => onStep(1)} disabled={total < 2} aria-label="next shape">›</button>
        </div>
      </div>
      <div className="diagram">
        <div className={baseFret > 1 ? 'nut thin' : 'nut'} />
        {baseFret > 1 && <span className="fret-label">{baseFret}fr</span>}
        {[0, 1, 2, 3, 4].map((fret) => <div className="fret" key={fret} />)}
        {[0, 1, 2, 3, 4, 5].map((stringIndex) => <div className="string" key={stringIndex} style={{ left: stringLeft(stringIndex) }} />)}
        {barre && <span className="barre" style={{ left: stringLeft(barre.from), width: `calc(${(barre.to - barre.from) * 14.4}% + 25px)`, top: fretTop(barre.fret), background: color }} />}
        {relative.map((position, stringIndex) => typeof position === 'number' && position > 0 && <span className="finger" key={`f${stringIndex}`} style={{ left: stringLeft(stringIndex), top: fretTop(position), background: color }}>{position + baseFret - 1}</span>)}
        {relative.map((position, stringIndex) => position === 0 && <span className="open" key={`o${stringIndex}`} style={{ left: stringLeft(stringIndex) }}>o</span>)}
        {relative.map((position, stringIndex) => position === 'x' && <span className="muted" key={`x${stringIndex}`} style={{ left: stringLeft(stringIndex) }}>×</span>)}
      </div>
    </div>
  )
}

export default App
