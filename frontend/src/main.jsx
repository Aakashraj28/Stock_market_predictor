import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Home from './pages/Home.jsx'
import Explore from './pages/Explore.jsx'
import Company from './pages/Company.jsx'
import Calendar from "./pages/Calendar"
import Financials from './pages/Financials.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/explore' element={<Explore />} />
        <Route path='/company/:ticker' element={<Company />} />
        <Route path="/" element={<Explore />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/company/:ticker/financials" element={<Financials />} />


      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
