import { createRoot } from 'react-dom/client'
import App from './App'
import { APP_CONFIG } from './config/app'
import './styles.css'

document.title = `${APP_CONFIG.APP_NAME} — AI vs AI chess`

createRoot(document.getElementById('root')!).render(<App />)
