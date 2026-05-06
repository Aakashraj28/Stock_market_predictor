import Plot from 'react-plotly.js'

/**
 * props:
 *  - title: string
 *  - data: array of { t: epochSec, ... }
 *  - series: [{ key:'value', name:'RSI' }, ...]  // which y keys to plot
 *  - zeroLine: boolean  // draw y=0 reference line (useful for MACD)
 */
export default function IndicatorChart({ title='Indicator', data=[], series=[{key:'value', name:'Value'}], zeroLine=false }){
  const x = data.map(d => new Date(d.t * 1000))

  const traces = series.map(s => ({
    type: 'scatter',
    mode: 'lines',
    name: s.name,
    x,
    y: data.map(d => d[s.key]),
    hovertemplate: '%{x|%b %d, %Y}<br>'+`${s.name}: %{y:.2f}`+'<extra></extra>'
  }))

  // Optional zero line
  if (zeroLine) {
    traces.push({
      type: 'scatter',
      mode: 'lines',
      name: 'Zero',
      x,
      y: x.map(() => 0),
      hoverinfo: 'skip',
      line: { dash: 'dot' }
    })
  }

  return (
    <div className="card p-4">
      <div className="font-semibold mb-2">{title}</div>
      <Plot
        data={traces}
        layout={{
          xaxis: {
            title: 'Date',
            showgrid: true,
            tickformat: '%b %d',
          },
          yaxis: {
            title: title,
            showgrid: true,
            separatethousands: true,
          },
          margin: { l: 45, r: 10, t: 10, b: 40 },
          autosize: true,
          hovermode: 'x unified',
          legend: { orientation: 'h', y: -0.2 },
        }}
        useResizeHandler
        style={{ width: '100%', height: '260px' }}
        config={{ responsive: true, displaylogo: false }}
      />
    </div>
  )
}
