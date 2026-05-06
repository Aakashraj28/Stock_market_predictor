import { useEffect, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'

export default function SearchBar({ placeholder='Search NSE/BSE by name or symbol…' }){
  const [q, setQ] = useState(''); const [suggestions, setSuggestions] = useState([])
  const navigate = useNavigate()
  useEffect(() => {
    const t = setTimeout(async () => {
      if(q.length < 1){ setSuggestions([]); return; }
      const res = await axios.get(`https://stock-market-predictor-backend-a8v3.onrender.com/api/search`, { params: { q } })
      setSuggestions(res.data.items || [])
    }, 200)
    return () => clearTimeout(t)
  }, [q])
  return (
    <div className="relative w-full">
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder={placeholder}
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-slate-300"/>
      {suggestions.length>0 && (
        <div className="absolute left-0 right-0 mt-2 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {suggestions.map((s) => (
            <button key={s.ticker} onClick={()=>navigate(`/company/${s.ticker}`)}
              className="w-full text-left px-4 py-2 hover:bg-slate-50">
              <span className="font-medium">{s.name}</span>
              <span className="text-xs text-slate-500"> · {s.ticker} · {s.exchange}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
