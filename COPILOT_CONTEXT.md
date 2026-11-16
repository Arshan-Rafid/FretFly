# FretFly

## Product goal

Build a free, local-first guitar practice assistant that uses a webcam and microphone to estimate the chord being played, show the fretting position, suggest a musically useful next chord, and display the result as a live camera overlay.

The first release is a focused prototype for common open chords. It must be honest about confidence and show `Unknown` when the available evidence is insufficient.

## Repository

- GitHub: `Arshan-Rafid/FretFly`
- Local path: `C:\Users\Arshan Rafid\Projects\Guitar_Chord_Vision`
- Branch: `main`

## Core constraints

- Keep the project free and practical for a student budget.
- Prefer local processing and open-source software.
- Do not require paid cloud APIs, always-on cloud GPUs, or private media storage.
- Never commit camera recordings, microphone recordings, credentials, downloaded model weights, or generated datasets.
- Use small pretrained models and deterministic baselines before training custom models.
- Preserve a usable demo even when camera or microphone access is unavailable.

## Planned stack and responsibilities

- React and TypeScript: live application UI, capture controls, overlay, chord diagrams, and API contracts.
- Vite: frontend development and production build.
- Browser media APIs: webcam and microphone capture.
- MediaPipe: initial hand landmark detection in the browser.
- OpenCV: future frame processing, guitar-neck calibration, geometry, and offline vision experiments.
- Python and FastAPI: local inference service and stable model interfaces.
- PyTorch: custom audio, visual fret-state, or multimodal fusion models in later milestones.
- Web Audio API, NumPy, librosa, or torchaudio: audio feature extraction and baseline recognition.
- SQLite: local calibration, practice sessions, and prediction history.
- Jupyter: reproducible feature exploration and model experiments.
- Hugging Face: optional open-source model and dataset discovery, versioning, and sharing.

A technology must have a real responsibility in the codebase before it is listed as implemented. Planned integrations belong in documentation, not fake placeholder claims.

## MVP scope

The first vertical slice should provide:

1. A React page that requests camera and microphone access.
2. A mirrored webcam view with a stable overlay layer.
3. A hand-tracking adapter and visible landmark rendering when the model is available.
4. A small chord vocabulary: `C`, `G`, `Am`, and `F`.
5. Data-driven chord diagrams with muted, open, and fretted strings.
6. An audio recognition adapter with an explicit baseline and confidence.
7. Confidence-weighted fusion with an `Unknown` result for weak evidence.
8. A deterministic next-chord suggestion engine.
9. A local FastAPI health endpoint and typed client boundary.
10. Focused tests for chord metadata, diagrams, fusion, and suggestions.

## Heavier ML roadmap

After the MVP is stable:

- Record and label small synchronized audio/video samples locally.
- Calibrate the guitar neck, strings, and frets for each camera setup.
- Train a PyTorch audio chord classifier using spectrogram or chroma features.
- Train a visual fret-state model or use landmarks as structured features.
- Compare audio-only, vision-only, and late-fusion models.
- Track accuracy, confusion matrices, confidence calibration, and latency.
- Export a model to an appropriate local runtime only after measuring the baseline.
- Add tuning, capo, handedness, guitar variation, and personalization deliberately.

Do not claim general chord recognition until the dataset and evaluation support that claim.

## Architecture boundaries

Use replaceable interfaces:

- `HandTracker`: camera frame to landmarks and neck-position confidence.
- `AudioChordRecognizer`: audio window to chord probabilities and confidence.
- `ChordFusion`: visual and audio evidence to one prediction.
- `SuggestionEngine`: current chord and vocabulary to a constrained next chord.
- `ChordDiagram`: chord metadata to a renderable diagram.

The UI should consume prediction contracts, not model-specific details.

## Engineering conventions

- Keep modules small and focused.
- Prefer typed data structures and explicit error states.
- Keep model inference out of UI components.
- Use deterministic behavior in tests.
- Add comments only for non-obvious blocks, using short lowercase comments.
- Avoid unrelated refactors.
- Validate the narrowest relevant command after each meaningful change.
- Document setup commands and known hardware/browser limitations.

## Definition of done for the initial demo

A new contributor can install free dependencies, start the frontend and local backend, grant camera/microphone permissions, see the live overlay, select or receive one of the supported chords, view its fret diagram, and see a constrained next-chord suggestion. Tests pass, the privacy boundaries are documented, and no private media or secrets are tracked.
