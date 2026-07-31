import { useState } from 'react'

type DemoView = 'today' | 'map' | 'search' | 'venue' | 'slots' | 'done'

type Venue = {
  name: string
  distance: string
  meta: string
  capacity: number
  live: boolean
  specs: Array<{ label: string; value: string }>
  schedule: Array<{ time: string; match: string; live?: boolean }>
}

const VENUES: Venue[] = [
  {
    name: 'Bar do Zé',
    distance: '1,2 km',
    meta: '80% cheio · som no jogo',
    capacity: 80,
    live: true,
    specs: [
      { label: 'Telões', value: '3 · 65"' },
      { label: 'Som', value: 'Narração' },
      { label: 'Torcida', value: 'Rubro-negra' }
    ],
    schedule: [
      { time: 'Agora', match: 'Flamengo × Palmeiras', live: true },
      { time: 'Sáb 16:00', match: 'Vasco × Botafogo' }
    ]
  },
  {
    name: 'Sports Central',
    distance: '2,4 km',
    meta: '3 telões · reserva livre',
    capacity: 45,
    live: false,
    specs: [
      { label: 'Telões', value: '5 · 75"' },
      { label: 'Som', value: 'Música' },
      { label: 'Torcida', value: 'Mista' }
    ],
    schedule: [
      { time: 'Hoje 21:30', match: 'Celtics × Mavericks' },
      { time: 'Dom 14:00', match: 'GP de Interlagos' }
    ]
  },
  {
    name: 'The Red Lion',
    distance: '3,1 km',
    meta: 'Torcida rubro-negra',
    capacity: 60,
    live: false,
    specs: [
      { label: 'Telões', value: '2 · 55"' },
      { label: 'Som', value: 'Narração' },
      { label: 'Torcida', value: 'Inglesa' }
    ],
    schedule: [
      { time: 'Amanhã 16:00', match: 'Real Madrid × Bayern' },
      { time: 'Qui 16:00', match: 'Arsenal × Inter' }
    ]
  }
]
const DEFAULT_VENUE = VENUES[0] as Venue

const FILTERS = ['Ao vivo', 'Até 5 km', 'Som no jogo', 'Reserva']
const PARTY_OPTIONS = ['2', '4', '6', '8+']
const SLOTS = [
  { time: '20:45', spot: 'Mesa alta · telão 1', state: 'Livre', free: true },
  {
    time: '21:00',
    spot: 'Mesa de canto · telão 2',
    state: 'Livre',
    free: true
  },
  {
    time: '21:15',
    spot: 'Balcão · 6 banquetas',
    state: 'Última',
    free: true
  },
  {
    time: '21:30',
    spot: 'Área externa',
    state: 'Sem vaga',
    free: false
  }
]

const VIEW_COPY: Record<
  DemoView,
  { eyebrow: string; title: string; accent?: boolean }
> = {
  today: { eyebrow: '● Ao vivo · 3 bares', title: 'O que passa hoje' },
  map: { eyebrow: '5 bares no raio', title: 'Perto de você' },
  search: { eyebrow: '4 resultados', title: 'Buscar jogo' },
  venue: { eyebrow: '● Ao vivo agora', title: '' },
  slots: { eyebrow: 'Passo 1 de 2', title: 'Tem mesa?' },
  done: { eyebrow: 'Passo 2 de 2', title: 'Mesa garantida', accent: true }
}

function DemoHeader({
  view,
  venue,
  onBack
}: {
  view: DemoView
  venue: Venue
  onBack: () => void
}) {
  const copy = VIEW_COPY[view]
  const title = view === 'venue' ? venue.name : copy.title
  const eyebrow =
    view === 'venue' && !venue.live ? 'Grade publicada' : copy.eyebrow

  return (
    <div className={`demo-header ${copy.accent ? 'is-accent' : ''}`}>
      <div className="demo-status">
        <span>21:41</span>
        <span>Pinheiros</span>
      </div>
      <div className="demo-head-row">
        <span className={venue.live ? 'is-live' : undefined}>{eyebrow}</span>
        {(view === 'venue' || view === 'slots') && (
          <button type="button" onClick={onBack}>
            ← Voltar
          </button>
        )}
      </div>
      <h3>{title}</h3>
    </div>
  )
}

