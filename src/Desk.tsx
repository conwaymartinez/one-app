import { FormEvent, PointerEvent as ReactPointerEvent, RefObject, useEffect, useRef, useState } from "react"
import Icon from "./Icon"
import type { DailyReview, DayOutline, Note, Tag } from "./types"

/**
 * Desktop ("bird's-eye") pieces. On wide screens the app becomes three panels:
 * parked notes on the left, the current depth in the middle, today on the right.
 * Notes can be dragged from the left panel onto projects, week hours and calendar slots.
 */

export const DESK_QUERY = "(min-width: 1200px)"

/** True on wide screens. Follows the window as it resizes. */
export function useIsDesk() {
  const [desk, setDesk] = useState(() => {
    try {
      return window.matchMedia(DESK_QUERY).matches
    } catch {
      return false
    }
  })
  useEffect(() => {
    let query: MediaQueryList
    try {
      query = window.matchMedia(DESK_QUERY)
    } catch {
      return
    }
    const update = () => setDesk(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])
  return desk
}

// Small date helpers (local time, same format as App's `localDateKey`).
const pad = (n: number) => String(n).padStart(2, "0")
export const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const dateOf = (key: string) => {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(y, m - 1, d)
}
export const addDays = (key: string, n: number) => {
  const d = dateOf(key)
  d.setDate(d.getDate() + n)
  return keyOf(d)
}
/** The Monday of the week that holds this day. */
export const mondayOf = (key: string) => {
  const d = dateOf(key)
  return addDays(key, -((d.getDay() + 6) % 7))
}
const hourName = (h: number) =>
  h === 0 || h === 24 ? "12 AM" : h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h - 12} PM`
const shortHour = (h: number) => (h === 0 ? "12A" : h === 12 ? "12P" : h < 12 ? `${h}A` : `${h - 12}P`)

export type NoteDrop =
  | { kind: "col"; tagId: string | null }
  | { kind: "hour"; date: string; hour: number }
  | { kind: "slot"; date: string; hour: number }

/** Reads the drop target under the pointer while a note is dragged. */
export function dropAt(x: number, y: number): NoteDrop | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null
  const target = el?.closest<HTMLElement>("[data-note-drop], [data-slot]")
  if (!target) return null
  if (target.dataset.slot !== undefined)
    return { kind: "slot", date: target.dataset.date || "", hour: Number(target.dataset.hour) }
  if (target.dataset.noteDrop === "col")
    return { kind: "col", tagId: target.dataset.tag || null }
  if (target.dataset.noteDrop === "hour")
    return { kind: "hour", date: target.dataset.date || "", hour: Number(target.dataset.hour) }
  return null
}

/** A parked note card that can be dragged with the mouse (or pen). */
function NoteCard({
  note,
  tag,
  dragging,
  onDragStart,
  onComplete,
  onDelete,
}: {
  note: Note
  tag?: Tag
  dragging: boolean
  onDragStart: (e: ReactPointerEvent, id: number) => void
  onComplete: (id: number) => void
  onDelete: (id: number) => void
}) {
  return (
    <article
      className={`desk-note ${tag ? `sorted ${tag.color}` : ""} ${dragging ? "dragging" : ""}`}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) return
        onDragStart(e, note.id)
      }}
      title={`Parked ${new Date(note.createdAt).toLocaleString("en-US", {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      })}`}
    >
      <Icon name="grip" size={14} />
      <div>
        {tag && <small>→ {tag.name}</small>}
        <span>{note.text}</span>
      </div>
      <span className="desk-note-actions">
        <button aria-label={`Done: ${note.text}`} onClick={() => onComplete(note.id)} type="button">
          <Icon name="check" size={13} />
        </button>
        <button aria-label={`Remove: ${note.text}`} onClick={() => onDelete(note.id)} type="button">
          <Icon name="close" size={13} />
        </button>
      </span>
    </article>
  )
}

/** Quick capture: one line, Enter parks it. */
function Capture({
  onAdd,
  inputRef,
  big,
}: {
  onAdd: (text: string) => void
  inputRef: RefObject<HTMLInputElement | null>
  big?: boolean
}) {
  const [text, setText] = useState("")
  function submit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    onAdd(text.trim())
    setText("")
  }
  return (
    <form className={big ? "desk-capture big" : "desk-capture"} onSubmit={submit}>
      <label className="sr-only" htmlFor={big ? "desk-capture-big" : "desk-capture"}>
        Park a thought
      </label>
      <input
        id={big ? "desk-capture-big" : "desk-capture"}
        onChange={(e) => setText(e.target.value)}
        placeholder={big ? "What's on your mind? Type it, press Enter." : "Park a thought, press Enter"}
        ref={inputRef}
        value={text}
      />
      {big && (
        <button disabled={!text.trim()} type="submit">
          Park it
        </button>
      )}
    </form>
  )
}

type NoteHandlers = {
  notes: Note[]
  tags: Tag[]
  draggingId: number | null
  onAdd: (text: string) => void
  onComplete: (id: number) => void
  onDelete: (id: number) => void
  onDragStart: (e: ReactPointerEvent, id: number) => void
  inputRef: RefObject<HTMLInputElement | null>
}

/** Left panel: parked notes, always one drag away. */
export function ParkedRail({ notes, tags, draggingId, onAdd, onComplete, onDelete, onDragStart, inputRef, hint }: NoteHandlers & { hint: string }) {
  const byId = (id?: string | null) => tags.find((tag) => tag.id === id)
  return (
    <section aria-labelledby="desk-parked-title" className="desk-parked">
      <div className="desk-rail-head">
        <h2 id="desk-parked-title">Parked · {notes.length}</h2>
        <span>
          <kbd>N</kbd> new
        </span>
      </div>
      <Capture inputRef={inputRef} onAdd={onAdd} />
      {notes.length > 0 && <p className="desk-rail-hint">{hint}</p>}
      <div className="desk-note-list">
        {notes.map((note) => (
          <NoteCard
            dragging={draggingId === note.id}
            key={note.id}
            note={note}
            onComplete={onComplete}
            onDelete={onDelete}
            onDragStart={onDragStart}
            tag={byId(note.tagId)}
          />
        ))}
        {!notes.length && <p className="desk-rail-hint">Nothing parked. Your head is clear.</p>}
      </div>
    </section>
  )
}

/** Park on desktop: a board with a column per project. Drag notes between columns to sort them. */
export function ParkBoard({
  notes,
  tags,
  draggingId,
  dropTag,
  todayHours,
  onAdd,
  onComplete,
  onDelete,
  onDragStart,
  inputRef,
  dateLabel,
}: NoteHandlers & {
  /** Column under the dragged note (undefined: none). */
  dropTag: string | null | undefined
  todayHours: Record<string, number>
  dateLabel: string
}) {
  const columns: { id: string | null; name: string; color?: Tag["color"] }[] = [
    { id: null, name: "Unsorted" },
    ...tags.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color })),
  ]
  const known = new Set(tags.map((tag) => tag.id))
  return (
    <main className="desk-main desk-park">
      <header className="desk-head">
        <div>
          <small>{dateLabel}</small>
          <h1>Parked thoughts</h1>
        </div>
        <p>
          Drag between columns to sort · <kbd>N</kbd> from anywhere
        </p>
      </header>
      <Capture big inputRef={inputRef} onAdd={onAdd} />
      <div className="desk-board" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(180px, 1fr))` }}>
        {columns.map((column) => {
          const items = notes.filter((note) =>
            column.id === null ? !note.tagId || !known.has(note.tagId) : note.tagId === column.id,
          )
          const over = dropTag !== undefined && dropTag === column.id
          return (
            <section
              aria-label={column.name}
              className={`desk-col ${column.color || "unsorted"} ${over ? "over" : ""}`}
              data-note-drop="col"
              data-tag={column.id ?? ""}
              key={column.id ?? "unsorted"}
            >
              <div className="desk-col-head">
                <span>
                  <i />
                  {column.name}
                </span>
                <b>{items.length}</b>
              </div>
              <small>{column.id ? `${todayHours[column.id] || 0} h today` : "To sort"}</small>
              {items.map((note) => (
                <NoteCard
                  dragging={draggingId === note.id}
                  key={note.id}
                  note={note}
                  onComplete={onComplete}
                  onDelete={onDelete}
                  onDragStart={onDragStart}
                  tag={column.id ? tags.find((tag) => tag.id === column.id) : undefined}
                />
              ))}
              {over && <div className="desk-drop-hint">Drop to sort into {column.name}</div>}
              {!items.length && !over && <p className="desk-col-empty">Nothing here yet</p>}
            </section>
          )
        })}
      </div>
      <p className="desk-foot">
        Done notes leave the board. Sorted notes wait in the side panel on Outline and Plan, ready to drag onto hours.
      </p>
    </main>
  )
}

