// this file configures the frontend development and production toolchain.
// it connects vite to the react plugin and controls the browser build process.
// the rest of the frontend architecture is implemented under the src directory.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