function VenueList({ openVenue }: { openVenue: (index: number) => void }) {
  return (
    <div className="demo-list">
      {VENUES.map((venue, index) => (
        <button
          className={`demo-venue-row ${
            venue.live ? 'is-live' : index === 1 ? 'is-featured' : ''
          }`}
          key={venue.name}
          type="button"
          onClick={() => openVenue(index)}
        >
          <span className="demo-row-main">
            <strong>{venue.name}</strong>
            <span>{venue.distance}</span>
          </span>
          <span className="demo-row-meta">{venue.meta}</span>
        </button>
      ))}
      <p className="demo-hint">Toque num bar para ver a grade</p>
    </div>
  )
}

function MapView({
  selectedVenue,
  selectVenue,
  openVenue
}: {
  selectedVenue: number
  selectVenue: (index: number) => void
  openVenue: () => void
}) {
  const venue = VENUES[selectedVenue]
  const positions = [
    { left: '30%', top: '34%' },
    { left: '68%', top: '30%' },
    { left: '40%', top: '56%' }
  ]

  return (
    <div className="demo-map">
      <span className="demo-map-grid" />
      <span className="demo-road demo-road-a" />
      <span className="demo-road demo-road-b" />
      <span className="demo-river" />
      <span className="demo-user-pulse" />
      <span className="demo-user-dot" />
      {VENUES.map((item, index) => (
        <button
          key={item.name}
          type="button"
          className={`demo-pin ${
            selectedVenue === index ? 'is-selected' : ''
          } ${item.live ? 'is-live' : ''}`}
          style={positions[index]}
          onClick={() => selectVenue(index)}
          aria-label={`Selecionar ${item.name}`}
        >
          <span>{item.name}</span>
          <i />
        </button>
      ))}
      <div className="demo-map-sheet">
        <span>{venue.meta}</span>
        <strong>{venue.name}</strong>
        <button type="button" onClick={openVenue}>
          Ver o bar
        </button>
      </div>
    </div>
  )
}

function SearchView({
  activeFilters,
  toggleFilter,
  openVenue
}: {
  activeFilters: number[]
  toggleFilter: (index: number) => void
  openVenue: (index: number) => void
}) {
  return (
    <div className="demo-search">
      <div className="demo-query">
        <span>champions league</span>
        <span>×</span>
      </div>
      <fieldset className="demo-chips">
        <legend className="sr-only">Filtros de busca</legend>
        {FILTERS.map((filter, index) => (
          <button
            key={filter}
            type="button"
            className={activeFilters.includes(index) ? 'is-active' : ''}
            onClick={() => toggleFilter(index)}
            aria-pressed={activeFilters.includes(index)}
          >
            {filter}
          </button>
        ))}
      </fieldset>
      <div className="demo-results">
        {VENUES.map((venue, index) => (
          <button
            key={venue.name}
            type="button"
            onClick={() => openVenue(index)}
          >
            <span>
              <strong>{venue.name}</strong>
              <small>{venue.distance}</small>
            </span>
            <em>
              {venue.schedule[0]?.time} · {venue.schedule[0]?.match}
            </em>
          </button>
        ))}
      </div>
    </div>
  )
}

function VenueView({ venue, onBook }: { venue: Venue; onBook: () => void }) {
  return (
    <div className="demo-venue-detail">
      <div className="demo-capacity-label">
        <span>Lotação agora</span>
        <strong>{venue.capacity}%</strong>
      </div>
      <meter
        className="sr-only"
        aria-label={`Lotação atual de ${venue.name}`}
        value={venue.capacity}
        min={0}
        max={100}
      >
        {venue.capacity}%
      </meter>
      <div className="demo-capacity" aria-hidden="true">
        <span style={{ width: `${venue.capacity}%` }} />
      </div>
      <div className="demo-specs">
        {venue.specs.map((spec) => (
          <div key={spec.label}>
            <span>{spec.label}</span>
            <strong>{spec.value}</strong>
          </div>
        ))}
      </div>
      <p className="demo-section-label">Grade da semana</p>
      <div className="demo-schedule">
        {venue.schedule.map((event) => (
          <div key={`${event.time}-${event.match}`}>
            <span className={event.live ? 'is-live' : undefined}>
              {event.time}
            </span>
            <strong>{event.match}</strong>
          </div>
        ))}
      </div>
      <button className="demo-primary-action" type="button" onClick={onBook}>
        Ver mesas · R$ 15/pessoa
      </button>
    </div>
  )
}

