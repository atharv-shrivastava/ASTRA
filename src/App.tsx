import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Bar, Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend } from 'chart.js'
import { Html5Qrcode } from 'html5-qrcode'
import { db, seedDemoInventory, upsertInventory, type InventoryItem, type ResourceType } from './db'
import { calculatePrediction } from './predictor'
import { buildSyncPacket, simulateSatelliteSync } from './sync'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend)

type Station = InventoryItem['station']
type Section = 'overview' | 'inventory' | 'predictor' | 'scanner' | 'sync' | 'goa'
type DemandPriority = 'Critical' | 'High' | 'Planned'

const stationOccupants: Record<Station, number> = { Maitri: 32, Bharati: 28, 'Traverse Camp 1': 12 }
const stationList: Station[] = ['Maitri', 'Bharati', 'Traverse Camp 1']
const resourceRates: Record<ResourceType, { label: string; unit: string; rate: number; threshold: number }> = {
  fuel: { label: 'Heating fuel', unit: 'L', rate: 12, threshold: 720 },
  ration: { label: 'Freeze-dried rations', unit: 'packs', rate: 1, threshold: 120 },
  oxygen: { label: 'Medical oxygen', unit: 'cyl', rate: 0.04, threshold: 6 },
  medical: { label: 'Medical supplies', unit: 'kits', rate: 0.02, threshold: 2 },
  equipment: { label: 'Equipment', unit: 'units', rate: 0.01, threshold: 1 }
}

interface Demand {
  id: string
  station: Station
  resource: string
  requested: number
  unit: string
  due: string
  priority: DemandPriority
  reason: string
  status: 'Pending' | 'Supply message sent' | 'Scheduled'
}

const initialDemands: Demand[] = [
  { id: 'DEM-104', station: 'Maitri', resource: 'Heating fuel', requested: 4200, unit: 'L', due: '18 Sep', priority: 'Critical', reason: 'Projected sub-21 day reserve', status: 'Pending' },
  { id: 'DEM-107', station: 'Bharati', resource: 'Freeze-dried rations', requested: 680, unit: 'packs', due: '24 Sep', priority: 'High', reason: '28 personnel · six-week replenishment', status: 'Pending' },
  { id: 'DEM-109', station: 'Maitri', resource: 'Medical oxygen', requested: 12, unit: 'cyl', due: '29 Sep', priority: 'High', reason: 'Reserve below operating threshold', status: 'Pending' },
  { id: 'DEM-112', station: 'Traverse Camp 1', resource: 'Medical supplies', requested: 8, unit: 'kits', due: '03 Oct', priority: 'Planned', reason: 'Routine resupply window', status: 'Scheduled' }
]

const supplyPlans = [
  { id: 'SUP-031', destination: 'Maitri', load: 'Jet-A1 fuel', quantity: '4,200 L', mode: 'Air / Hercules', eta: '18 Sep · 06:40', status: 'Ready' },
  { id: 'SUP-032', destination: 'Bharati', load: 'Ration packs', quantity: '680 packs', mode: 'Sea → airlift', eta: '24 Sep · 09:15', status: 'Planning' },
  { id: 'SUP-033', destination: 'Maitri', load: 'Medical oxygen', quantity: '12 cyl', mode: 'Air / priority', eta: '29 Sep · 07:10', status: 'Awaiting approval' }
]

function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{children}</section>
}

function StatusDot({ tone = 'green' }: { tone?: 'green' | 'amber' | 'red' | 'blue' }) {
  return <span className={`status-dot ${tone}`} aria-hidden="true" />
}

function Metric({ label, value, meta, accent = 'cyan' }: { label: string; value: string; meta?: string; accent?: string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className={`metric-value ${accent}`}>{value}</div>
      {meta && <div className="metric-meta">{meta}</div>}
    </div>
  )
}

