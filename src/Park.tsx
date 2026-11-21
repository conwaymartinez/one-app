import { FormEvent, useRef, useState } from "react"
import Icon from "./Icon"
import type { Depth, Note, Tag } from "./types"

const LEVELS: { id: Depth; label: string; hint: string }[] = [
  { id: "park", label: "Park", hint: "About a minute · just capture" },
  { id: "outline", label: "Outline", hint: "A few minutes · shape the day" },
  { id: "plan", label: "Plan", hint: "15 minutes or more · tasks on hours" },
]

/**
 * The depth slider: how much planning you have room for right now.
 * One track, one thumb, three stops. Drag the thumb, tap the track or a label,
 * or use the arrow keys; it snaps to the nearest stop when you let go.
 */
export function DepthSlider({
  depth,
  active,
  onChange,
}: {
  depth: Depth
  /** False while another screen (Wrapped) is open: the thumb dims. */
  active: boolean
  onChange: (depth: Depth) => void
}) {
  const index = Math.max(0, LEVELS.findIndex((level) => level.id === depth))
  const rail = useRef<HTMLDivElement>(null)
  // Thumb position while dragging, 0–100 along the track; null when resting.
  const [dragPos, setDragPos] = useState<number | null>(null)
  const pos = dragPos ?? index * 50
  const nearest = Math.round(pos / 50)
  const shown = LEVELS[nearest]

  function posFrom(clientX: number) {
    const box = rail.current?.getBoundingClientRect()
    if (!box || !box.width) return pos
    return Math.min(100, Math.max(0, ((clientX - box.left) / box.width) * 100))
  }
  function go(next: number) {
    const level = LEVELS[Math.min(2, Math.max(0, next))]
    if (level.id !== depth || !active) onChange(level.id)
  }
  return (
    <div className={`depth-slider ${active ? "" : "idle"}`}>
      <div className="depth-control">
        <div
          aria-label="Depth"
          aria-valuemax={2}
          aria-valuemin={0}
          aria-valuenow={nearest}
          aria-valuetext={`${shown.label}: ${shown.hint}`}
          className={`depth-rail ${dragPos !== null ? "dragging" : ""}`}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowDown") go(index - 1)
            else if (e.key === "ArrowRight" || e.key === "ArrowUp") go(index + 1)
            else if (e.key === "Home") go(0)
            else if (e.key === "End") go(2)
            else return
            e.preventDefault()
          }}
          onPointerCancel={() => setDragPos(null)}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.currentTarget.setPointerCapture(e.pointerId)
            setDragPos(posFrom(e.clientX))
          }}
          onPointerMove={(e) => {
            if (dragPos === null) return
            setDragPos(posFrom(e.clientX))
          }}
          onPointerUp={(e) => {
            if (dragPos === null) return
            const end = posFrom(e.clientX)
            setDragPos(null)
            go(Math.round(end / 50))
          }}
          ref={rail}
          role="slider"
          tabIndex={0}
        >
          <span aria-hidden className="depth-line" />
          <span aria-hidden className="depth-fill" style={{ width: `${pos}%` }} />
          {LEVELS.map((level, i) => (
            <span
              aria-hidden
              className={i * 50 <= pos ? "depth-dot on" : "depth-dot"}
              key={level.id}
              style={{ left: `${i * 50}%` }}
            />
          ))}
          <span aria-hidden className="depth-thumb" style={{ left: `${pos}%` }}>
            <i />
          </span>
        </div>
        <div aria-hidden className="depth-labels">
          {LEVELS.map((level, i) => (
            <button
              className={i === nearest ? "on" : ""}
              key={level.id}
              onClick={() => go(i)}
              style={{ left: `${i * 50}%` }}
              tabIndex={-1}
              type="button"
            >
              {level.label}
            </button>
          ))}
        </div>
      </div>
      <span aria-live="polite" className="depth-hint">
        {shown.hint}
      </span>
    </div>
  )
}

