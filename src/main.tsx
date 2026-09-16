import React from 'react'
import ReactDOM from 'react-dom/client'
import 'chart.js/auto'
import './index.css'
import App from './App'
import CommunicationsBridge from './CommunicationsBridge'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <CommunicationsBridge />
  </React.StrictMode>
)
