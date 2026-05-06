import { useEffect, useState } from "react"
import Calendar from "react-calendar"
import 'react-calendar/dist/Calendar.css'

export default function CalendarPage() {
  const [events, setEvents] = useState([])
  const [dateEvents, setDateEvents] = useState({})
  const [value, setValue] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)

  // helper to get local YYYY-MM-DD
  const formatLocalDate = (date) => {
    return date.toLocaleDateString("en-CA"); // YYYY-MM-DD
  }

  useEffect(() => {
    fetch("https://stock-market-predictor-backend-a8v3.onrender.com/api/events/all")
      .then(res => res.json())
      .then(data => {
        const evs = data.events || []
        setEvents(evs)

        // Group by date
        const grouped = {}
        evs.forEach(ev => {
          if (!ev.date) return
          if (!grouped[ev.date]) grouped[ev.date] = []
          grouped[ev.date].push(ev)
        })
        setDateEvents(grouped)
      })
      .catch(err => console.error("Failed to fetch full events", err))
  }, [])

  const tileContent = ({ date }) => {
    const d = formatLocalDate(date)
    if (dateEvents[d]) {
      return (
        <div className="relative">
          <div className="w-2 h-2 bg-blue-500 rounded-full mx-auto mt-1"></div>
        </div>
      )
    }
    return null
  }

  const handleDateClick = (date) => {
    const d = formatLocalDate(date)
    setSelectedDate({ date: d, events: dateEvents[d] || [] })
  }

  return (
    <div className="max-w-5xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">📅 Event Calendar</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Calendar */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <Calendar
            onChange={(val) => {
              setValue(val)
              handleDateClick(val)
            }}
            value={value}
            tileContent={tileContent}
          />
        </div>

        {/* Event List for Selected Day */}
        <div className="bg-white rounded-xl shadow-md p-6">
          {selectedDate && selectedDate.events.length > 0 ? (
            <>
              <h2 className="text-xl font-semibold mb-4">
                Events on {selectedDate.date}
              </h2>
              <ul className="space-y-3">
                {selectedDate.events.map((ev, i) => (
                  <li
                    key={i}
                    className="p-4 border rounded-lg hover:shadow-md transition bg-gray-50"
                  >
                    <div className="font-semibold text-blue-600">{ev.symbol}</div>
                    <div className="text-gray-700">{ev.purpose}</div>
                    <div className="text-sm text-gray-500">{ev.company}</div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="text-gray-500 italic">
              {selectedDate ? "No events for this day." : "Select a date to view events."}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
