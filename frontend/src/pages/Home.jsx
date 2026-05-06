import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { motion } from 'framer-motion'
import hero from '../assets/hero.png' // make sure this file exists

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-white">
      <Navbar />

      <section className="max-w-7xl mx-auto px-6 py-20 grid md:grid-cols-2 gap-12 items-center">
        
        {/* Left Side */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.8 }}
        >
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Start your stock market journey
          </h1>
          <p className="mt-6 text-lg text-slate-600 leading-relaxed">
            Explore live NSE data, visualize candlesticks & indicators,
            and forecast the next 7 closing prices using Hybrid CNN-LSTM Machine Learning model — all in one clean dashboard.
          </p>
          <div className="mt-8 flex gap-4">
            <Link to="/explore" 
              className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-lg transition">
              Get Started
            </Link>
            <a href="https://github.com/" target="_blank" rel="noreferrer"
              className="px-6 py-3 rounded-xl border border-slate-300 hover:border-slate-400 font-medium transition">
              View Source
            </a>
          </div>

          <ul className="mt-8 text-slate-700 space-y-2 text-sm">
            <li>📈 Search any listed company with smart suggestions</li>
            <li>🚀 Top 5 gainers & losers every market day</li>
            <li>🕹️ Interactive candlesticks, indicators, and price tables</li>
            <li>🤖 One-click 7-day ML price prediction</li>
          </ul>
        </motion.div>

        {/* Right Side */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }} 
          animate={{ opacity: 1, scale: 1 }} 
          transition={{ duration: 1, delay: 0.3 }}
          className="relative flex justify-center"
        >
          <motion.img 
            src={hero} 
            alt="dashboard preview" 
            className="rounded-2xl shadow-xl border border-slate-200 w-full max-w-md"
            animate={{ y: [0, -12, 0] }} 
            transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
          />
        </motion.div>
      </section>
    </div>
  )
}
