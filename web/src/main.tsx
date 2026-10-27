import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'c2pa-react-component/style.css'
import 'c2pa-react-cawg-component/style.css'
import './styles.css'
import App from './App'
import { installTrustRegistry } from './c2pa/trustRegistry'

installTrustRegistry()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