function App() {
  const [section, setSection] = useState<Section>('overview')
  const [online, setOnline] = useState(navigator.onLine)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [queueCount, setQueueCount] = useState(0)
  const [selectedStation, setSelectedStation] = useState<Station>('Maitri')
  const [syncMessage, setSyncMessage] = useState('No synchronization attempted in this session.')
  const [demands, setDemands] = useState<Demand[]>(initialDemands)
  const [outbox, setOutbox] = useState<{ id: string; target: string; text: string; sentAt: string; channel: string }[]>([])

  async function refreshData() {
    const [items, queued] = await Promise.all([
      db.inventory.orderBy('updatedAt').reverse().toArray(),
      db.syncQueue.where('status').equals('queued').count()
    ])
    setInventory(items)
    setQueueCount(queued)
  }

  useEffect(() => {
    void seedDemoInventory().then(refreshData)
    const onlineHandler = () => setOnline(true)
    const offlineHandler = () => setOnline(false)
    window.addEventListener('online', onlineHandler)
    window.addEventListener('offline', offlineHandler)
    return () => {
      window.removeEventListener('online', onlineHandler)
      window.removeEventListener('offline', offlineHandler)
    }
  }, [])

  const stats = useMemo(() => {
    const totalFor = (resource: ResourceType) => inventory.filter((item) => item.resourceType === resource && item.station === selectedStation).reduce((sum, item) => sum + item.quantity, 0)
    return { fuel: totalFor('fuel'), ration: totalFor('ration'), oxygen: totalFor('oxygen'), medical: totalFor('medical') }
  }, [inventory, selectedStation])

  async function handleSync() {
    const packet = await buildSyncPacket()
    if (packet.queued.length === 0) {
      setSyncMessage('Queue is empty. No packet transmitted.')
      return
    }
    const result = await simulateSatelliteSync()
    setSyncMessage(`${result.synced} local mutations acknowledged · ${result.jsonBytes.toFixed(0)} B JSON → ${result.packedBytes} B MessagePack · ${result.savingsPercent.toFixed(1)}% smaller`)
    await refreshData()
  }

  async function addCargo(item: Omit<InventoryItem, 'updatedAt' | 'syncStatus'>) {
    await upsertInventory(item)
    await refreshData()
    setSection('inventory')
  }

  function sendDemandMessage(demand: Demand, text: string, channel: string) {
    const message = text.trim() || `Supply request ${demand.id}: ${demand.requested} ${demand.unit} of ${demand.resource} requested for ${demand.station}, due ${demand.due}. Priority: ${demand.priority}.`
    setDemands((current) => current.map((item) => item.id === demand.id ? { ...item, status: 'Supply message sent' } : item))
    setOutbox((current) => [{ id: crypto.randomUUID(), target: demand.station, text: message, sentAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), channel }, ...current])
  }

  function sendCustomMessage(target: string, text: string, channel: string) {
    if (!text.trim()) return
    setOutbox((current) => [{ id: crypto.randomUUID(), target, text: text.trim(), sentAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), channel }, ...current])
  }

  return (
    <div className="astra-shell">
      <header className="topbar">
        <div className="brand-block" onClick={() => setSection('overview')} role="button" tabIndex={0}>
          <div className="brand-mark">A</div>
          <div>
            <div className="brand-name">A.S.T.R.A.</div>
            <div className="brand-sub">ANTARCTIC SUPPLY TRACKING & RESOURCE ANALYTICS</div>
          </div>
        </div>
        <div className="topbar-right">
          <div className="mission-chip"><span>SIH26062</span><span className="muted">·</span><span>Mission Control</span></div>
          <button className={`connection-pill ${online ? 'connected' : 'offline'}`} onClick={() => setOnline((value) => !value)}>
            <StatusDot tone={online ? 'green' : 'amber'} /> {online ? 'ONLINE · VSAT LINK' : 'OFFLINE · LOCAL MODE'}
          </button>
        </div>
      </header>

      <div className="app-grid">
        <aside className="sidebar">
          <div className="sidebar-heading">CONTROL SURFACES</div>
          <nav>
            {([
              ['overview', 'Command overview', '01'],
              ['inventory', 'Field inventory', '02'],
              ['predictor', 'Edge forecast', '03'],
              ['scanner', 'QR cargo intake', '04'],
              ['sync', 'Satellite sync', '05'],
              ['goa', 'Goa HQ planner', '06']
            ] as [Section, string, string][]).map(([id, label, number]) => (
              <button key={id} className={`nav-item ${section === id ? 'active' : ''}`} onClick={() => setSection(id)}>
                <span className="nav-num">{number}</span><span>{label}</span><span className="nav-arrow">→</span>
              </button>
            ))}
          </nav>

          <div className="sidebar-footer">
            <div className="side-status"><StatusDot tone={online ? 'green' : 'amber'} /><span>{online ? 'Cloud link available' : 'Local-first operation'}</span></div>
            <div className="side-mini"><span>Pending sync</span><strong>{queueCount}</strong></div>
            <div className="side-mini"><span>Outbox</span><strong>{outbox.length}</strong></div>
          </div>
        </aside>

        <main className="workspace">
          {section === 'overview' && <Overview inventory={inventory} selectedStation={selectedStation} setSelectedStation={setSelectedStation} stats={stats} demands={demands} onOpenGoa={() => setSection('goa')} />}
          {section === 'inventory' && <Inventory inventory={inventory} onAdd={addCargo} />}
          {section === 'predictor' && <Predictor selectedStation={selectedStation} stats={stats} />}
          {section === 'scanner' && <Scanner onDecoded={addCargo} />}
          {section === 'sync' && <SyncPanel queueCount={queueCount} onSync={handleSync} message={syncMessage} online={online} />}
          {section === 'goa' && <GoaDashboard demands={demands} outbox={outbox} onSendDemandMessage={sendDemandMessage} onSendCustomMessage={sendCustomMessage} />}
        </main>
      </div>
    </div>
  )
}

