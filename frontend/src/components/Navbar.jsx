import { Link } from 'react-router-dom'
export default function Navbar(){
  return (
    <div className="w-full sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="text-xl font-semibold tracking-tight">📈 StockSense</Link>
        <div className="flex items-center gap-4">
          <Link to="/explore" className="text-sm text-slate-700 hover:text-black">Explore</Link>
          <a href="https://github.com/" target="_blank" className="text-sm text-slate-700 hover:text-black">GitHub</a>
        </div>
      </div>
    </div>
  )
}