/** Park: the lowest depth. One box to get things out of your head. */
export default function Park({
  notes,
  tags,
  focus,
  outlinedHours,
  onAdd,
  onComplete,
  onDelete,
  onOutline,
}: {
  notes: Note[]
  tags: Tag[]
  focus: Tag | undefined
  outlinedHours: number
  onAdd: (text: string) => void
  /** Swipe right: the note is done. */
  onComplete: (id: number) => void
  /** Swipe left or the remove button. */
  onDelete: (id: number) => void
  onOutline: () => void
}) {
  const [text, setText] = useState("")
  function submit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    onAdd(text.trim())
    setText("")
  }
  const byId = (id?: string | null) => tags.find((tag) => tag.id === id)
  return (
    <main className="park">
      <p className="park-today">
        <i className={focus ? focus.color : "open"} />
        {focus
          ? `Today's focus: ${focus.name} · ${outlinedHours} ${outlinedHours === 1 ? "hour" : "hours"} outlined`
          : outlinedHours
            ? `${outlinedHours} ${outlinedHours === 1 ? "hour" : "hours"} outlined today`
            : "Nothing outlined today yet"}
      </p>

      <form className="park-form" onSubmit={submit}>
        <label htmlFor="park-input">What's on your mind?</label>
        <textarea
          id="park-input"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) submit(e)
          }}
          placeholder="Type it and park it. Sort it out later."
          rows={3}
          value={text}
        />
        <button className="park-submit" disabled={!text.trim()} type="submit">
          Park it
        </button>
      </form>

      <section aria-labelledby="parked-title" className="park-list">
        <div className="park-list-head">
          <h2 id="parked-title">Parked · {notes.length}</h2>
          {notes.length > 0 && <span>Swipe → done · ← delete</span>}
        </div>
        {notes.length ? (
          <ul>
            {notes.map((note) => (
              <SwipeNote
                key={note.id}
                note={note}
                onComplete={onComplete}
                onDelete={onDelete}
                project={byId(note.tagId)}
              />
            ))}
          </ul>
        ) : (
          <p className="park-empty">Nothing parked. Your head is clear.</p>
        )}
      </section>

      {notes.length > 0 && (
        <p className="park-next">
          Got a few minutes?{" "}
          <button onClick={onOutline} type="button">
            Slide to Outline
          </button>{" "}
          and your notes will be waiting.
        </p>
      )}
    </main>
  )
}

