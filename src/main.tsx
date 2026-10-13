import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/ibm-plex-sans-thai/400.css'
import '@fontsource/ibm-plex-sans-thai/500.css'
import '@fontsource/ibm-plex-sans-thai/600.css'
import '@fontsource/mitr/400.css'
import '@fontsource/mitr/500.css'
import './index.css'
import App from './App.tsx'
import { DreamPage } from './components/dream/DreamPage.tsx'

// /dream is Team Dream's public page; everything else is the portfolio app.
const dream = /^\/dream\/?$/.test(window.location.pathname)
if (dream) document.title = 'ทีม Dream · ส่องพอร์ต Dime'

createRoot(document.getElementById('root')!).render(<StrictMode>{dream ? <DreamPage /> : <App />}</StrictMode>)
