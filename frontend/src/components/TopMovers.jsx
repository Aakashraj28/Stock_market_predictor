import { useEffect, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'

export default function TopMovers(){
  const [data,setData] = useState({gainers:[], losers:[]}); const [loading,setLoading] = useState(true)
  const nav = useNavigate()
  useEffect(()=>{(async()=>{try{const r=await axios.get('/api/top-movers'); setData(r.data);}finally{setLoading(false)}})()},[])
  if(loading) return <div className="text-sm text-slate-500">Loading top movers…</div>
  const Card=({title,items})=>(
    <div className="card p-4">
      <div className="font-semibold mb-2">{title}</div>
      <div className="space-y-2">
        {items.map(row=>(
          <button key={row.ticker} onClick={()=>nav(`/company/${row.ticker}`)}
            className="w-full flex items-center justify-between rounded-lg px-3 py-2 hover:bg-slate-50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center font-semibold">{row.ticker.slice(0,3)}</div>
              <div className="text-sm">{row.name}</div>
            </div>
            <div className={"text-sm font-medium "+(row.changePct>=0?"text-emerald-600":"text-rose-600")}>{row.changePct.toFixed(2)}%</div>
          </button>
        ))}
      </div>
    </div>
  )
  return (<div className="grid md:grid-cols-2 gap-4"><Card title="Top 5 Gainers" items={data.gainers}/><Card title="Top 5 Losers" items={data.losers}/></div>)
}
