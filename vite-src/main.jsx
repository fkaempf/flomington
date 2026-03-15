import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(<App />)

// Service worker cleanup (migrated from src/index.html)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(regs) {
    regs.forEach(function(r) { r.unregister(); });
  });
  caches.keys().then(function(keys) {
    keys.forEach(function(k) { caches.delete(k); });
  });
}
