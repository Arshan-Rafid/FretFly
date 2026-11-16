// this file owns the main practice surface for fretfly.
// it connects browser media controls to the chord readout and recommendations.
// it also renders the fretboard reference used by the frontend experience.
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { useEffect, useRef, useState, type MouseEvent } from 'react'

type ChordName = 'C' | 'G' | 'Am' | 'F'
type StringPosition = number | 'x'

type ChordDefinition = {
  name: ChordName
  positions: StringPosition[]
  suggested: ChordName
  color: string
}

type CalibrationPoint = { x: number; y: number }

// keep the first chord vocabulary local and data-driven for easy model replacement
const CHORDS: Record<ChordName, ChordDefinition> = {
  C: { name: 'C', positions: ['x', 3, 2, 0, 1, 0], suggested: 'G', color: '#f3b562' },
  G: { name: 'G', positions: [3, 2, 0, 0, 0, 3], suggested: 'Am', color: '#76c893' },
  Am: { name: 'Am', positions: ['x', 0, 2, 2, 1, 0], suggested: 'F', color: '#70a9a1' },
  F: { name: 'F', positions: [1, 3, 3, 2, 1, 1], suggested: 'C', color: '#f28482' },
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
  const [selectedChord, setSelectedChord] = useState<ChordName>('C')
  const [cameraState, setCameraState] = useState('camera offline')
  const [cameraError, setCameraError] = useState('')
  const [cameraInverted, setCameraInverted] = useState(false)
  const [guitarCalibrated, setGuitarCalibrated] = useState(false)
  const [calibrationPoints, setCalibrationPoints] = useState<CalibrationPoint[]>([])
  const [isCalibrating, setIsCalibrating] = useState(false)

  const chord = CHORDS[selectedChord]
  const confidence = 82

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
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
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
            {cameraError && <span className="error-text">{cameraError}</span>}
          </div>
        </div>

        <aside className="insight-panel">
          <div className="panel-heading"><div><span className="signal-icon">◌</span> fused readout</div><span className="mono">baseline / 0.1</span></div>
          <div className="detected-block">
            <p className="eyebrow">detected chord</p>
            <div className="detected-chord" style={{ color: chord.color }}>{chord.name}<span>major / open position</span></div>
            <div className="confidence-row"><span>confidence</span><strong>{confidence}%</strong></div>
            <div className="confidence-bar"><span style={{ width: `${confidence}%`, background: chord.color }} /></div>
          </div>
          <div className="next-block">
            <p className="eyebrow">try next</p>
            <div className="next-chord"><span className="arrow">→</span><strong>{chord.suggested}</strong><span>smooth transition</span></div>
          </div>
          <div className="signal-list"><div><span className="signal-dot visual" /> hand position <b>ready</b></div><div><span className="signal-dot audio" /> microphone <b>standby</b></div><div><span className="signal-dot fusion" /> guitar geometry <b>{guitarCalibrated ? 'calibrated' : 'manual guide'}</b></div></div>
        </aside>
      </section>

      <section className="diagram-section">
        <div className="section-heading"><div><p className="eyebrow">fretboard reference</p><h3>Shape library</h3></div><p>select a shape to explore the progression</p></div>
        <div className="shape-layout">
          <div className="chord-tabs">{(Object.keys(CHORDS) as ChordName[]).map((name) => <button key={name} className={name === selectedChord ? 'active' : ''} onClick={() => setSelectedChord(name)}>{name}</button>)}</div>
          <ChordDiagram chord={chord} />
        </div>
      </section>

      <footer><span>FRETFLY / OPEN SOURCE PRACTICE TOOL</span><span className="mono">camera + audio / local only</span></footer>
    </main>
  )
}

function ChordDiagram({ chord }: { chord: ChordDefinition }) {
  // map chord positions onto a stable six-string fretboard layout
  return <div className="diagram-card"><div className="diagram-title"><strong>{chord.name}</strong><span>standard tuning · E A D G B E</span></div><div className="diagram"><div className="nut" />{[0, 1, 2, 3, 4].map((fret) => <div className="fret" key={fret} />)}{[0, 1, 2, 3, 4, 5].map((stringIndex) => <div className="string" key={stringIndex} style={{ left: `${14 + stringIndex * 14.4}%` }} />)}{chord.positions.map((position, index) => position !== 0 && position !== 'x' && <span className="finger" key={index} style={{ left: `${14 + index * 14.4}%`, top: `${19 + (position - 1) * 17}%`, background: chord.color }}>{position}</span>)}{chord.positions.map((position, index) => position === 0 && <span className="open" key={index} style={{ left: `${14 + index * 14.4}%` }}>o</span>)}{chord.positions.map((position, index) => position === 'x' && <span className="muted" key={index} style={{ left: `${14 + index * 14.4}%` }}>×</span>)}</div></div>
}

export default App