function Overview({ inventory, selectedStation, setSelectedStation, stats, demands, onOpenGoa }: { inventory: InventoryItem[]; selectedStation: Station; setSelectedStation: (station: Station) => void; stats: { fuel: number; ration: number; oxygen: number; medical: number }; demands: Demand[]; onOpenGoa: () => void }) {
  const stationReadiness = stationList.map((station) => {
    const fuel = inventory.filter((item) => item.station === station && item.resourceType === 'fuel').reduce((sum, item) => sum + item.quantity, 0)
    const days = fuel / (resourceRates.fuel.rate * stationOccupants[station])
    return { station, fuel, days }
  })
  const critical = demands.filter((item) => item.priority === 'Critical').length

  return (
    <div className="page-stack">
      <div className="hero-row">
        <div>
          <div className="eyebrow">FIELD STATUS / 16 SEP 2026</div>
          <h1>Antarctic operations, at a glance.</h1>
          <p>Local inventory, depletion forecasting, cargo intake and central resupply planning in one operational surface.</p>
        </div>
        <div className="station-picker">
          <span className="picker-label">FIELD STATION</span>
          <select value={selectedStation} onChange={(e) => setSelectedStation(e.target.value as Station)}>{stationList.map((station) => <option key={station}>{station}</option>)}</select>
        </div>
      </div>

      <div className="metric-grid">
        <Metric label="Heating fuel" value={`${stats.fuel.toLocaleString()} L`} meta="current station" />
        <Metric label="Rations" value={`${stats.ration.toLocaleString()} packs`} meta="current station" accent="green" />
        <Metric label="Medical oxygen" value={`${stats.oxygen.toLocaleString()} cyl`} meta="current station" accent="amber" />
        <Metric label="Open demand alerts" value={String(demands.filter((d) => d.status === 'Pending').length)} meta={`${critical} critical`} accent="red" />
      </div>

      <div className="two-col">
        <Panel>
          <div className="panel-head"><div><div className="eyebrow">STATION READINESS</div><h2>Reserve runway</h2></div><span className="live-badge"><StatusDot tone="blue" /> LIVE MODEL</span></div>
          <div className="station-list">
            {stationReadiness.map(({ station, fuel, days }) => (
              <div className="station-row" key={station}>
                <div className="station-id"><span className="station-icon">{station === 'Maitri' ? 'M' : station === 'Bharati' ? 'B' : 'T'}</span><div><strong>{station}</strong><small>{stationOccupants[station]} personnel</small></div></div>
                <div className="runway"><div className="runway-bar"><span style={{ width: `${Math.min(100, Math.max(6, days / 1.8))}%` }} /></div><span>{days.toFixed(0)} days</span></div>
                <span className={`health-pill ${days < 30 ? 'danger' : days < 60 ? 'warn' : 'good'}`}>{days < 30 ? 'CRITICAL' : days < 60 ? 'WATCH' : 'STABLE'}</span>
                <span className="row-meta">{fuel.toLocaleString()} L</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="demand-preview">
          <div className="panel-head"><div><div className="eyebrow">GOA → FIELD</div><h2>Next supply demands</h2></div><button className="text-button" onClick={onOpenGoa}>Open planner →</button></div>
          {demands.slice(0, 3).map((demand) => (
            <div className="demand-row" key={demand.id}>
              <div><strong>{demand.resource}</strong><small>{demand.station} · due {demand.due}</small></div>
              <div className="demand-qty">{demand.requested.toLocaleString()} <span>{demand.unit}</span></div>
              <span className={`priority ${demand.priority.toLowerCase()}`}>{demand.priority}</span>
            </div>
          ))}
        </Panel>
      </div>

      <div className="three-col">
        <Panel className="compact-panel"><div className="eyebrow">OFFLINE-FIRST</div><h3>Local writes survive the link.</h3><p>Inventory changes live in IndexedDB first. Connectivity only changes when those mutations are synchronized.</p></Panel>
        <Panel className="compact-panel"><div className="eyebrow">PREDICTIVE LAYER</div><h3>Depletion before shortage.</h3><p>The edge model accounts for occupancy, temperature and blizzard mode to estimate reserve runway.</p></Panel>
        <Panel className="compact-panel"><div className="eyebrow">COMMAND FLOW</div><h3>Need → plan → message → sync.</h3><p>Goa HQ can turn a field demand into a supply plan and send an explicit message to the receiving station.</p></Panel>
      </div>
    </div>
  )
}

function Inventory({ inventory, onAdd }: { inventory: InventoryItem[]; onAdd: (item: Omit<InventoryItem, 'updatedAt' | 'syncStatus'>) => Promise<void> }) {
  const [name, setName] = useState('')
  const [station, setStation] = useState<Station>('Maitri')
  const [resourceType, setResourceType] = useState<ResourceType>('fuel')
  const [quantity, setQuantity] = useState(100)

  const totals = useMemo(() => Object.entries(resourceRates).map(([key, rate]) => ({ key: key as ResourceType, label: rate.label, quantity: inventory.filter((item) => item.resourceType === key).reduce((sum, item) => sum + item.quantity, 0), unit: rate.unit })), [inventory])

  return <div className="page-stack">
    <div className="hero-row"><div><div className="eyebrow">FIELD LEDGER</div><h1>Inventory that works offline.</h1><p>Every change is written locally and queued for synchronization.</p></div></div>
    <div className="resource-strip">{totals.map((item) => <div key={item.key} className="resource-tile"><span>{item.label}</span><strong>{item.quantity.toLocaleString()}</strong><small>{item.unit} · all stations</small></div>)}</div>
    <Panel>
      <div className="panel-head"><div><div className="eyebrow">NEW LOCAL WRITE</div><h2>Register cargo</h2></div><span className="muted-tag">INDEXEDDB</span></div>
      <div className="form-grid">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cargo name" />
        <select value={station} onChange={(e) => setStation(e.target.value as Station)}><option>Maitri</option><option>Bharati</option><option>Traverse Camp 1</option></select>
        <select value={resourceType} onChange={(e) => setResourceType(e.target.value as ResourceType)}>{Object.entries(resourceRates).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select>
        <input type="number" min="0" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
        <button className="primary-button" disabled={!name.trim()} onClick={() => void onAdd({ id: `${resourceType.toUpperCase()}-${crypto.randomUUID().slice(0, 8)}`, station, resourceType, name: name.trim(), quantity, unit: resourceRates[resourceType].unit })}>Add to field ledger</button>
      </div>
    </Panel>
    <Panel>
      <div className="panel-head"><div><div className="eyebrow">LIVE LEDGER</div><h2>Stock records</h2></div><span className="muted-tag">{inventory.length} records</span></div>
      <div className="table-wrap"><table><thead><tr><th>Cargo</th><th>Station</th><th>Class</th><th>Quantity</th><th>Sync state</th></tr></thead><tbody>{inventory.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.id}</small></td><td>{item.station}</td><td>{resourceRates[item.resourceType].label}</td><td>{item.quantity.toLocaleString()} {item.unit}</td><td><span className={`sync-state ${item.syncStatus}`}>{item.syncStatus}</span></td></tr>)}</tbody></table></div>
    </Panel>
  </div>
}

function Predictor({ selectedStation, stats }: { selectedStation: Station; stats: { fuel: number; ration: number; oxygen: number; medical: number } }) {
  const [occupants, setOccupants] = useState(stationOccupants[selectedStation])
  const [temperature, setTemperature] = useState(-32)
  const [blizzard, setBlizzard] = useState(false)
  const prediction = calculatePrediction({ occupants, temperatureC: temperature, currentStock: stats.fuel, baseRatePerPerson: resourceRates.fuel.rate, blizzard, criticalThreshold: resourceRates.fuel.threshold })

  return <div className="page-stack">
    <div className="hero-row"><div><div className="eyebrow">EDGE PREDICTOR</div><h1>See the shortage before the shortage.</h1><p>Deterministic, explainable depletion forecasting that runs without a network connection.</p></div><span className={`model-badge ${prediction.status.toLowerCase()}`}>{prediction.status}</span></div>
    <div className="two-col predictor-grid">
      <Panel><div className="eyebrow">SCENARIO</div><h2>Field conditions</h2><div className="slider-group"><label>Occupants <strong>{occupants}</strong></label><input type="range" min="1" max="70" value={occupants} onChange={(e) => setOccupants(Number(e.target.value))} /></div><div className="slider-group"><label>Temperature <strong>{temperature}°C</strong></label><input type="range" min="-55" max="5" value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} /></div><button className={`blizzard-toggle ${blizzard ? 'on' : ''}`} onClick={() => setBlizzard((value) => !value)}><span>{blizzard ? '●' : '○'}</span> Blizzard mode {blizzard ? 'active' : 'inactive'}</button></Panel>
      <Panel><div className="eyebrow">OUTPUT</div><h2>{prediction.daysRemaining.toFixed(0)} days of runway</h2><div className="prediction-facts"><div><span>Base burn</span><strong>{prediction.baseDailyBurn.toFixed(1)} L/day</strong></div><div><span>Cold factor</span><strong>{prediction.temperatureFactor.toFixed(2)}×</strong></div><div><span>Weather factor</span><strong>{prediction.blizzardFactor.toFixed(2)}×</strong></div><div><span>Effective burn</span><strong>{prediction.effectiveDailyBurn.toFixed(1)} L/day</strong></div></div></Panel>
    </div>
    <Panel><div className="panel-head"><div><div className="eyebrow">RUNWAY TRAJECTORY</div><h2>{selectedStation} · heating fuel</h2></div><span className="muted-tag">180-day horizon</span></div><div className="chart-box"><Line data={{ labels: prediction.trajectory.map((point) => `D${point.day}`), datasets: [{ label: 'Projected stock', data: prediction.trajectory.map((point) => point.stock), borderColor: '#7dd3fc', backgroundColor: 'rgba(125,211,252,.08)', borderWidth: 2, pointRadius: 0, tension: .28 }, { label: 'Critical threshold', data: prediction.criticalLine.map((point) => point.stock), borderColor: '#fb7185', borderWidth: 1, borderDash: [5, 5], pointRadius: 0 }] }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#94a3b8' } } }, scales: { x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(148,163,184,.08)' } }, y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(148,163,184,.08)' } } } }} /></div></Panel>
  </div>
}

function Scanner({ onDecoded }: { onDecoded: (item: Omit<InventoryItem, 'updatedAt' | 'syncStatus'>) => Promise<void> }) {
  const [message, setMessage] = useState('Camera ready when you are.')
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const startedRef = useRef(false)

  async function start() {
    if (startedRef.current) return
    const scanner = new Html5Qrcode('qr-reader')
    scannerRef.current = scanner
    try {
      await scanner.start({ facingMode: 'environment' }, { fps: 8, qrbox: { width: 260, height: 160 } }, async (decodedText) => {
        setMessage(`Decoded: ${decodedText}`)
        await scanner.stop()
        startedRef.current = false
        const parsed = (() => { try { return JSON.parse(decodedText) as Partial<InventoryItem> } catch { return {} } })()
        await onDecoded({ id: parsed.id || `QR-${crypto.randomUUID().slice(0, 8)}`, station: parsed.station || 'Maitri', resourceType: parsed.resourceType || 'equipment', name: parsed.name || 'Scanned cargo', quantity: Number(parsed.quantity || 1), unit: parsed.unit || 'units' })
      }, () => undefined)
      startedRef.current = true
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Camera could not be started.')
    }
  }

  async function stop() {
    if (!scannerRef.current || !startedRef.current) return
    await scannerRef.current.stop()
    startedRef.current = false
    setMessage('Scanner stopped.')
  }

  useEffect(() => () => { if (scannerRef.current && startedRef.current) void scannerRef.current.stop() }, [])

  return <div className="page-stack"><div className="hero-row"><div><div className="eyebrow">CARGO INTAKE</div><h1>Scan once, log locally.</h1><p>QR intake creates an inventory mutation immediately, even when the station has no connection.</p></div><span className="muted-tag">HTML5 QR</span></div><div className="two-col scanner-layout"><Panel className="scanner-panel"><div id="qr-reader" className="qr-reader" /><div className="scanner-controls"><button className="primary-button" onClick={() => void start()}>Start camera</button><button className="secondary-button" onClick={() => void stop()}>Stop</button></div><div className="scanner-message">{message}</div></Panel><Panel><div className="eyebrow">PAYLOAD FORMAT</div><h2>Keep the field packet simple.</h2><pre className="code-card">{`{\n  "id": "FUEL-092",\n  "station": "Maitri",\n  "resourceType": "fuel",\n  "name": "Jet-A1 Fuel Drum",\n  "quantity": 1200,\n  "unit": "L"\n}`}</pre><p className="panel-note">The scan writes locally first. A later satellite sync can transmit the mutation as a compact MessagePack packet.</p></Panel></div></div>
}

function SyncPanel({ queueCount, onSync, message, online }: { queueCount: number; onSync: () => Promise<void>; message: string; online: boolean }) {
  const [lastRun, setLastRun] = useState('Not run')
  return <div className="page-stack"><div className="hero-row"><div><div className="eyebrow">SATELLITE SYNCHRONIZATION</div><h1>Send only what changed.</h1><p>ASTRA keeps field mutations local and batches them into compact packets for intermittent connectivity.</p></div><span className={`model-badge ${online ? 'normal' : 'warning'}`}>{online ? 'LINK AVAILABLE' : 'LOCAL ONLY'}</span></div><div className="metric-grid"><Metric label="Queued mutations" value={String(queueCount)} meta="local database" /><Metric label="Packet format" value="MessagePack" meta="compact binary" accent="green" /><Metric label="Transport" value="Future API" meta="government-controlled endpoint" accent="amber" /><Metric label="Last run" value={lastRun} meta="this session" accent="purple" /></div><Panel><div className="panel-head"><div><div className="eyebrow">SYNC CONTROL</div><h2>Satellite uplink simulator</h2></div><button className="primary-button" disabled={!queueCount} onClick={() => void onSync().then(() => setLastRun(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })))}>Transmit queued changes</button></div><div className="sync-timeline"><div className="timeline-step done"><span>01</span><div><strong>Local write</strong><small>IndexedDB mutation created</small></div></div><div className="timeline-line" /><div className="timeline-step"><span>02</span><div><strong>Pack</strong><small>MessagePack compression</small></div></div><div className="timeline-line" /><div className="timeline-step"><span>03</span><div><strong>Transmit</strong><small>Approved sync endpoint</small></div></div><div className="timeline-line" /><div className="timeline-step"><span>04</span><div><strong>Acknowledge</strong><small>Mark records as synced</small></div></div></div><div className="sync-result">{message}</div></Panel></div>
}