function SlotsView({
  party,
  selectedSlot,
  setParty,
  setSelectedSlot,
  onPay
}: {
  party: string
  selectedSlot: number
  setParty: (party: string) => void
  setSelectedSlot: (slot: number) => void
  onPay: () => void
}) {
  return (
    <div className="demo-slots">
      <p className="demo-section-label">Quantas pessoas</p>
      <div className="demo-party-options">
        {PARTY_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            className={party === option ? 'is-active' : ''}
            onClick={() => setParty(option)}
            aria-pressed={party === option}
          >
            {option}
          </button>
        ))}
      </div>
      <p className="demo-section-label">Mesas livres para {party}</p>
      <div className="demo-slot-list">
        {SLOTS.map((slot, index) => (
          <button
            key={`${slot.time}-${slot.spot}`}
            type="button"
            disabled={!slot.free}
            className={selectedSlot === index ? 'is-active' : ''}
            onClick={() => setSelectedSlot(index)}
          >
            <span>
              <strong>{slot.time}</strong>
              <small>{slot.spot}</small>
            </span>
            <em className={slot.state === 'Última' ? 'is-last' : undefined}>
              {slot.state}
            </em>
          </button>
        ))}
      </div>
      <button className="demo-pay" type="button" onClick={onPay}>
        Pagar R$ 94,90
      </button>
      <p className="demo-pay-note">Sinal de R$ 15/pessoa vira crédito no bar</p>
    </div>
  )
}

function DoneView({
  party,
  onRestart
}: {
  party: string
  onRestart: () => void
}) {
  return (
    <div className="demo-done">
      <p>Mostre na porta</p>
      <strong>ONS-4F92</strong>
      <div className="demo-barcode" aria-hidden="true">
        {[
          { id: 'a', width: 3 },
          { id: 'b', width: 6 },
          { id: 'c', width: 2 },
          { id: 'd', width: 8 },
          { id: 'e', width: 3 },
          { id: 'f', width: 2 },
          { id: 'g', width: 7 },
          { id: 'h', width: 3 }
        ].map((bar) => (
          <span key={bar.id} style={{ width: bar.width }} />
        ))}
      </div>
      <p>
        Mesa alta garantida às 20:45 para {party} pessoas. R$ 90 de crédito no
        bar.
      </p>
      <button type="button" onClick={onRestart}>
        Começar de novo
      </button>
    </div>
  )
}

export function OnsideAppDemo() {
  const [view, setView] = useState<DemoView>('today')
  const [selectedVenue, setSelectedVenue] = useState(0)
  const [party, setParty] = useState('6')
  const [selectedSlot, setSelectedSlot] = useState(0)
  const [activeFilters, setActiveFilters] = useState([0, 1])

  const venue = VENUES[selectedVenue] ?? DEFAULT_VENUE

  function openVenue(index = selectedVenue) {
    setSelectedVenue(index)
    setView('venue')
  }

  function toggleFilter(index: number) {
    setActiveFilters((current) =>
      current.includes(index)
        ? current.filter((item) => item !== index)
        : [...current, index]
    )
  }

  function goBack() {
    setView(view === 'slots' ? 'venue' : 'today')
  }

  return (
    <section
      className="onside-phone"
      aria-label="Demonstração interativa do app"
    >
      <DemoHeader view={view} venue={venue} onBack={goBack} />
      <div className={`demo-body demo-view-${view}`} aria-live="polite">
        {view === 'today' && <VenueList openVenue={openVenue} />}
        {view === 'map' && (
          <MapView
            selectedVenue={selectedVenue}
            selectVenue={setSelectedVenue}
            openVenue={() => openVenue()}
          />
        )}
        {view === 'search' && (
          <SearchView
            activeFilters={activeFilters}
            toggleFilter={toggleFilter}
            openVenue={openVenue}
          />
        )}
        {view === 'venue' && (
          <VenueView venue={venue} onBook={() => setView('slots')} />
        )}
        {view === 'slots' && (
          <SlotsView
            party={party}
            selectedSlot={selectedSlot}
            setParty={setParty}
            setSelectedSlot={setSelectedSlot}
            onPay={() => setView('done')}
          />
        )}
        {view === 'done' && (
          <DoneView
            party={party}
            onRestart={() => {
              setSelectedSlot(0)
              setView('today')
            }}
          />
        )}
      </div>
      <nav className="demo-tabs" aria-label="Navegação do app">
        {(
          [
            ['today', 'Hoje'],
            ['map', 'Mapa'],
            ['search', 'Buscar']
          ] as const
        ).map(([tab, label]) => {
          const isActive =
            view === tab ||
            (tab === 'today' &&
              (view === 'venue' || view === 'slots' || view === 'done'))
          return (
            <button
              key={tab}
              type="button"
              className={isActive ? 'is-active' : ''}
              onClick={() => setView(tab)}
              aria-current={isActive ? 'page' : undefined}
            >
              <span />
              {label}
            </button>
          )
        })}
      </nav>
    </section>
  )
}
