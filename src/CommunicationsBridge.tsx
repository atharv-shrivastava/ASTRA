import { useEffect, useMemo, useState } from 'react'
import './communications.css'

const STORAGE_KEY = 'astra-communications-v1'

type Station = 'Maitri' | 'Bharati' | 'Traverse Camp 1'
type Endpoint = 'Goa HQ' | Station
type MessageType = 'Custom' | 'Supply request' | 'Supply update' | 'Status report'

interface Message {
  id: string
  from: Endpoint
  to: Endpoint
  type: MessageType
  text: string
  sentAt: string
  status: 'Local' | 'Queued' | 'Delivered'
}

const stations: Station[] = ['Maitri', 'Bharati', 'Traverse Camp 1']

const starterMessages: Message[] = [
  {
    id: 'MSG-001',
    from: 'Maitri',
    to: 'Goa HQ',
    type: 'Supply request',
    text: 'Heating fuel projected below reserve window. Requesting 4,200 L replenishment for the next dispatch cycle.',
    sentAt: '16 Sep · 14:20',
    status: 'Delivered'
  },
  {
    id: 'MSG-002',
    from: 'Goa HQ',
    to: 'Maitri',
    type: 'Supply update',
    text: 'Supply plan SUP-031 is prepared. Air dispatch is targeted for 18 Sep at 06:40 IST.',
    sentAt: '16 Sep · 15:05',
    status: 'Delivered'
  }
]

function loadMessages(): Message[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return starterMessages
    const parsed = JSON.parse(raw) as Message[]
    return Array.isArray(parsed) && parsed.length ? parsed : starterMessages
  } catch {
    return starterMessages
  }
}

function saveMessages(messages: Message[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
}

export default function CommunicationsBridge() {
  const [open, setOpen] = useState(false)
  const [identity, setIdentity] = useState<Endpoint>('Maitri')
  const [messages, setMessages] = useState<Message[]>(loadMessages)
  const [target, setTarget] = useState<Endpoint>('Goa HQ')
  const [type, setType] = useState<MessageType>('Custom')
  const [text, setText] = useState('')
  const [station, setStation] = useState<Station>('Maitri')

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) setMessages(loadMessages())
      else setMessages(loadMessages())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    if (identity === 'Goa HQ') setTarget(station)
    else setTarget('Goa HQ')
  }, [identity, station])

  const unread = useMemo(() => messages.filter((message) => message.to === identity && message.status !== 'Local').length, [messages, identity])
  const thread = useMemo(() => messages.slice(-8).reverse(), [messages])

  function sendMessage() {
    const body = text.trim()
    if (!body) return
    const next: Message = {
      id: `MSG-${Date.now()}`,
      from: identity,
      to: target,
      type,
      text: body,
      sentAt: new Date().toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
      status: 'Queued'
    }
    const updated = [...messages, next]
    setMessages(updated)
    saveMessages(updated)
    setText('')
  }

  function resetDemo() {
    setMessages(starterMessages)
    saveMessages(starterMessages)
  }

  return (
    <>
      <button className="comms-launcher" onClick={() => setOpen((value) => !value)} aria-label="Open communications">
        <span className="comms-launcher-mark">↕</span>
        <span>COMMS</span>
        {unread > 0 && <b>{unread}</b>}
      </button>

      {open && (
        <div className="comms-window" role="dialog" aria-label="ASTRA communications">
          <div className="comms-header">
            <div>
              <div className="comms-kicker">ASTRA COMMUNICATIONS BRIDGE</div>
              <strong>Goa HQ ↔ Antarctica</strong>
            </div>
            <button className="comms-close" onClick={() => setOpen(false)}>×</button>
          </div>

          <div className="comms-identity">
            <span>Operating console</span>
            <div className="identity-toggle">
              <button className={identity === 'Goa HQ' ? 'active' : ''} onClick={() => setIdentity('Goa HQ')}>GOA HQ</button>
              <button className={identity !== 'Goa HQ' ? 'active' : ''} onClick={() => setIdentity(station)}>FIELD</button>
            </div>
            {identity !== 'Goa HQ' && (
              <select value={station} onChange={(event) => setStation(event.target.value as Station)}>
                {stations.map((item) => <option key={item}>{item}</option>)}
              </select>
            )}
          </div>

          <div className="comms-thread">
            {thread.map((message) => (
              <article key={message.id} className={`message-card ${message.from === identity ? 'mine' : 'theirs'}`}>
                <div className="message-meta">
                  <strong>{message.from}</strong>
                  <span>→ {message.to}</span>
                  <span>{message.sentAt}</span>
                </div>
                <div className="message-type">{message.type} · {message.status}</div>
                <p>{message.text}</p>
              </article>
            ))}
          </div>

          <div className="comms-compose">
            <div className="compose-route">
              <div><span>FROM</span><strong>{identity}</strong></div>
              <div className="route-arrow">→</div>
              <div><span>TO</span><strong>{target}</strong></div>
            </div>
            <div className="compose-row">
              <select value={type} onChange={(event) => setType(event.target.value as MessageType)}>
                <option>Custom</option>
                <option>Supply request</option>
                <option>Supply update</option>
                <option>Status report</option>
              </select>
              <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder={identity === 'Goa HQ' ? 'Send a supply update, instruction, acknowledgement or custom message...' : 'Send a demand, status report, acknowledgement or custom message to Goa HQ...'} />
            </div>
            <div className="compose-actions">
              <button className="reset-button" onClick={resetDemo}>Reset demo thread</button>
              <button className="send-button" disabled={!text.trim()} onClick={sendMessage}>Send message ↗</button>
            </div>
            <div className="comms-note">Messages are stored locally in this prototype and marked queued for the next synchronization cycle.</div>
          </div>
        </div>
      )}
    </>
  )
}