function GoaDashboard({ demands, outbox, onSendDemandMessage, onSendCustomMessage }: { demands: Demand[]; outbox: { id: string; target: string; text: string; sentAt: string; channel: string }[]; onSendDemandMessage: (demand: Demand, text: string, channel: string) => void; onSendCustomMessage: (target: string, text: string, channel: string) => void }) {
  const [selectedDemand, setSelectedDemand] = useState<Demand | null>(demands[0])
  const [message, setMessage] = useState('')
  const [channel, setChannel] = useState('Supply dispatch')
  const [customTarget, setCustomTarget] = useState<Station>('Maitri')
  const [customMessage, setCustomMessage] = useState('')
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d')

  useEffect(() => {
    if (selectedDemand) setSelectedDemand(demands.find((item) => item.id === selectedDemand.id) || selectedDemand)
  }, [demands])

  const totals = useMemo(() => ({ critical: demands.filter((d) => d.priority === 'Critical' && d.status !== 'Supply message sent').length, requestedFuel: demands.filter((d) => d.resource === 'Heating fuel').reduce((sum, d) => sum + d.requested, 0), open: demands.filter((d) => d.status === 'Pending').length }), [demands])

  const sendSelected = () => { if (!selectedDemand) return; onSendDemandMessage(selectedDemand, message, channel); setMessage('') }
  const sendCustom = () => { onSendCustomMessage(customTarget, customMessage, 'Command message'); setCustomMessage('') }

  return <div className="page-stack">
    <div className="hero-row"><div><div className="eyebrow">NCPOR GOA / CENTRAL PLANNING</div><h1>Turn field demand into a supply action.</h1><p>See what the stations will need next, build a dispatch plan, and send an explicit supply message from the same screen.</p></div><div className="range-switch">{(['7d', '30d', '90d'] as const).map((value) => <button key={value} className={range === value ? 'active' : ''} onClick={() => setRange(value)}>{value}</button>)}</div></div>

    <div className="metric-grid"><Metric label="Open demands" value={String(totals.open)} meta="awaiting action" accent="cyan" /><Metric label="Critical" value={String(totals.critical)} meta="needs attention" accent="red" /><Metric label="Fuel requested" value={`${totals.requestedFuel.toLocaleString()} L`} meta="current demand set" accent="amber" /><Metric label="Messages sent" value={String(outbox.length)} meta="this session" accent="green" /></div>

    <div className="goa-grid">
      <Panel className="demands-panel"><div className="panel-head"><div><div className="eyebrow">FIELD DEMAND FORECAST</div><h2>Next requirements</h2></div><span className="muted-tag">{range} horizon</span></div><div className="demand-table">{demands.map((demand) => <button key={demand.id} className={`demand-card ${selectedDemand?.id === demand.id ? 'selected' : ''}`} onClick={() => setSelectedDemand(demand)}><div className="demand-card-top"><span className="demand-id">{demand.id}</span><span className={`priority ${demand.priority.toLowerCase()}`}>{demand.priority}</span></div><div className="demand-card-main"><div><strong>{demand.resource}</strong><small>{demand.station} · due {demand.due}</small></div><div className="big-number">{demand.requested.toLocaleString()}<span>{demand.unit}</span></div></div><div className="demand-reason">{demand.reason}</div><div className={`demand-status ${demand.status === 'Pending' ? 'pending' : 'sent'}`}>{demand.status}</div></button>)}</div></Panel>

      <Panel className="supply-plan-panel"><div className="panel-head"><div><div className="eyebrow">SUPPLY PLAN</div><h2>What goes north</h2></div><span className="muted-tag">draft</span></div><div className="plan-list">{supplyPlans.map((plan) => <div className="plan-row" key={plan.id}><div className="plan-top"><strong>{plan.destination}</strong><span>{plan.id}</span></div><div className="plan-load">{plan.quantity} <span>{plan.load}</span></div><div className="plan-meta"><span>{plan.mode}</span><span>{plan.eta}</span></div><div className={`plan-status ${plan.status.toLowerCase().replaceAll(' ', '-')}`}>{plan.status}</div></div>)}</div></Panel>
    </div>

    <div className="goa-grid second">
      <Panel><div className="panel-head"><div><div className="eyebrow">MESSAGE DISPATCH</div><h2>Send supply request</h2></div><span className="muted-tag">linked to demand</span></div>{selectedDemand ? <><div className="selected-demand"><div><span className="demand-id">{selectedDemand.id}</span><h3>{selectedDemand.requested.toLocaleString()} {selectedDemand.unit} · {selectedDemand.resource}</h3><p>{selectedDemand.station} · due {selectedDemand.due} · {selectedDemand.priority} priority</p></div><span className={`health-pill ${selectedDemand.status === 'Pending' ? 'warn' : 'good'}`}>{selectedDemand.status}</span></div><div className="form-grid message-form"><select value={channel} onChange={(e) => setChannel(e.target.value)}><option>Supply dispatch</option><option>Logistics coordination</option><option>Priority resupply</option></select><textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={`Custom message to ${selectedDemand.station}...`} /><button className="primary-button" onClick={sendSelected}>{selectedDemand.status === 'Pending' ? 'Send supply message' : 'Send updated message'}</button></div></> : <div className="empty-state">Select a demand to prepare its message.</div>}</Panel>

      <Panel><div className="panel-head"><div><div className="eyebrow">DIRECT COMMAND</div><h2>Custom message</h2></div><span className="muted-tag">freeform</span></div><div className="custom-message"><select value={customTarget} onChange={(e) => setCustomTarget(e.target.value as Station)}>{stationList.map((station) => <option key={station}>{station}</option>)}</select><textarea value={customMessage} onChange={(e) => setCustomMessage(e.target.value)} placeholder="Write an operational message, weather notice, cargo instruction, or coordination note..." /><button className="secondary-button" onClick={sendCustom} disabled={!customMessage.trim()}>Send command message</button></div></Panel>
    </div>

    <Panel><div className="panel-head"><div><div className="eyebrow">OUTBOX</div><h2>Messages sent this session</h2></div><span className="muted-tag">local activity log</span></div>{outbox.length === 0 ? <div className="empty-state">No outbound messages yet.</div> : <div className="outbox-list">{outbox.slice(0, 6).map((item) => <div className="outbox-row" key={item.id}><span className="outbox-icon">↗</span><div><strong>{item.target}</strong><small>{item.channel} · {item.sentAt}</small></div><p>{item.text}</p></div>)}</div>}</Panel>
  </div>
}

export default App
