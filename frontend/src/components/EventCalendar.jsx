import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import dayjs from "dayjs"

export default function EventCalendar() {
  const [events, setEvents] = useState([])
  const [selectedDate, setSelectedDate] = useState(dayjs().format("YYYY-MM-DD"))

  useEffect(() => {
    fetch("http://127.0.0.1:5001/api/events/all")
      .then(res => res.json())
      .then(data => setEvents(data.events || []))
      .catch(err => console.error("Failed to fetch events", err))
  }, [])

  // Generate next 7 days
  const next7Days = Array.from({ length: 7 }, (_, i) =>
    dayjs().add(i, "day").format("YYYY-MM-DD")
  )

  // Filter events for selected date
  const eventsForSelectedDate = events.filter(ev => ev.date === selectedDate)

  return (
    <div className="card p-4">
      <div className="flex justify-between items-center mb-2">
        <h2 className="font-semibold">Event Calendar (7d)</h2>
        <Link to="/calendar" className="text-blue-500 text-sm">View Full Calendar</Link>
      </div>

      {/* Dates Row */}
      <div className="flex space-x-2 mb-4">
        {next7Days.map(date => {
          const isSelected = date === selectedDate
          return (
            <button
              key={date}
              onClick={() => setSelectedDate(date)}
              className={`px-3 py-1 rounded-lg text-sm ${
                isSelected ? "bg-blue-500 text-white" : "bg-gray-200 hover:bg-gray-300"
              }`}
            >
              {dayjs(date).format("DD MMM")}
            </button>
          )
        })}
      </div>

      {/* Events for selected date */}
      {eventsForSelectedDate.length === 0 ? (
        <div className="text-gray-500">No events on {dayjs(selectedDate).format("DD MMM YYYY")}</div>
      ) : (
        <ul className="space-y-2">
          {eventsForSelectedDate.map((ev, i) => (
            <li key={i} className="border-b pb-1">
              <div className="font-medium">{ev.symbol} — {ev.company}</div>
              <div className="text-sm text-gray-600">{ev.purpose}</div>
              <div className="text-xs text-gray-400">{ev.date}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