/** Contiguous runs of the same project from `from` to midnight. */
function runsFrom(outline: DayOutline | undefined, from: number) {
  const runs: { tagId: string | null; start: number; end: number }[] = []
  for (let h = from; h < 24; h++) {
    const id = outline?.hours[h] ?? null
    const last = runs[runs.length - 1]
    if (last && last.tagId === id) last.end = h + 1
    else runs.push({ tagId: id, start: h, end: h + 1 })
  }
  return runs
}

/** Right panel: today at a glance, whatever depth you're on. */
export function TodayRail({
  tags,
  outline,
  now,
  dateLabel,
}: {
  tags: Tag[]
  outline: DayOutline | undefined
  now: Date
  dateLabel: string
}) {
  const hours = outline?.hours || {}
  const counts: Record<string, number> = {}
  Object.values(hours).forEach((id) => {
    if (id) counts[id] = (counts[id] || 0) + 1
  })
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const byId = (id?: string | null) => tags.find((tag) => tag.id === id)
  const nowPct = ((now.getHours() + now.getMinutes() / 60) / 24) * 100
  const next = runsFrom(outline, now.getHours()).slice(0, 4)
  return (
    <aside aria-label="Today" className="desk-today">
      <div className="desk-today-head">
        <small>{dateLabel}</small>
        <strong>
          Today{" "}
          <span>{now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
        </strong>
      </div>
      <section aria-label="Today's hours" className="desk-today-day">
        <div className="desk-eyebrows">
          <span>{total} h outlined</span>
          <span>{24 - total} h open</span>
        </div>
        <div aria-hidden className="desk-strip">
          {Array.from({ length: 24 }, (_, h) => (
            <i className={byId(hours[h])?.color || "open"} key={h} />
          ))}
          <b style={{ left: `${nowPct}%` }} />
        </div>
        <div aria-hidden className="desk-strip-scale">
          <span>12A</span>
          <span>6A</span>
          <span>12P</span>
          <span>6P</span>
          <span>12A</span>
        </div>
        <ul className="desk-today-list">
          {Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([id, n]) => {
              const tag = byId(id)
              if (!tag) return null
              return (
                <li key={id}>
                  <i className={tag.color} />
                  <span>{tag.name}</span>
                  {outline?.focus === id && <em>Focus</em>}
                  <b>{n} h</b>
                </li>
              )
            })}
          {!total && <li className="none">Nothing outlined today</li>}
        </ul>
      </section>
      <section aria-labelledby="desk-next-title" className="desk-next">
        <h2 id="desk-next-title">Up next</h2>
        <ul>
          {next.map((run, i) => {
            const tag = byId(run.tagId)
            const left = i === 0 ? run.end * 60 - (now.getHours() * 60 + now.getMinutes()) : 0
            return (
              <li key={run.start}>
                <i className={tag?.color || "open"} />
                <span>
                  <strong>{tag?.name || "Open"}</strong>
                  <small>
                    {i === 0
                      ? `Now · ${left >= 60 ? `${Math.floor(left / 60)}h ` : ""}${left % 60}m left`
                      : `${run.end - run.start} h`}
                  </small>
                </span>
                <time>
                  {hourName(run.start)}–{hourName(run.end)}
                </time>
              </li>
            )
          })}
        </ul>
      </section>
      <div className="desk-keys">
        <span>
          <kbd>N</kbd> park a note · <kbd>1</kbd>
          <kbd>2</kbd>
          <kbd>3</kbd> depth
        </span>
        <span>
          <kbd>←</kbd>
          <kbd>→</kbd> change week · <kbd>Esc</kbd> close
        </span>
      </div>
    </aside>
  )
}