/** One parked note. Swipe right to mark it done, left to delete. */
function SwipeNote({
  note,
  project,
  onComplete,
  onDelete,
}: {
  note: Note
  project: Tag | undefined
  onComplete: (id: number) => void
  onDelete: (id: number) => void
}) {
  const [dx, setDx] = useState(0)
  const [leaving, setLeaving] = useState<-1 | 0 | 1>(0)
  const swipe = useRef<{ pointerId: number; x0: number; y0: number; on: boolean; width: number } | null>(null)
  const swipedAt = useRef(0)
  const threshold = (width: number) => Math.min(120, width * 0.33)
  const width = swipe.current?.width ?? 0
  const armed = width > 0 && Math.abs(dx) > threshold(width)
  function down(e: React.PointerEvent<HTMLLIElement>) {
    if (leaving || (e.pointerType === "mouse" && e.button !== 0)) return
    swipe.current = {
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      on: false,
      width: e.currentTarget.offsetWidth,
    }
  }
  function move(e: React.PointerEvent<HTMLLIElement>) {
    const s = swipe.current
    if (!s || s.pointerId !== e.pointerId) return
    const mx = e.clientX - s.x0
    const my = e.clientY - s.y0
    if (!s.on) {
      if (Math.abs(mx) < 10 && Math.abs(my) < 10) return
      // Mostly vertical: leave it to scrolling.
      if (Math.abs(my) >= Math.abs(mx)) {
        swipe.current = null
        return
      }
      s.on = true
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {}
    }
    if (Math.abs(mx) > threshold(s.width) !== Math.abs(dx) > threshold(s.width)) navigator.vibrate?.(8)
    setDx(mx)
  }
  function end(e: React.PointerEvent<HTMLLIElement>) {
    const s = swipe.current
    if (!s || s.pointerId !== e.pointerId) return
    swipe.current = null
    if (!s.on) return
    swipedAt.current = Date.now()
    if (e.type === "pointerup" && Math.abs(dx) > threshold(s.width)) {
      const dir = dx < 0 ? -1 : 1
      setLeaving(dir)
      window.setTimeout(() => (dir < 0 ? onDelete(note.id) : onComplete(note.id)), 200)
    } else setDx(0)
  }
  const active = dx !== 0 || leaving !== 0
  const toDelete = dx < 0 || leaving < 0
  return (
    <li
      className={`park-swipe ${active ? "swiping" : ""} ${toDelete ? "to-delete" : "to-done"} ${
        armed || leaving ? "armed" : ""
      }`}
      onClickCapture={(e) => {
        // A swipe shouldn't also tap the button it ended on.
        if (Date.now() - swipedAt.current < 350) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
      onPointerCancel={end}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={end}
    >
      <div aria-hidden className="park-swipe-actions">
        <span className="park-swipe-done">
          <Icon name="check" size={14} /> Done
        </span>
        <span className="park-swipe-delete">Delete</span>
      </div>
      <div
        className="park-swipe-body"
        style={
          active
            ? {
                transform: `translateX(${leaving ? `${leaving * 110}%` : `${dx}px`})`,
                transition: swipe.current?.on ? "none" : "transform .2s ease",
              }
            : undefined
        }
      >
        {project && <i className={project.color} title={project.name} />}
        <span>{note.text}</span>
        <button aria-label={`Remove "${note.text}"`} onClick={() => onDelete(note.id)} type="button">
          <Icon name="close" size={14} />
        </button>
      </div>
    </li>
  )
}

/** Parked notes on the Outline: tap a note, then a project, to sort it. */
export function NotesTray({
  notes,
  tags,
  onAssign,
}: {
  notes: Note[]
  tags: Tag[]
  onAssign: (id: number, tagId: string | null) => void
}) {
  const [picked, setPicked] = useState<number | null>(null)
  if (!notes.length) return null
  const byId = (id?: string | null) => tags.find((tag) => tag.id === id)
  const current = notes.find((note) => note.id === picked)
  return (
    <section aria-labelledby="tray-title" className="notes-tray">
      <div className="section-row">
        <h2 id="tray-title">Parked · {notes.length}</h2>
        <small>{current ? "Pick a project for it" : "Tap a note to sort it"}</small>
      </div>
      <div className="tray-cards">
        {notes.map((note) => {
          const project = byId(note.tagId)
          return (
            <button
              aria-pressed={picked === note.id}
              className={`tray-card ${project ? `sorted ${project.color}` : ""} ${
                picked === note.id ? "picked" : ""
              }`}
              key={note.id}
              onClick={() => setPicked((id) => (id === note.id ? null : note.id))}
              type="button"
            >
              {project && <small>→ {project.name}</small>}
              <span>{note.text}</span>
            </button>
          )
        })}
      </div>
      {current && (
        <div className="tray-pick">
          {tags.map((tag) => (
            <button
              aria-pressed={current.tagId === tag.id}
              className={`tray-project ${tag.color} ${current.tagId === tag.id ? "on" : ""}`}
              key={tag.id}
              onClick={() => {
                onAssign(current.id, current.tagId === tag.id ? null : tag.id)
                setPicked(null)
              }}
              type="button"
            >
              <i />
              {tag.name}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

/** Parked notes in the Planner: give each a project and a length, then pick a time (or drag it onto the calendar). */
export function ParkedToTasks({
  notes,
  tags,
  onMake,
  onDragStart,
  bare = false,
}: {
  notes: Note[]
  tags: Tag[]
  onMake: (id: number, tagId: string | null, duration: number) => void
  /** Long-press (touch) or drag (mouse) a row onto the calendar. */
  onDragStart?: (e: React.PointerEvent, id: number, duration: number, tagId: string | null) => void
  /** No fold-away header: the panel around it already says "Parked". */
  bare?: boolean
}) {
  const [lengths, setLengths] = useState<Record<number, number>>({})
  const [projects, setProjects] = useState<Record<number, string | null>>({})
  const [open, setOpen] = useState(true)
  if (!notes.length)
    return bare ? <p className="parked-empty">Nothing parked. Park a thought above.</p> : null
  // Notes already sorted on the Outline come first.
  const sorted = [...notes].sort((a, b) => Number(!a.tagId) - Number(!b.tagId))
  const LENGTHS = [15, 30, 60, 120]
  const label = (m: number) => (m < 60 ? `${m}m` : `${m / 60}h`)
  return (
    <section className={`${open || bare ? "parked-tasks open" : "parked-tasks"}${bare ? " bare" : ""}`}>
      {!bare && (
      <button
        aria-controls="parked-rows"
        aria-expanded={open}
        className="parked-toggle"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <span>From parked · {notes.length}</span>
        <Icon name={open ? "left" : "right"} size={12} />
      </button>
      )}
      {(open || bare) && (
        <ul className="parked-rows" id="parked-rows">
          {sorted.map((note) => {
            const tagId = note.id in projects ? projects[note.id] : note.tagId ?? null
            const project = tags.find((tag) => tag.id === tagId)
            const length = lengths[note.id] || 30
            return (
              <li
                className={`parked-row${onDragStart ? " draggable" : ""}`}
                key={note.id}
                onPointerDown={onDragStart && ((e) => onDragStart(e, note.id, length, tagId))}
              >
                <button
                  aria-label={`Project: ${project?.name || "none"}. Tap for the next project.`}
                  className={`parked-dot ${project?.color || "none"}`}
                  onClick={() => {
                    const index = tags.findIndex((tag) => tag.id === tagId)
                    const next = tags[(index + 1) % (tags.length || 1)]
                    setProjects((all) => ({ ...all, [note.id]: next?.id ?? null }))
                  }}
                  title={project?.name || "Pick a project"}
                  type="button"
                >
                  <i />
                </button>
                <span className="parked-text" title={note.text}>
                  {note.text}
                </span>
                <button
                  aria-label={`Length ${label(length)}. Tap to change.`}
                  className="parked-len"
                  onClick={() =>
                    setLengths((all) => ({
                      ...all,
                      [note.id]: LENGTHS[(LENGTHS.indexOf(length) + 1) % LENGTHS.length],
                    }))
                  }
                  type="button"
                >
                  {label(length)}
                </button>
                <button
                  aria-label={`Make "${note.text}" a task`}
                  className="parked-make"
                  onClick={() => onMake(note.id, tagId, length)}
                  type="button"
                >
                  <Icon name="plus" size={14} />
                  Task
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** Wrapped at Park depth: the whole review is one question. */
export function QuickWrap({
  dayLabel,
  parkedCount,
  onToPlan,
  onChanged,
  onSkip,
  onReviewNotes,
}: {
  dayLabel: string
  parkedCount: number
  onToPlan: () => void
  onChanged: () => void
  onSkip: () => void
  onReviewNotes: () => void
}) {
  const [kept, setKept] = useState(false)
  return (
    <main className="quick-wrap">
      <div aria-hidden className="quick-wrap-bar" />
      <div className="quick-wrap-body">
        <small>One question today</small>
        <h1>How did {dayLabel} go?</h1>
        <button className="quick-wrap-answer main" onClick={onToPlan} type="button">
          Pretty much to plan
        </button>
        <button className="quick-wrap-answer" onClick={onChanged} type="button">
          Some things changed
        </button>
        <button className="quick-wrap-answer" onClick={onSkip} type="button">
          Rough day, skip it
        </button>
        {parkedCount > 0 && !kept && (
          <div className="quick-wrap-notes">
            <p>
              {parkedCount} {parkedCount === 1 ? "note is" : "notes are"} still parked.
            </p>
            <span className="quick-wrap-note-actions">
              <button onClick={() => setKept(true)} type="button">
                Keep for tomorrow
              </button>
              <button onClick={onReviewNotes} type="button">
                Review them
              </button>
            </span>
          </div>
        )}
        {parkedCount > 0 && kept && (
          <p className="quick-wrap-kept">Kept. Your notes will be waiting tomorrow.</p>
        )}
        <p className="quick-wrap-foot">
          On Plan depth, this becomes the full block-by-block review.
        </p>
      </div>
    </main>
  )
}
