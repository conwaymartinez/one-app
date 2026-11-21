import { FormEvent, useRef, useState } from "react"
import Icon from "./Icon"
import type { Depth, Note, Tag } from "./types"

/** The depth slider: how much planning you have room for right now. */
export function DepthSlider({
  depth,
  active,
  onChange,
}: {
  depth: Depth
  /** False while another screen (Wrapped) is open: no level is highlighted. */
  active: boolean
  onChange: (depth: Depth) => void
}) {
  const levels: { id: Depth; label: string; hint: string }[] = [
    { id: "park", label: "Park", hint: "About a minute: just capture" },
    { id: "outline", label: "Outline", hint: "A few minutes: shape the day" },
    { id: "plan", label: "Plan", hint: "15 minutes or more: tasks on hours" },
  ]
  return (
    <nav aria-label="Depth" className="depth-slider">
      <div className="depth-track">
        {levels.map((level) => (
          <button
            aria-current={active && depth === level.id ? "page" : undefined}
            className={active && depth === level.id ? "depth-stop on" : "depth-stop"}
            key={level.id}
            onClick={() => onChange(level.id)}
            title={level.hint}
            type="button"
          >
            {level.label}
          </button>
        ))}
      </div>
    </nav>
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

/** Parked notes in the Planner: give each a project and a length, then make it a task. */
export function ParkedToTasks({
  notes,
  tags,
  onMake,
}: {
  notes: Note[]
  tags: Tag[]
  onMake: (id: number, tagId: string | null, duration: number) => void
}) {
  const [lengths, setLengths] = useState<Record<number, number>>({})
  const [projects, setProjects] = useState<Record<number, string | null>>({})
  if (!notes.length) return null
  // Notes already sorted on the Outline come first.
  const sorted = [...notes].sort((a, b) => Number(!a.tagId) - Number(!b.tagId))
  return (
    <section aria-labelledby="parked-tasks-title" className="parked-tasks">
      <h3 id="parked-tasks-title">From parked · {notes.length}</h3>
      {sorted.map((note) => {
        const tagId = note.id in projects ? projects[note.id] : note.tagId ?? null
        const project = tags.find((tag) => tag.id === tagId)
        const length = lengths[note.id] || 30
        return (
          <div className="parked-task" key={note.id}>
            <span className="parked-text">{note.text}</span>
            <div className="parked-controls">
              <button
                aria-label={`Project: ${project?.name || "none"}. Tap for the next project.`}
                className={`quick-tag ${project?.color || "untagged"}`}
                onClick={() => {
                  const index = tags.findIndex((tag) => tag.id === tagId)
                  const next = tags[(index + 1) % (tags.length || 1)]
                  setProjects((all) => ({ ...all, [note.id]: next?.id ?? null }))
                }}
                type="button"
              >
                {project?.name || "Project"}
              </button>
              {[15, 30, 60, 120].map((m) => (
                <button
                  aria-pressed={length === m}
                  className={length === m ? "parked-len on" : "parked-len"}
                  key={m}
                  onClick={() => setLengths((all) => ({ ...all, [note.id]: m }))}
                  type="button"
                >
                  {m < 60 ? `${m}m` : `${m / 60}h`}
                </button>
              ))}
              <button
                className="parked-make"
                onClick={() => onMake(note.id, tagId, length)}
                type="button"
              >
                Make task
              </button>
            </div>
          </div>
        )
      })}
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
        {parkedCount > 0 && (
          <div className="quick-wrap-notes">
            <p>
              {parkedCount} {parkedCount === 1 ? "note is" : "notes are"} still parked.
              They'll wait for tomorrow.
            </p>
            <button onClick={onReviewNotes} type="button">
              Review them
            </button>
          </div>
        )}
        <p className="quick-wrap-foot">
          On Plan depth, this becomes the full block-by-block review.
        </p>
      </div>
    </main>
  )
}
