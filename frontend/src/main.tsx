// this file is the browser entry point for the fretfly frontend.
// it mounts the main practice surface into the html root element.
// it also loads the shared styles used by the camera and chord overlays.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