/** Outline on desktop: the whole week as rows of 24 hours. Pick a project and brush across hours and days. */
export function WeekOutline({
  weekStart,
  todayKey,
  now,
  tags,
  outlines,
  dropHour,
  onPaint,
  onClearDay,
  onCopyPrevious,
  onOpenDay,
  onShiftWeek,
}: {
  weekStart: string
  todayKey: string
  now: Date
  tags: Tag[]
  outlines: Record<string, DayOutline>
  /** Week hour under a dragged note, if any. */
  dropHour: { date: string; hour: number } | null
  onPaint: (date: string, hour: number, tagId: string | null) => void
  onClearDay: (date: string) => void
  onCopyPrevious: (date: string) => void
  onOpenDay: (date: string) => void
  onShiftWeek: (weeks: number) => void
}) {
  const [brush, setBrush] = useState<string | null>(tags[0]?.id ?? null)
  const [erase, setErase] = useState(false)
  const painting = useRef(false)
  const lastCell = useRef("")
  useEffect(() => {
    if (brush && !tags.some((tag) => tag.id === brush)) setBrush(tags[0]?.id ?? null)
  }, [tags, brush])
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const byId = (id?: string | null) => tags.find((tag) => tag.id === id)
  const week: Record<string, number> = {}
  days.forEach((key) =>
    Object.values(outlines[key]?.hours || {}).forEach((id) => {
      if (id && byId(id)) week[id] = (week[id] || 0) + 1
    }),
  )
  const weekTotal = Object.values(week).reduce((a, b) => a + b, 0)
  const brushTag = erase ? null : byId(brush)

  function paintAt(x: number, y: number) {
    const el = document.elementFromPoint(x, y) as HTMLElement | null
    const cell = el?.closest<HTMLElement>("[data-week-cell]")
    if (!cell) return
    const id = `${cell.dataset.date}-${cell.dataset.hour}`
    if (id === lastCell.current) return
    lastCell.current = id
    onPaint(cell.dataset.date || "", Number(cell.dataset.hour), erase ? null : brush)
  }
  const first = dateOf(days[0])
  const last = dateOf(days[6])
  const range = `${first.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${last.toLocaleDateString(
    "en-US",
    first.getMonth() === last.getMonth() ? { day: "numeric" } : { month: "short", day: "numeric" },
  )}`
  return (
    <main className="desk-main desk-week">
      <header className="desk-head">
        <div>
          <small>Week of {range}</small>
          <h1>{days.includes(todayKey) ? "This week" : "Week"}</h1>
        </div>
        <div className="desk-week-nav">
          <button aria-label="Previous week" className="icon-button" onClick={() => onShiftWeek(-1)} type="button">
            <Icon name="left" size={16} />
          </button>
          {!days.includes(todayKey) && (
            <button className="desk-ghost" onClick={() => onShiftWeek(0)} type="button">
              This week
            </button>
          )}
          <button aria-label="Next week" className="icon-button" onClick={() => onShiftWeek(1)} type="button">
            <Icon name="right" size={16} />
          </button>
        </div>
      </header>

      <div aria-label="Paint with" className="desk-brushes" role="toolbar">
        {tags.map((tag) => (
          <button
            aria-pressed={!erase && brush === tag.id}
            className={`desk-brush ${tag.color} ${!erase && brush === tag.id ? "on" : ""}`}
            key={tag.id}
            onClick={() => {
              setErase(false)
              setBrush(tag.id)
            }}
            type="button"
          >
            <i />
            {tag.name}
            <span>{week[tag.id] || 0} h</span>
          </button>
        ))}
        <button
          aria-pressed={erase}
          className={`desk-brush erase ${erase ? "on" : ""}`}
          onClick={() => setErase((on) => !on)}
          type="button"
        >
          <Icon name="eraser" size={14} />
          Erase
        </button>
        <span className="desk-brush-hint">
          {brushTag ? `Brush across hours and days to paint ${brushTag.name}` : erase ? "Brush to clear hours" : "Pick a project to paint"}
        </span>
      </div>

      <section aria-label="Week outline" className="desk-grid-wrap">
        <div aria-hidden className="desk-grid-row scale">
          <span />
          <div className="desk-cells">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h}>{h % 3 === 0 ? shortHour(h) : ""}</span>
            ))}
          </div>
          <span />
        </div>
        <div
          className="desk-grid"
          onPointerCancel={() => (painting.current = false)}
          onPointerDown={(e) => {
            if (e.button !== 0 || !(e.target as HTMLElement).closest("[data-week-cell]")) return
            if (!erase && !brush) return
            e.currentTarget.setPointerCapture(e.pointerId)
            painting.current = true
            lastCell.current = ""
            paintAt(e.clientX, e.clientY)
          }}
          onPointerMove={(e) => painting.current && paintAt(e.clientX, e.clientY)}
          onPointerUp={() => (painting.current = false)}
        >
          {days.map((key) => {
            const outline = outlines[key]
            const hours = outline?.hours || {}
            const count = Object.values(hours).filter((id) => id && byId(id)).length
            const focus = byId(outline?.focus)
            const isToday = key === todayKey
            const d = dateOf(key)
            return (
              <div className={`desk-grid-row ${isToday ? "today" : ""} ${key < todayKey ? "past" : ""}`} key={key}>
                <div className="desk-day">
                  <button onClick={() => onOpenDay(key)} title="Open this day on the clock" type="button">
                    {d.toLocaleDateString("en-US", { weekday: "short" })} {d.getDate()}
                    {isToday && <em> · Today</em>}
                  </button>
                  <small>
                    {focus ? (
                      <>
                        <i className={focus.color} />
                        {focus.name}
                      </>
                    ) : (
                      "No focus"
                    )}
                  </small>
                </div>
                <div className="desk-cells">
                  {Array.from({ length: 24 }, (_, h) => {
                    const tag = byId(hours[h])
                    const target = dropHour?.date === key && dropHour.hour === h
                    return (
                      <span
                        aria-label={`${d.toLocaleDateString("en-US", { weekday: "long" })} ${hourName(h)}: ${tag?.name || "open"}`}
                        className={`desk-cell ${tag?.color || "open"} ${target ? "target" : ""}`}
                        data-date={key}
                        data-hour={h}
                        data-note-drop="hour"
                        data-week-cell
                        key={h}
                        role="img"
                        title={`${hourName(h)}–${hourName(h + 1)} · ${tag?.name || "Open"}`}
                      />
                    )
                  })}
                  {isToday && (
                    <b
                      aria-hidden
                      className="desk-now"
                      style={{ left: `${((now.getHours() + now.getMinutes() / 60) / 24) * 100}%` }}
                    />
                  )}
                </div>
                <div className="desk-day-end">
                  <span>{count} h</span>
                  <span className="desk-day-actions">
                    <button aria-label={`Copy the previous day onto ${d.toLocaleDateString("en-US", { weekday: "long" })}`} onClick={() => onCopyPrevious(key)} title="Copy the previous day" type="button">
                      <Icon name="list" size={13} />
                    </button>
                    {count > 0 && (
                      <button aria-label={`Clear ${d.toLocaleDateString("en-US", { weekday: "long" })}`} onClick={() => onClearDay(key)} title="Clear this day" type="button">
                        <Icon name="close" size={13} />
                      </button>
                    )}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section aria-label="Week totals" className="desk-totals">
        <div className="desk-eyebrows">
          <span>{weekTotal} h outlined this week</span>
          <span>{168 - weekTotal} h open</span>
        </div>
        <div aria-hidden className="desk-total-bar">
          {Object.entries(week)
            .sort((a, b) => b[1] - a[1])
            .map(([id, n]) => (
              <i className={byId(id)?.color} key={id} style={{ flexGrow: n }} />
            ))}
          <i className="open" style={{ flexGrow: Math.max(0, 168 - weekTotal) }} />
        </div>
        <div className="desk-total-cards">
          {tags.map((tag) => (
            <div className={`desk-total ${tag.color}`} key={tag.id}>
              <span>
                <i />
                {tag.name}
              </span>
              <strong>{week[tag.id] || 0} h</strong>
              <small>{weekTotal ? Math.round(((week[tag.id] || 0) * 100) / weekTotal) : 0}% of planned</small>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

/** Wrapped on desktop: this week's planned vs lived, and the last 26 weeks, next to the review. */
export function WrappedSide({
  tags,
  outlines,
  reviews,
  todayKey,
}: {
  tags: Tag[]
  outlines: Record<string, DayOutline>
  reviews: Record<string, DailyReview>
  todayKey: string
}) {
  const known = new Set(tags.map((tag) => tag.id))
  const plannedOf = (key: string) =>
    Object.values(outlines[key]?.hours || {}).filter((id) => id && known.has(id)).length
  /** Planned hours that went to plan: outline hours the review didn't replace. */
  const livedOf = (key: string) => {
    const hours = outlines[key]?.hours || {}
    const changed = reviews[key]?.actualHours || {}
    return Object.entries(hours).filter(([h, id]) => id && known.has(id) && !(h in changed)).length
  }
  const start = mondayOf(todayKey)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const max = Math.max(8, ...days.map(plannedOf))
  let onPlan = 0
  let plannedDone = 0
  days.forEach((key) => {
    if (reviews[key]?.confirmedAt) {
      onPlan += livedOf(key)
      plannedDone += plannedOf(key)
    }
  })
  const confirmed = days.filter((key) => reviews[key]?.confirmedAt).length
  // History: 26 weeks back to this week's Monday.
  const first = addDays(start, -25 * 7)
  const weeks = Array.from({ length: 26 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)))
  const level = (key: string) => {
    if (key > todayKey) return "future"
    const review = reviews[key]
    if (review?.rests?.length) return "rest"
    if (!review?.confirmedAt) return plannedOf(key) ? "planned" : "none"
    const p = plannedOf(key)
    const ratio = p ? livedOf(key) / p : 1
    return ratio >= 0.8 ? "high" : ratio >= 0.5 ? "mid" : "low"
  }
  const months: string[] = []
  weeks.forEach((week, i) => {
    const m = dateOf(week[0]).toLocaleDateString("en-US", { month: "short" })
    const firstWeek = week.some((key) => dateOf(key).getDate() === 1)
    months.push(firstWeek ? dateOf(week.find((key) => dateOf(key).getDate() === 1) || week[0]).toLocaleDateString("en-US", { month: "short" }) : "")
  })
  return (
    <div className="desk-wrapped-side">
      <section aria-labelledby="desk-week-lived" className="desk-card">
        <div className="desk-card-head">
          <h2 id="desk-week-lived">This week</h2>
          <span className="desk-legend">
            <span>
              <i className="wk-planned" /> Planned
            </span>
            <span>
              <i className="wk-lived" /> On plan
            </span>
          </span>
        </div>
        {days.map((key) => {
          const p = plannedOf(key)
          const reviewed = !!reviews[key]?.confirmedAt
          const l = reviewed ? livedOf(key) : 0
          const d = dateOf(key)
          return (
            <div className={`desk-lived-row ${key > todayKey ? "future" : ""}`} key={key}>
              <span>
                {d.toLocaleDateString("en-US", { weekday: "short" })} {d.getDate()}
              </span>
              <div aria-hidden>
                <i className="wk-planned" style={{ width: `${(p / max) * 100}%` }} />
                <i className="wk-lived" style={{ width: `${(l / max) * 100}%` }} />
              </div>
              <small>{reviewed ? `${l}/${p} h` : key === todayKey ? "Today" : key > todayKey ? "—" : p ? "Not reviewed" : "—"}</small>
            </div>
          )
        })}
        <div className="desk-stats">
          <div>
            <strong>{plannedDone ? `${onPlan}/${plannedDone} h` : "—"}</strong>
            <small>On plan, reviewed days</small>
          </div>
          <div>
            <strong>
              {confirmed}/{days.filter((key) => key <= todayKey).length}
            </strong>
            <small>Days reviewed</small>
          </div>
          <div>
            <strong>{days.reduce((sum, key) => sum + plannedOf(key), 0)} h</strong>
            <small>Outlined this week</small>
          </div>
        </div>
      </section>
      <section aria-labelledby="desk-history" className="desk-card">
        <div className="desk-card-head">
          <h2 id="desk-history">Last 26 weeks</h2>
          <span className="desk-legend">
            <span>
              <i className="hv hv-high" /> On plan
            </span>
            <span>
              <i className="hv hv-low" /> Off plan
            </span>
            <span>
              <i className="hv hv-rest" /> Rest
            </span>
          </span>
        </div>
        <div aria-label="Each square is a day, coloured by how closely it went to plan" className="desk-heat" role="img">
          {weeks.map((week) => (
            <div key={week[0]}>
              {week.map((key) => (
                <i className={`hv hv-${level(key)}`} key={key} title={dateOf(key).toDateString()} />
              ))}
            </div>
          ))}
        </div>
        <div aria-hidden className="desk-heat-months">
          {months.map((m, i) => (
            <span key={i}>{m}</span>
          ))}
        </div>
      </section>
    </div>
  )
}
