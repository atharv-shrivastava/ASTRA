import { useEffect, useMemo, useState } from 'react'
import { Bar, Line } from 'react-chartjs-2'
import { Html5Qrcode } from 'html5-qrcode'
import { db, seedDemoInventory, upsertInventory, type InventoryItem, type ResourceType } from './db'
import { calculatePrediction } from './predictor'
import { buildSyncPacket, simulateSatelliteSync } from './sync'

type Station = InventoryItem['station']
type Section = 'overview' | 'inventory' | 'predictor' | 'scanner' | 'sync' | 'voyage'

const stationOccupants: Record<Station, number> = {
  Maitri: 32,
  Bharati: 28,
  'Traverse Camp 1': 12
}

const resourceRates: Record<ResourceType, { label: string; unit: string; rate: number; threshold: number }> = {
  fuel: { label: 'Heating fuel', unit: 'L', rate: 12, threshold: 720 },
  ration: { label: 'Freeze-dried rations', unit: 'packs', rate: 1, threshold: 120 },
  oxygen: { label: 'Medical oxygen', unit: 'cyl', rate: 0.04, threshold: 6 },
  medical: { label: 'Medical supplies', unit: 'kits', rate: 0.02, threshold: 2 },
  equipment: { label: 'Equipment', unit: 'units', rate: 0.01, threshold: 1 }
}

const stationList: Station[] = ['Maitri', 'Bharati', 'Traverse Camp 1']

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-700/80 bg-slate-800/75 p-5 shadow-polar ${className}`}>{children}</section>
}

function Stat({ label, value, tone = 'text-cyan-300' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  )
}

function App() {
  const [section, setSection] = useState<Section>('overview')
  const [online, setOnline] = useState(navigator.onLine)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [queueCount, setQueueCount] = useState(0)
  const [selectedStation, setSelectedStation] = useState<Station>('Maitri')
  const [syncMessage, setSyncMessage] = useState('No satellite sync attempted yet.')

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
    const fuel = inventory.filter((item) => item.resourceType === 'fuel' && item.station === selectedStation).reduce((sum, item) => sum + item.quantity, 0)
    const ration = inventory.filter((item) => item.resourceType === 'ration' && item.station === selectedStation).reduce((sum, item) => sum + item.quantity, 0)
    const oxygen = inventory.filter((item) => item.resourceType === 'oxygen' && item.station === selectedStation).reduce((sum, item) => sum + item.quantity, 0)
    return { fuel, ration, oxygen }
  }, [inventory, selectedStation])

  async function handleSync() {
    const packet = await buildSyncPacket()
    if (packet.queued.length === 0) {
      setSyncMessage('Queue is empty. No packet transmitted.')
      return
    }
    const result = await simulateSatelliteSync()
    setSyncMessage(`Simulated satellite acknowledgement: ${result.synced} mutations cleared. ${result.jsonBytes.toFixed(0)} B JSON → ${result.packedBytes} B MessagePack (${result.savingsPercent.toFixed(1)}% smaller).`)
    await refreshData()
  }

  async function addCargo(item: Omit<InventoryItem, 'updatedAt' | 'syncStatus'>) {
    await upsertInventory(item)
    await refreshData()
    setSection('inventory')
  }

  return (
    <div className="min-h-screen text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-800/90 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 lg:px-6">
          <button onClick={() => setSection('overview')} className="text-left">
            <div className="text-sm font-semibold tracking-[0.28em] text-cyan-300">A.S.T.R.A.</div>
            <div className="text-xs text-slate-400">ANTARCTIC SUPPLY TRACKING & RESOURCE ANALYTICS</div>
          </button>
          <button onClick={() => setOnline((value) => !value)} className={`rounded-xl border px-4 py-2 text-xs font-bold tracking-wide ${online ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300' : 'border-amber-400/40 bg-amber-400/10 text-amber-300'}`}>
            {online ? '● ONLINE (VSAT)' : '● OFFLINE (BLIZZARD)'}
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[220px_1fr] lg:px-6">
        <aside className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3 lg:h-[calc(100vh-7rem)] lg:sticky lg:top-24">
          <p className="px-3 pb-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">Field console</p>
          <nav className="grid gap-1">
            {([
              ['overview', 'Mission Overview'],
              ['inventory', 'Inventory Ledger'],
              ['predictor', 'Edge Predictor'],
              ['scanner', 'QR Cargo Scanner'],
              ['sync', 'Satellite Sync'],
              ['voyage', 'Goa Voyage Planner']
            ] as [Section, string][]).map(([id, label]) => (
              <button key={id} onClick={() => setSection(id)} className={`rounded-xl px-3 py-3 text-left text-sm ${section === id ? 'bg-cyan-500/15 font-semibold text-cyan-200' : 'text-slate-300 hover:bg-slate-800'}`}>
                {label}
              </button>
            ))}
          </nav>
          <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-400">
            <div className="flex items-center justify-between"><span>Queued mutations</span><span className="font-bold text-cyan-300">{queueCount}</span></div>
            <div className="mt-2">Local database: <span className="text-slate-200">AstraLogDB</span></div>
          </div>
        </aside>

        <main className="min-w-0 space-y-5">
          {section === 'overview' && <Overview inventory={inventory} selectedStation={selectedStation} setSelectedStation={setSelectedStation} stats={stats} />}
          {section === 'inventory' && <Inventory inventory={inventory} onAdd={addCargo} />}
          {section === 'predictor' && <Predictor selectedStation={selectedStation} stats={stats} />}
          {section === 'scanner' && <Scanner onDecoded={addCargo} />}
          {section === 'sync' && <SyncPanel queueCount={queueCount} onSync={handleSync} message={syncMessage} />}
          {section === 'voyage' && <VoyagePlanner inventory={inventory} />}
        </main>
      </div>
    </div>
  )
}

