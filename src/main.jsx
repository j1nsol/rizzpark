import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import AdminApp from './pages/AdminApp'
import PinLocationPage from './pages/PinLocationPage'


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/admin" element={<AdminApp />} />
        <Route path="/:pinCode" element={<PinLocationPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
