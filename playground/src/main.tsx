import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import { EditorLayout } from './components/EditorLayout'
import './style.css'

createRoot(document.getElementById('root')!).render(<><EditorLayout /><Toaster theme="dark" /></>)