function Overview({ inventory, selectedStation, setSelectedStation, stats }: { inventory: InventoryItem[]; selectedStation: Station; setSelectedStation: (station: Station) => void; stats: { fuel: number; ration: number; oxygen: number } }) {
  const alerts = stationList.map((station) => {
    const stationFuel = inventory.filter((item) => item.station === station && item.resourceType === 'fuel').reduce((sum, item) => sum + item.quantity, 0)
    const projected = resourceRates.fuel.rate * stationOccupants[station] * 180
    return { station, days: stationFuel / (resourceRates.fuel.rate * stationOccupants[station]), shortage: Math.max(0, projected - stationFuel) }
  })

  return (
    <>
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">SIH26062 · field operations</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">Antarctic resource command</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">A local-first ledger for station inventory, deterministic depletion forecasts and satellite-efficient synchronization.</p>
        </div>
        <select value={selectedStation} onChange={(e) => setSelectedStation(e.target.value as Station)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200">
          {stationList.map((station) => <option key={station}>{station}</option>)}
        </select>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="Heating fuel" value={`${stats.fuel.toLocaleString()} L`} />
        <Stat label="Ration stock" value={`${stats.ration.toLocaleString()} packs`} tone="text-emerald-300" />
        <Stat label="Medical oxygen" value={`${stats.oxygen.toLocaleString()} cyl`} tone="text-amber-300" />
      </div>

      <Card>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-bold">Station readiness</h2>
            <p className="text-xs text-slate-400">180-day reference horizon. Prototype assumptions only.</p>
          </div>
          <span className="rounded-full bg-slate-700/60 px-3 py-1 text-xs text-slate-300">HQ ↔ Maitri ↔ Bharati</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {alerts.map((alert) => (
            <div key={alert.station} className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
              <div className="flex items-center justify-between"><span className="font-semibold">{alert.station}</span><span className="text-xs text-slate-500">{stationOccupants[alert.station]} staff</span></div>
              <div className="mt-4 text-2xl font-black text-cyan-300">{alert.days.toFixed(0)} d</div>
              <div className={`mt-1 text-xs ${alert.days < 45 ? 'text-amber-300' : 'text-emerald-300'}`}>{alert.shortage > 0 ? `${alert.shortage.toLocaleString()} L voyage gap` : '180-day fuel covered'}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-bold">Operational principle</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">ASTRA keeps field writes local first. Connectivity affects synchronization, not the ability to record cargo, adjust stock, or run the depletion model. That is rather less glamorous than an AI swarm, but substantially more useful during a blizzard.</p>
      </Card>
    </>
  )
}

function Inventory({ inventory, onAdd }: { inventory: InventoryItem[]; onAdd: (item: Omit<InventoryItem, 'updatedAt' | 'syncStatus'>) => Promise<void> }) {
  const [name, setName] = useState('')
  const [station, setStation] = useState<Station>('Maitri')
  const [resourceType, setResourceType] = useState<ResourceType>('fuel')
  const [quantity, setQuantity] = useState(100)
  const [unit, setUnit] = useState('L')

  return (
    <>
      <Card>
        <h2 className="text-lg font-bold">Local inventory ledger</h2>
        <p className="mt-1 text-sm text-slate-400">Every write is committed to IndexedDB and queued for later satellite synchronization.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cargo name" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-400" />
          <select value={station} onChange={(e) => setStation(e.target.value as Station)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"><option>Maitri</option><option>Bharati</option><option>Traverse Camp 1</option></select>
          <select value={resourceType} onChange={(e) => { const next = e.target.value as ResourceType; setResourceType(next); setUnit(resourceRates[next].unit) }} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm">{Object.entries(resourceRates).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select>
          <input type="number" min="0" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
          <button disabled={!name.trim()} onClick={() => void onAdd({ id: `${resourceType.toUpperCase()}-${crypto.randomUUID().slice(0, 8)}`, station, resourceType, name: name.trim(), quantity, unit })} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">Add locally</button>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-700 text-xs uppercase tracking-wider text-slate-500"><tr><th className="pb-3">Cargo</th><th className="pb-3">Station</th><th className="pb-3">Resource</th><th className="pb-3">Quantity</th><th className="pb-3">Sync</th></tr></thead>
            <tbody>{inventory.map((item) => <tr key={item.id} className="border-b border-slate-800/70"><td className="py-3 font-medium">{item.name}</td><td>{item.station}</td><td>{resourceRates[item.resourceType].label}</td><td>{item.quantity.toLocaleString()} {item.unit}</td><td><span className={`rounded-full px-2 py-1 text-[11px] ${item.syncStatus === 'synced' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-300'}`}>{item.syncStatus}</span></td></tr>)}</tbody>
          </table>
        </div>
      </Card>
    </>
  )
}

function Predictor({ selectedStation, stats }: { selectedStation: Station; stats: { fuel: number; ration: number; oxygen: number } }) {
  const [occupants, setOccupants] = useState(stationOccupants[selectedStation])
  const [temperature, setTemperature] = useState(-32)
  const [blizzard, setBlizzard] = useState(false)
  const [resource, setResource] = useState<ResourceType>('fuel')
  const currentStock = resource === 'fuel' ? stats.fuel : resource === 'ration' ? stats.ration : stats.oxygen
  const profile = resourceRates[resource]
  const result = calculatePrediction({ occupants, temperatureC: temperature, currentStock, baseRatePerPerson: profile.rate, blizzard, criticalThreshold: profile.threshold })

  const data = {
    labels: result.trajectory.map((point) => `D${point.day}`),
    datasets: [
      { label: 'Projected stock', data: result.trajectory.map((point) => point.stock), borderWidth: 2, tension: 0.3 },
      { label: 'Critical threshold', data: result.criticalLine.map((point) => point.stock), borderWidth: 1, borderDash: [6, 6], tension: 0 }
    ]
  }

  return (
    <Card>
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div><p className="text-xs uppercase tracking-[0.18em] text-cyan-400">Local edge model</p><h2 className="mt-1 text-2xl font-black">Depletion predictor</h2><p className="mt-1 text-sm text-slate-400">{selectedStation} · deterministic JavaScript · no cloud inference</p></div>
        <div className={`rounded-xl px-4 py-2 text-sm font-black ${result.status === 'CRITICAL' ? 'bg-red-500/15 text-red-300' : result.status === 'WARNING' ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{result.status} · {Number.isFinite(result.daysRemaining) ? `${result.daysRemaining.toFixed(1)} days` : '∞'}</div>
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <label className="block text-sm text-slate-300">Resource<select value={resource} onChange={(e) => setResource(e.target.value as ResourceType)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2"><option value="fuel">Heating fuel</option><option value="ration">Rations</option><option value="oxygen">Medical oxygen</option></select></label>
          <label className="block text-sm text-slate-300">Personnel: <span className="font-bold text-cyan-300">{occupants}</span><input type="range" min="10" max="80" value={occupants} onChange={(e) => setOccupants(Number(e.target.value))} className="mt-2 w-full" /></label>
          <label className="block text-sm text-slate-300">Temperature: <span className="font-bold text-cyan-300">{temperature}°C</span><input type="range" min="-60" max="-10" value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} className="mt-2 w-full" /></label>
          <button onClick={() => setBlizzard((value) => !value)} className={`w-full rounded-xl border px-3 py-3 text-sm font-black ${blizzard ? 'border-red-400/50 bg-red-500/15 text-red-300' : 'border-slate-700 bg-slate-950 text-slate-300'}`}>{blizzard ? 'BLIZZARD MODE ACTIVE · +25%' : 'BLIZZARD MODE OFF'}</button>
          <div className="grid grid-cols-2 gap-3"><Stat label="Temp factor" value={`${result.temperatureFactor.toFixed(2)}×`} /><Stat label="Effective burn" value={`${result.effectiveDailyBurn.toFixed(2)}/day`} /></div>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3"><Line data={data} options={{ responsive: true, plugins: { legend: { labels: { color: '#cbd5e1' } } }, scales: { x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(100,116,139,.08)' } }, y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(100,116,139,.08)' } } } }} /></div>
      </div>
    </Card>
  )
}

function Scanner({ onDecoded }: { onDecoded: (item: Omit<InventoryItem, 'updatedAt' | 'syncStatus'>) => Promise<void> }) {
  const [scanner, setScanner] = useState<Html5Qrcode | null>(null)
  const [message, setMessage] = useState('Scanner idle.')

  async function start() {
    if (scanner) return
    const next = new Html5Qrcode('qr-reader')
    setScanner(next)
    try {
      await next.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 }, async (decodedText) => {
        try {
          const parsed = JSON.parse(decodedText) as { id: string; name: string; qty: number; unit: string; station?: Station; resourceType?: ResourceType }
          const resourceType = parsed.resourceType ?? 'equipment'
          await onDecoded({ id: parsed.id, name: parsed.name, quantity: parsed.qty, unit: parsed.unit, station: parsed.station ?? 'Maitri', resourceType })
          setMessage(`Decoded ${parsed.name}. Added to local inventory.`)
          await stop()
        } catch {
          setMessage('QR decoded, but payload is not valid ASTRA JSON.')
        }
      }, () => undefined)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Camera start failed.')
      setScanner(null)
    }
  }

  async function stop() {
    if (!scanner) return
    try { await scanner.stop(); scanner.clear() } finally { setScanner(null) }
  }

  useEffect(() => () => { if (scanner) void scanner.stop() }, [scanner])

  return <Card><div className="flex flex-col justify-between gap-3 md:flex-row md:items-center"><div><h2 className="text-lg font-bold">QR cargo intake</h2><p className="text-sm text-slate-400">Expected payload: id, name, qty, unit, optional station/resourceType.</p></div><div className="flex gap-2"><button onClick={() => void start()} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950">Start camera</button><button onClick={() => void stop()} className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300">Stop</button></div></div><div id="qr-reader" className="mx-auto mt-5 max-w-xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-950" /><p className="mt-3 rounded-xl bg-slate-950/60 p-3 text-sm text-slate-400">{message}</p></Card>
}

function SyncPanel({ queueCount, onSync, message }: { queueCount: number; onSync: () => Promise<void>; message: string }) {
  const [packet, setPacket] = useState<{ jsonBytes: number; packedBytes: number; savingsPercent: number } | null>(null)
  async function preview() { const next = await buildSyncPacket(); setPacket(next) }
  return <Card><h2 className="text-lg font-bold">Satellite sync</h2><p className="mt-1 text-sm text-slate-400">MessagePack keeps queued mutations compact. The prototype deliberately stops before any real government endpoint.</p><div className="mt-5 grid gap-3 md:grid-cols-3"><Stat label="Queued mutations" value={`${queueCount}`} /><Stat label="Packet preview" value={packet ? `${packet.packedBytes} B` : '—'} /><Stat label="Estimated savings" value={packet ? `${packet.savingsPercent.toFixed(1)}%` : '—'} /></div><div className="mt-5 flex flex-wrap gap-2"><button onClick={() => void preview()} className="rounded-xl border border-slate-700 px-4 py-2 text-sm">Preview packet</button><button onClick={() => void onSync()} disabled={queueCount === 0} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-40">Simulate satellite sync</button></div><p className="mt-4 rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-400">{message}</p></Card>
}

function VoyagePlanner({ inventory }: { inventory: InventoryItem[] }) {
  const horizon = 180
  const rows = stationList.flatMap((station) => (['fuel', 'ration', 'oxygen'] as ResourceType[]).map((resourceType) => {
    const stock = inventory.filter((item) => item.station === station && item.resourceType === resourceType).reduce((sum, item) => sum + item.quantity, 0)
    const projected = stationOccupants[station] * resourceRates[resourceType].rate * horizon
    return { station, resourceType, stock, projected, shortage: Math.max(0, projected - stock), unit: resourceRates[resourceType].unit }
  }))

  const chartData = {
    labels: rows.map((row) => `${row.station} / ${resourceRates[row.resourceType].label}`),
    datasets: [{ label: 'Shipment requirement', data: rows.map((row) => row.shortage), borderWidth: 0 }]
  }

  function exportCsv() {
    const header = 'station,resource,stock,projected_180_day_need,required_shipment,unit\n'
    const body = rows.map((row) => `${row.station},${resourceRates[row.resourceType].label},${row.stock},${row.projected.toFixed(2)},${row.shortage.toFixed(2)},${row.unit}`).join('\n')
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'astra-voyage-manifest.csv'; anchor.click(); URL.revokeObjectURL(url)
  }

  return <Card><div className="flex flex-col justify-between gap-3 md:flex-row md:items-center"><div><p className="text-xs uppercase tracking-[0.18em] text-cyan-400">NCPOR Goa</p><h2 className="mt-1 text-2xl font-black">Annual voyage planner</h2><p className="text-sm text-slate-400">Reference cargo requirement for the next 180-day winter lock-in.</p></div><button onClick={exportCsv} className="rounded-xl border border-slate-700 px-4 py-2 text-sm">Export CSV</button></div><div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.2fr]"><div className="overflow-x-auto rounded-xl border border-slate-700"><table className="w-full min-w-[680px] text-left text-sm"><thead className="border-b border-slate-700 text-xs uppercase text-slate-500"><tr><th className="p-3">Station</th><th className="p-3">Resource</th><th className="p-3">Stock</th><th className="p-3">Need</th><th className="p-3">Ship</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.station}-${row.resourceType}`} className="border-b border-slate-800"><td className="p-3">{row.station}</td><td className="p-3">{resourceRates[row.resourceType].label}</td><td className="p-3">{row.stock.toFixed(1)} {row.unit}</td><td className="p-3">{row.projected.toFixed(1)}</td><td className="p-3 font-bold text-cyan-300">{row.shortage.toFixed(1)} {row.unit}</td></tr>)}</tbody></table></div><div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3"><Bar data={chartData} options={{ indexAxis: 'y' as const, responsive: true, plugins: { legend: { labels: { color: '#cbd5e1' } } }, scales: { x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(100,116,139,.08)' } }, y: { ticks: { color: '#94a3b8' }, grid: { display: false } } } }} /></div></div></Card>
}

export default App
