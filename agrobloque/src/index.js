import React from 'react'
import ReactDOM from 'react-dom/client'
import '@tabler/icons-webfont/dist/tabler-icons.min.css'
import './index.css'
import './design.css'
import './design-reference.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'

const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(<React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>)
