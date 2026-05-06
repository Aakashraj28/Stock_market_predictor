import Navbar from '../components/Navbar'
import SearchBar from '../components/SearchBar'
import TopMovers from '../components/TopMovers'
import EventCalendar from '../components/EventCalendar'

export default function Explore(){
  return (
    <div>
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="card p-4">
          <div className="font-semibold mb-2">Search</div>
          <SearchBar />
        </div>
        <TopMovers />
        <EventCalendar />
      </div>
    </div>
  )
}
