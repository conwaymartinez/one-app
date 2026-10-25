import { useEffect, useMemo, useRef, useState } from "react"
import Icon from "./Icon"
import type { Color, DailyReview, DayOutline, Tag, Task } from "./types"

// Wrapped: 1) review the day (plan vs. what happened), 2) a story of the day.

const LIFE = [
  { id: "life:sick", name: "Sick", cls: "sick" },
  { id: "life:commute", name: "Commute", cls: "commute" },
  { id: "life:interrupted", name: "Interrupted", cls: "interrupted" },
] as const
/** Brush that puts an hour back to what the outline planned. */
const AS_PLANNED = "__as-planned"
const allHours = Array.from({ length: 24 }, (_, i) => i)
const emptyOutline: DayOutline = { focus: null, hours: {} }
const emptyReview: DailyReview = { rests: [] }

function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}
function dateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number)
  return new Date(year, month - 1, day)
}
function shiftDate(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}
function shiftKey(key: string, days: number) {
  return localDateKey(shiftDate(dateFromKey(key), days))
}
function hourLabel(hour: number) {
  const h = hour % 24
  if (h === 0) return "12 AM"
  if (h === 12) return "12 PM"
  return `${h % 12} ${h < 12 ? "AM" : "PM"}`
}
function shortHour(hour: number) {
  const n = hour % 12 === 0 ? 12 : hour % 12
  return `${n}${hour < 12 ? "a" : "p"}`
}
function hoursText(n: number) {
  return `${n}h`
}

type Props = {
  tags: Tag[]
  tasks: Task[]
  outlines: Record<string, DayOutline>
  reviews: Record<string, DailyReview>
  todayKey: string
  updateReview: (
    dateKey: string,
    update: (review: DailyReview) => DailyReview,
  ) => void
  setTaskDone: (id: number, done: boolean, dateKey: string) => void
  onFinish: () => void
  toast: (text: string) => void
}

/** Everything the review and story need about one day. */
function useDay(
  dateKey: string,
  { tags, tasks, outlines, reviews }: Pick<Props, "tags" | "tasks" | "outlines" | "reviews">,
) {
  return useMemo(() => {
    const tagById = new Map(tags.map((tag) => [tag.id, tag]))
    const outline = outlines[dateKey] || emptyOutline
    const review = reviews[dateKey] || emptyReview
    const valid = (id?: string | null) =>
      !!id && (tagById.has(id) || LIFE.some((life) => life.id === id))
    const planned = (h: number) =>
      tagById.has(outline.hours[h]) ? outline.hours[h] : null
    const actual = (h: number) => {
      const override = review.actualHours?.[h]
      return valid(override) ? override! : planned(h)
    }
    const plannedHours = allHours.filter((h) => planned(h))
    const onPlan = plannedHours.filter((h) => actual(h) === planned(h)).length
    const life = LIFE.map((item) => ({
      ...item,
      hours: allHours.filter((h) => actual(h) === item.id).length,
    })).filter((item) => item.hours)
    const lifeTotal = life.reduce((sum, item) => sum + item.hours, 0)
    const projectHours = allHours.filter((h) => tagById.has(actual(h) || "")).length
    const extra = allHours.filter(
      (h) => !planned(h) && tagById.has(actual(h) || ""),
    ).length
    const dayTasks = tasks
      .filter(
        (t) =>
          (t.hour !== undefined && t.date === dateKey) ||
          (t.completedAt && localDateKey(new Date(t.completedAt)) === dateKey),
      )
      .sort((a, b) =>
        (a.date === dateKey ? (a.hour ?? 99) : 99) -
          (b.date === dateKey ? (b.hour ?? 99) : 99) || a.id - b.id,
      )
    const done = dayTasks.filter((t) => t.completed)
    const minutes = done.reduce((sum, t) => sum + t.duration, 0)
    const biggest = [...done].sort((a, b) => b.duration - a.duration)[0]
    const focus = outline.focus ? tagById.get(outline.focus) : undefined
    // Theme: the focus project, else the project with the most hours.
    const counts = new Map<string, number>()
    for (const h of allHours) {
      const id = actual(h)
      if (id && tagById.has(id)) counts.set(id, (counts.get(id) || 0) + 1)
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    const themeTag = focus || (top ? tagById.get(top) : undefined)
    // Planned runs for the brief, e.g. 9–12 Deep work.
    const runs: { start: number; end: number; tag: Tag }[] = []
    for (const h of plannedHours) {
      const last = runs[runs.length - 1]
      if (last && last.end === h && last.tag.id === planned(h)) last.end = h + 1
      else runs.push({ start: h, end: h + 1, tag: tagById.get(planned(h)!)! })
    }
    const hasAnything =
      !!outline.focus || plannedHours.length > 0 || dayTasks.length > 0
    return {
      tagById, outline, review, planned, actual, plannedHours, onPlan, life,
      lifeTotal, projectHours, extra, dayTasks, done, minutes,
      biggest, focus, theme: (themeTag?.color || "sage") as Color, runs,
      hasAnything,
    }
  }, [dateKey, tags, tasks, outlines, reviews])
}

export default function Wrapped(props: Props) {
  const { reviews, todayKey } = props
  const yesterdayKey = shiftKey(todayKey, -1)
  const yesterday = useDay(yesterdayKey, props)
  const yesterdayPending =
    !reviews[yesterdayKey]?.confirmedAt && yesterday.hasAnything
  const [dateKey, setDateKey] = useState(() =>
    yesterdayPending ? yesterdayKey : todayKey,
  )
  const [mode, setMode] = useState<"review" | "story">(() =>
    reviews[yesterdayPending ? yesterdayKey : todayKey]?.confirmedAt
      ? "story"
      : "review",
  )
  const [storyRun, setStoryRun] = useState(0)
  const day = useDay(dateKey, props)
  const showDayToggle = yesterdayPending || dateKey === yesterdayKey

  function pickDay(key: string) {
    setDateKey(key)
    setMode(reviews[key]?.confirmedAt ? "story" : "review")
    setStoryRun((run) => run + 1)
  }
  function confirm() {
    props.updateReview(dateKey, (review) => ({
      ...review,
      confirmedAt: new Date().toISOString(),
    }))
    setStoryRun((run) => run + 1)
    setMode("story")
  }

  const dayToggle = showDayToggle && (
    <div className="day-toggle" role="tablist">
      {[yesterdayKey, todayKey].map((key) => (
        <button
          aria-selected={dateKey === key}
          className={dateKey === key ? "active" : ""}
          key={key}
          onClick={() => pickDay(key)}
          role="tab"
          type="button"
        >
          {key === todayKey ? "Today" : "Yesterday"}
          {key === yesterdayKey && yesterdayPending && <i aria-label="Not reviewed" />}
        </button>
      ))}
    </div>
  )

  if (mode === "review")
    return (
      <DayReview
        {...props}
        confirm={confirm}
        dateKey={dateKey}
        day={day}
        dayToggle={dayToggle}
        isToday={dateKey === todayKey}
      />
    )
  return (
    <DayStory
      {...props}
      dateKey={dateKey}
      day={day}
      edit={() => setMode("review")}
      key={`${dateKey}-${storyRun}`}
      nextDay={
        dateKey === yesterdayKey && !reviews[todayKey]?.confirmedAt
          ? () => pickDay(todayKey)
          : undefined
      }
      replay={() => setStoryRun((run) => run + 1)}
    />
  )
}

type Day = ReturnType<typeof useDay>

/* ── Screen 1: the review ─────────────────────────────────────────────── */

function DayReview({
  dateKey,
  day,
  dayToggle,
  isToday,
  confirm,
  tags,
  updateReview,
  setTaskDone,
  toast,
}: Props & {
  dateKey: string
  day: Day
  dayToggle: React.ReactNode
  isToday: boolean
  confirm: () => void
}) {
  const [tool, setTool] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const brush = useRef<{ pointerId: number; last: number } | null>(null)
  const { review, planned, actual, tagById } = day
  const label = dateFromKey(dateKey).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
  const changedCount = Object.keys(review.actualHours || {}).length

  function paint(h: number) {
    if (!tool) return
    updateReview(dateKey, (r) => {
      const hours = { ...(r.actualHours || {}) }
      const plan = planned(h)
      if (tool === AS_PLANNED || tool === plan) delete hours[h]
      else hours[h] = tool
      const next = { ...r, actualHours: hours }
      if (!Object.keys(hours).length) delete next.actualHours
      return next
    })
  }
  function hourAt(x: number, y: number) {
    const hour = document
      .elementFromPoint(x, y)
      ?.closest("[data-hour]")
      ?.getAttribute("data-hour")
    return hour == null ? null : Number(hour)
  }
  function brushDown(e: React.PointerEvent<HTMLDivElement>) {
    const h = hourAt(e.clientX, e.clientY)
    if (h === null) return
    if (!tool) {
      toast("Pick a label first, then tap hours")
      return
    }
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {}
    brush.current = { pointerId: e.pointerId, last: h }
    paint(h)
  }
  function brushMove(e: React.PointerEvent<HTMLDivElement>) {
    const b = brush.current
    if (!b || b.pointerId !== e.pointerId) return
    const h = hourAt(e.clientX, e.clientY)
    if (h === null || h === b.last) return
    b.last = h
    paint(h)
  }
  function brushEnd(e: React.PointerEvent<HTMLDivElement>) {
    // The last move can arrive with the lift, so paint where the finger ended.
    if (e.type === "pointerup") brushMove(e)
    brush.current = null
  }

  function cellLabel(h: number) {
    const plan = planned(h)
    const now = actual(h)
    const name = (id: string | null) =>
      !id
        ? "nothing"
        : tagById.get(id)?.name || LIFE.find((l) => l.id === id)?.name || "nothing"
    return plan === now
      ? `${hourLabel(h)}: ${plan ? `${name(plan)}, as planned` : "not planned"}`
      : `${hourLabel(h)}: planned ${name(plan)}, actually ${name(now)}`
  }
  function cellClass(id: string | null) {
    if (!id) return "empty"
    const life = LIFE.find((l) => l.id === id)
    return life ? `life ${life.cls}` : tagById.get(id)?.color || "empty"
  }

  const brushes = [
    ...tags.map((tag) => ({ id: tag.id, name: tag.name, cls: tag.color })),
    ...LIFE.map((l) => ({ id: l.id, name: l.name, cls: `life ${l.cls}` })),
  ]

  return (
    <main className="review">
      <div className="review-inner">
        <header className="review-head">
          {dayToggle}
          <small>Daily review</small>
          <h1>{label}</h1>
          <p>Planned vs. what actually happened. Fix anything that changed, then confirm your day.</p>
        </header>

        <section className="review-card">
          <div className="review-section-head">
            <small>The brief</small>
            <strong>What you planned</strong>
          </div>
          <div className="brief-focus">
            <span>Focus</span>
            {day.focus ? (
              <b className={`tag-chip ${day.focus.color}`}>{day.focus.name}</b>
            ) : (
              <em>No focus set</em>
            )}
          </div>
          {day.runs.length ? (
            <ul className="brief-runs">
              {day.runs.map((run) => (
                <li key={run.start}>
                  <span className="mono">
                    {hourLabel(run.start)} – {hourLabel(run.end)}
                  </span>
                  <b className={`tag-chip ${run.tag.color}`}>{run.tag.name}</b>
                  <em className="mono">{hoursText(run.end - run.start)}</em>
                </li>
              ))}
            </ul>
          ) : (
            <p className="review-empty">
              No hours outlined for this day. You can still log what happened below.
            </p>
          )}
        </section>

        <section className="review-card">
          <div className="review-section-head">
            <small>Hours</small>
            <strong>What actually happened</strong>
          </div>
          <p className="review-hint">
            Pick a label, then tap or drag across hours. A corner mark shows what you planned.
          </p>
          <div className="brush-row" role="radiogroup" aria-label="Label to paint">
            {brushes.map((b) => (
              <button
                aria-checked={tool === b.id}
                className={`brush ${tool === b.id ? "active" : ""}`}
                key={b.id}
                onClick={() => setTool(tool === b.id ? null : b.id)}
                role="radio"
                type="button"
              >
                <i className={`swatch ${b.cls}`} />
                {b.name}
              </button>
            ))}
            <button
              aria-checked={tool === AS_PLANNED}
              className={`brush ${tool === AS_PLANNED ? "active" : ""}`}
              onClick={() => setTool(tool === AS_PLANNED ? null : AS_PLANNED)}
              role="radio"
              type="button"
            >
              <Icon name="eraser" size={14} />
              As planned
            </button>
          </div>
          <div
            className={`hour-grid ${tool ? "armed" : ""}`}
            onPointerCancel={brushEnd}
            onPointerDown={brushDown}
            onPointerMove={brushMove}
            onPointerUp={brushEnd}
          >
            {allHours.map((h) => {
              const plan = planned(h)
              const now = actual(h)
              const changed = plan !== now
              return (
                <button
                  aria-label={cellLabel(h)}
                  className={`hour-cell ${cellClass(now)} ${changed ? "changed" : ""}`}
                  data-hour={h}
                  key={h}
                  type="button"
                >
                  <small>{shortHour(h)}</small>
                  {changed && plan && (
                    <i className={`was ${tagById.get(plan)?.color || ""}`} />
                  )}
                  {changed && !plan && <i className="was added" />}
                </button>
              )
            })}
          </div>
          <div className="hour-summary">
            <span>
              <b>{day.onPlan}/{day.plannedHours.length}h</b> on plan
            </span>
            {day.life.map((l) => (
              <span key={l.id}>
                <i className={`swatch life ${l.cls}`} />
                <b>{hoursText(l.hours)}</b> {l.name.toLowerCase()}
              </span>
            ))}
            {day.extra > 0 && (
              <span>
                <b>+{hoursText(day.extra)}</b> unplanned work
              </span>
            )}
            {changedCount > 0 && (
              <button
                className={`reset-hours ${confirmReset ? "danger" : ""}`}
                onBlur={() => setConfirmReset(false)}
                onClick={() => {
                  if (!confirmReset) return setConfirmReset(true)
                  updateReview(dateKey, (r) => {
                    const next = { ...r }
                    delete next.actualHours
                    return next
                  })
                  setConfirmReset(false)
                }}
                type="button"
              >
                {confirmReset ? "Tap again to reset" : "Reset to plan"}
              </button>
            )}
          </div>
        </section>

        <section className="review-card">
          <div className="review-section-head">
            <small>Tasks</small>
            <strong>What got done</strong>
            <span className="mono">
              {day.done.length}/{day.dayTasks.length}
            </span>
          </div>
          {day.dayTasks.length ? (
            <ul className="review-tasks">
              {day.dayTasks.map((t) => {
                const tag = t.tagId ? tagById.get(t.tagId) : undefined
                return (
                  <li className={t.completed ? "done" : ""} key={t.id}>
                    <button
                      aria-label={`${t.title}: ${t.completed ? "done" : "not done"}`}
                      aria-pressed={t.completed}
                      className="review-check"
                      onClick={() => setTaskDone(t.id, !t.completed, dateKey)}
                      type="button"
                    >
                      {t.completed && <Icon name="check" size={14} />}
                    </button>
                    <div>
                      <strong>{t.title}</strong>
                      <span>
                        {tag && <b className={`tag-chip ${tag.color}`}>{tag.name}</b>}
                        <em className="mono">
                          {t.hour !== undefined && t.date === dateKey
                            ? hourLabel(t.hour)
                            : "Unscheduled"}{" "}
                          · {t.duration} min
                        </em>
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="review-empty">No tasks were scheduled or finished this day.</p>
          )}
        </section>

        <section className="review-card">
          <div className="review-section-head">
            <small>Note</small>
            <strong>One line about {isToday ? "today" : "the day"}</strong>
          </div>
          <textarea
            aria-label="Note for the day"
            className="review-note"
            onChange={(e) => {
              const value = e.target.value
              updateReview(dateKey, (r) => ({ ...r, dayNote: value }))
            }}
            placeholder="What stood out? What would you change tomorrow?"
            rows={3}
            value={review.dayNote || ""}
          />
        </section>
      </div>
      <div className="confirm-bar">
        <button className="confirm-day" onClick={confirm} type="button">
          {review.confirmedAt ? "Update & replay my day" : "Confirm my day"}
          <Icon name="sparkle" size={16} />
        </button>
      </div>
    </main>
  )
}

/* ── Screen 2: the story ──────────────────────────────────────────────── */

type CardId = "intro" | "plan" | "win" | "tasks" | "life" | "rhythm"

const moods: Record<Color, string> = {
  lavender: "Dreamy",
  blue: "Electric",
  peach: "Golden hour",
  sage: "Grounded",
}

function CountUp({ value, delay = 0 }: { value: number; delay?: number }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    let frame = 0
    const begin = performance.now() + delay
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - begin) / 1200))
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))))
      if (p < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, delay])
  return <>{shown}</>
}

const d = (n: number) => ({ "--d": n }) as React.CSSProperties

function Letters({ text }: { text: string }) {
  return (
    <h1 aria-label={text} className="wrap-title">
      {/* Letters pop in one by one; words never break in the middle. */}
      {text.split(" ").map((word, w, words) => {
        const offset = words.slice(0, w).join(" ").length + (w ? 1 : 0)
        return (
          <span aria-hidden className="wrap-word" key={w}>
            {word.split("").map((char, i) => (
              <span key={i} style={{ "--i": offset + i } as React.CSSProperties}>
                {char}
              </span>
            ))}
            {w < words.length - 1 && " "}
          </span>
        )
      })}
    </h1>
  )
}

/** Two-ring day clock: inner ring 12 AM–12 PM, outer ring 12 PM–12 AM. */
function MiniRings({
  label,
  owner,
  tagById,
  delay = 0,
}: {
  label: string
  owner: (h: number) => string | null
  tagById: Map<string, Tag>
  delay?: number
}) {
  const C = 100
  const rings = [
    { r0: 46, r1: 66 },
    { r0: 70, r1: 94 },
  ]
  const polar = (r: number, deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180
    return [C + r * Math.cos(a), C + r * Math.sin(a)]
  }
  const sector = (r0: number, r1: number, a0: number, a1: number) => {
    const [x0, y0] = polar(r1, a0)
    const [x1, y1] = polar(r1, a1)
    const [x2, y2] = polar(r0, a1)
    const [x3, y3] = polar(r0, a0)
    return `M${x0} ${y0}A${r1} ${r1} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 0 0 ${x3} ${y3}Z`
  }
  return (
    <figure className="mini-rings">
      <svg aria-hidden viewBox="0 0 200 200">
        {allHours.map((h) => {
          const ring = rings[h < 12 ? 0 : 1]
          const a0 = (h % 12) * 30 + 1.5
          const id = owner(h)
          const life = LIFE.find((l) => l.id === id)
          const cls = !id ? "open" : life ? `life ${life.cls}` : tagById.get(id)?.color || "open"
          return (
            <path
              className={`ring-seg ${cls}`}
              d={sector(ring.r0, ring.r1, a0, a0 + 27)}
              key={h}
              style={{ "--h": h, "--rd": `${delay}ms` } as React.CSSProperties}
            />
          )
        })}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  )
}

function DayStory({
  dateKey,
  day,
  edit,
  replay,
  nextDay,
  onFinish,
  tags,
  tasks,
  reviews,
  updateReview,
}: Props & {
  dateKey: string
  day: Day
  edit: () => void
  replay: () => void
  nextDay?: () => void
}) {
  const [index, setIndex] = useState(0)
  const [holding, setHolding] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const gesture = useRef<{ x: number; y: number; t: number } | null>(null)
  const weekday = dateFromKey(dateKey).toLocaleDateString("en-US", { weekday: "long" })
  const dateLabel = dateFromKey(dateKey).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
  const completionDays = useMemo(
    () =>
      new Set(
        tasks
          .filter((t) => t.completed && t.completedAt)
          .map((t) => localDateKey(new Date(t.completedAt!))),
      ),
    [tasks],
  )
  // Rhythm: consecutive days that were reviewed, had a task done, or rested.
  let streak = 0
  for (let key = dateKey, i = 0; i < 3660; i++, key = shiftKey(key, -1)) {
    const r = reviews[key]
    if (r?.confirmedAt || completionDays.has(key) || r?.rests.length) streak++
    else break
  }
  const cards: CardId[] = [
    "intro",
    "plan",
    ...(day.biggest ? (["win"] as const) : []),
    "tasks",
    ...(day.lifeTotal ? (["life"] as const) : []),
    "rhythm",
  ]
  const card = cards[Math.min(index, cards.length - 1)]
  const last = index >= cards.length - 1
  const paused = holding || sheetOpen
  const next = () => setIndex((i) => Math.min(cards.length - 1, i + 1))
  const prev = () => setIndex((i) => Math.max(0, i - 1))
  const stop = {
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onPointerUp: (e: React.PointerEvent) => e.stopPropagation(),
  }
  const doneTitles = day.done.slice(0, 4)
  const lifeLine = day.life.some((l) => l.id === "life:sick")
    ? "Rest is part of the plan."
    : day.life.some((l) => l.id === "life:commute")
      ? "Time in motion still counts."
      : "You rolled with it."

  return (
    <main className={`wrapped day-story ${day.theme}`}>
      <div className="wrapped-glow" />
      <header className="story-top">
        <div className="story-segments">
          {cards.map((id, i) => (
            <span className={i < index ? "done" : ""} key={id}>
              {i === index && (
                <i
                  key={`${id}-${index}`}
                  onAnimationEnd={() => !last && next()}
                  style={{ animationPlayState: paused ? "paused" : "running" }}
                />
              )}
            </span>
          ))}
        </div>
        <div className="story-meta">
          <span className="story-avatar">1</span>
          <strong>Your {weekday}</strong>
          <small>{dateLabel}</small>
          {holding && <em>Paused</em>}
        </div>
      </header>

      <section
        className="story-stage"
        key={card}
        onPointerCancel={() => setHolding(false)}
        onPointerDown={(e) => {
          gesture.current = { x: e.clientX, y: e.clientY, t: Date.now() }
          setHolding(true)
        }}
        onPointerUp={(e) => {
          setHolding(false)
          const start = gesture.current
          gesture.current = null
          if (!start) return
          const dy = e.clientY - start.y
          const dx = e.clientX - start.x
          if (dy < -50) return setSheetOpen(true)
          if (Math.abs(dx) > 60) return dx < 0 ? next() : prev()
          if (Date.now() - start.t > 280) return
          const rect = e.currentTarget.getBoundingClientRect()
          if (e.clientX - rect.left < rect.width / 3) prev()
          else next()
        }}
      >
        <div aria-hidden className="story-deco">
          <span /><span /><span />
        </div>

        <div className={`story-card card-${card}`}>
          {card === "intro" && (
            <>
              <small className="wrap-kicker" style={d(0)}>
                Your {weekday}, wrapped
              </small>
              <Letters text={day.focus?.name || weekday} />
              <p className="story-sub" style={d(3)}>
                {day.focus
                  ? "was the focus. Here’s how it went."
                  : "No focus set. Here’s what happened anyway."}
              </p>
            </>
          )}

          {card === "plan" && (
            <>
              <small className="wrap-kicker" style={d(0)}>
                Planned vs. lived
              </small>
              <div className="rings-pair" style={d(1)}>
                <MiniRings label="Planned" owner={day.planned} tagById={day.tagById} />
                <MiniRings
                  delay={500}
                  label="Lived"
                  owner={day.actual}
                  tagById={day.tagById}
                />
              </div>
              {day.plannedHours.length ? (
                <p className="wrap-hero" style={d(3)}>
                  <b>
                    <CountUp delay={900} value={day.onPlan} />
                    <small>/{day.plannedHours.length}</small>
                  </b>
                  <span>
                    hours went
                    <br />
                    to plan
                  </span>
                </p>
              ) : (
                <p className="wrap-hero quiet" style={d(3)}>
                  <b>You freestyled it.</b>
                  <span>No outline today, {day.projectHours}h logged on projects.</span>
                </p>
              )}
              {day.extra > 0 && (
                <p className="story-sub small" style={d(4)}>
                  +{day.extra}h you didn’t even plan for
                </p>
              )}
            </>
          )}

          {card === "win" && day.biggest && (
            <>
              <small className="wrap-kicker" style={d(0)}>
                And the biggest win goes to
              </small>
              <div className="win-card" style={d(1)}>
                <svg className="win-badge" viewBox="0 0 100 100">
                  <defs>
                    <path
                      d="M50,50 m-37,0 a37,37 0 1,1 74,0 a37,37 0 1,1 -74,0"
                      id="win-circle"
                    />
                  </defs>
                  <text>
                    <textPath href="#win-circle">BIGGEST WIN ★ BIGGEST WIN ★</textPath>
                  </text>
                </svg>
                <span className="win-star">★</span>
                <small>Biggest win</small>
                <strong>{day.biggest.title}</strong>
                <em>
                  {day.biggest.duration} min
                  {day.biggest.tagId && day.tagById.get(day.biggest.tagId)
                    ? ` · ${day.tagById.get(day.biggest.tagId)!.name}`
                    : ""}
                </em>
              </div>
            </>
          )}

          {card === "tasks" && (
            <>
              <small className="wrap-kicker" style={d(0)}>
                The checklist
              </small>
              {day.done.length ? (
                <>
                  <p className="wrap-hero" style={d(1)}>
                    <b>
                      <CountUp delay={400} value={day.done.length} />
                    </b>
                    <span>
                      {day.done.length === 1 ? "task" : "tasks"}
                      <br />
                      done
                    </span>
                  </p>
                  <ul className="story-done">
                    {doneTitles.map((t, i) => (
                      <li key={t.id} style={d(2 + i)}>
                        <span>
                          <Icon name="check" size={14} />
                        </span>
                        {t.title}
                      </li>
                    ))}
                    {day.done.length > doneTitles.length && (
                      <li className="more" style={d(2 + doneTitles.length)}>
                        +{day.done.length - doneTitles.length} more
                      </li>
                    )}
                  </ul>
                  <div className="wrap-stats" style={d(6)}>
                    <p>
                      <b>
                        <CountUp delay={1600} value={day.minutes} />
                      </b>
                      <span>minutes invested</span>
                    </p>
                    {day.dayTasks.length > day.done.length && (
                      <p>
                        <b>{day.dayTasks.length - day.done.length}</b>
                        <span>still open</span>
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p className="wrap-hero quiet" style={d(1)}>
                  <b>Nothing checked off.</b>
                  <span>Some days are for showing up. That counts too.</span>
                </p>
              )}
            </>
          )}

          {card === "life" && (
            <>
              <small className="wrap-kicker" style={d(0)}>
                Plot twist
              </small>
              <Letters text="Life happened." />
              <div className="life-chips">
                {day.life.map((l, i) => (
                  <span className={`life-chip ${l.cls}`} key={l.id} style={d(3 + i)}>
                    <b>
                      <CountUp delay={900 + i * 250} value={l.hours} />h
                    </b>
                    {l.name.toLowerCase()}
                  </span>
                ))}
              </div>
              <p className="story-sub" style={d(5)}>
                {lifeLine}
                {day.projectHours > 0 &&
                  ` You still gave ${day.projectHours}h to your projects.`}
              </p>
            </>
          )}

          {card === "rhythm" && (
            <>
              <small className="wrap-kicker" style={d(0)}>
                Keep the rhythm
              </small>
              <p className="wrap-hero" style={d(1)}>
                <b>
                  <CountUp delay={400} value={streak} />
                </b>
                <span>
                  {streak === 1 ? "day" : "days"}
                  <br />
                  in rhythm
                </span>
              </p>
              {day.review.dayNote?.trim() && (
                <blockquote className="story-note" style={d(2)}>
                  “{day.review.dayNote.trim()}”
                </blockquote>
              )}
              <div className="story-actions" style={d(3)} {...stop}>
                {nextDay ? (
                  <button className="primary" onClick={nextDay} type="button">
                    Now wrap today
                    <Icon name="right" size={15} />
                  </button>
                ) : (
                  <button className="primary" onClick={onFinish} type="button">
                    Done for the day
                    <Icon name="check" size={15} />
                  </button>
                )}
                <button onClick={replay} type="button">
                  Replay
                </button>
                <button onClick={edit} type="button">
                  Edit review
                </button>
                <button onClick={() => setSheetOpen(true)} type="button">
                  History
                </button>
              </div>
            </>
          )}
        </div>

        <div aria-hidden className="wrap-marquee">
          <div>
            {Array.from({ length: 2 }, (_, copy) => (
              <span key={copy}>
                {[0, 1, 2].map((n) => (
                  <span key={n}>
                    {day.focus?.name || weekday} <i>✦</i>{" "}
                    {day.plannedHours.length
                      ? `${day.onPlan}/${day.plannedHours.length} on plan`
                      : "freestyle"}{" "}
                    <i>✦</i> {day.done.length} done <i>✦</i> {moods[day.theme]}{" "}
                    <i>✦</i>{" "}
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      </section>

      <HistorySheet
        close={() => setSheetOpen(false)}
        defaultTagId={day.focus?.id || tags[0]?.id || ""}
        open={sheetOpen}
        reviews={reviews}
        tags={tags}
        tasks={tasks}
        todayKey={dateKey}
        updateReview={updateReview}
      />
    </main>
  )
}

/* ── History sheet (was the old details sheet) ─────────────────────────── */

function HabitDay({
  count,
  date,
  isRest,
  selected,
  onSelect,
  compact = false,
}: {
  count: number
  date: Date
  isRest: boolean
  selected: boolean
  onSelect: () => void
  compact?: boolean
}) {
  const label = date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
  const state = count
    ? `${count} completed`
    : isRest
      ? "rest day"
      : "no activity"
  return (
    <button
      aria-label={`${label}: ${state}`}
      className={`habit-day intensity-${Math.min(count, 4)} ${
        isRest && !count ? "rest" : ""
      } ${selected ? "selected" : ""} ${compact ? "compact" : ""}`}
      onClick={onSelect}
      type="button"
    >
      {compact ? null : (
        <>
          <span>{date.getDate()}</span>
          {count > 0 && <i />}
        </>
      )}
    </button>
  )
}

function MonthCalendar({
  month,
  selectedDate,
  counts,
  rests,
  onSelect,
}: {
  month: Date
  selectedDate: string
  counts: Record<string, number>
  rests: string[]
  onSelect: (key: string) => void
}) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const leading = (first.getDay() + 6) % 7
  const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = Array.from({ length: leading + total }, (_, index) =>
    index < leading
      ? null
      : new Date(month.getFullYear(), month.getMonth(), index - leading + 1),
  )
  while (cells.length % 7) cells.push(null)
  return (
    <div className="month-calendar">
      <div className="weekday-row">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
      <div className="month-grid">
        {cells.map((cell, index) =>
          cell ? (
            <HabitDay
              count={counts[localDateKey(cell)] || 0}
              date={cell}
              isRest={rests.includes(localDateKey(cell))}
              key={localDateKey(cell)}
              onSelect={() => onSelect(localDateKey(cell))}
              selected={selectedDate === localDateKey(cell)}
            />
          ) : (
            <span className="empty-day" key={`empty-${index}`} />
          ),
        )}
      </div>
    </div>
  )
}

function YearHeatmap({
  start,
  selectedDate,
  counts,
  rests,
  onSelect,
}: {
  start: Date
  selectedDate: string
  counts: Record<string, number>
  rests: string[]
  onSelect: (key: string) => void
}) {
  const first = new Date(start.getFullYear(), start.getMonth(), 1)
  const last = new Date(first.getFullYear() + 1, first.getMonth(), 0)
  const gridStart = shiftDate(first, -((first.getDay() + 6) % 7))
  const totalDays =
    Math.round((last.getTime() - gridStart.getTime()) / 86400000) + 1
  const cellCount = Math.ceil(totalDays / 7) * 7
  const days = Array.from({ length: cellCount }, (_, index) =>
    shiftDate(gridStart, index),
  )
  const months = Array.from({ length: 12 }, (_, i) =>
    new Date(first.getFullYear(), first.getMonth() + i, 1).toLocaleDateString(
      "en-US",
      { month: "short" },
    ),
  )
  return (
    <div className="year-chart">
      <div className="year-months">
        {months.map((label, i) => (
          <span key={`${label}-${i}`}>{label}</span>
        ))}
      </div>
      <div className="year-grid">
        {days.map((cell) => {
          const key = localDateKey(cell)
          if (cell < first || cell > last)
            return <span className="year-empty" key={key} />
          return (
            <HabitDay
              compact
              count={counts[key] || 0}
              date={cell}
              isRest={rests.includes(key)}
              key={key}
              onSelect={() => onSelect(key)}
              selected={selectedDate === key}
            />
          )
        })}
      </div>
      <div className="heat-legend">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <i className={`intensity-${level}`} key={level} />
        ))}
        <span>More</span>
        <i className="rest" />
        <span>Rest</span>
      </div>
    </div>
  )
}

function HistorySheet({
  open,
  close,
  defaultTagId,
  tags,
  tasks,
  reviews,
  todayKey,
  updateReview,
}: Pick<Props, "tags" | "tasks" | "reviews" | "updateReview"> & {
  open: boolean
  close: () => void
  defaultTagId: string
  todayKey: string
}) {
  const [rawTagId, setTagId] = useState(defaultTagId)
  const tag = tags.find((t) => t.id === rawTagId) || tags[0]
  const tagId = tag?.id || ""
  const [selected, setSelected] = useState(todayKey)
  const [month, setMonth] = useState(() => {
    const date = dateFromKey(todayKey)
    return new Date(date.getFullYear(), date.getMonth(), 1)
  })
  const heatmapStart = useMemo(() => {
    const date = dateFromKey(todayKey)
    return new Date(date.getFullYear(), date.getMonth(), 1)
  }, [todayKey])
  const tagDone = tasks
    .filter((t) => t.completed && t.completedAt && t.tagId === tagId)
    .sort((x, y) => y.completedAt!.localeCompare(x.completedAt!))
  const counts: Record<string, number> = {}
  for (const t of tagDone) {
    const key = localDateKey(new Date(t.completedAt!))
    counts[key] = (counts[key] || 0) + 1
  }
  const rests = Object.entries(reviews)
    .filter(([, review]) => review.rests.includes(tagId))
    .map(([key]) => key)
  const selectedCount = counts[selected] || 0
  const isRest = rests.includes(selected)
  const selectedLabel = dateFromKey(selected).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
  function select(key: string) {
    setSelected(key)
    const date = dateFromKey(key)
    setMonth(new Date(date.getFullYear(), date.getMonth(), 1))
  }
  function toggleRest() {
    if (!tagId || selectedCount) return
    updateReview(selected, (review) => ({
      ...review,
      rests: review.rests.includes(tagId)
        ? review.rests.filter((id) => id !== tagId)
        : [...review.rests, tagId],
    }))
  }
  return (
    <section aria-hidden={!open} className={`story-sheet ${open ? "open" : ""}`}>
      <button
        aria-label="Close history"
        className="sheet-handle"
        onClick={close}
        type="button"
      >
        <span />
      </button>
      <div className="sheet-body">
        <div className="history-head">
          <div>
            <small>History</small>
            <strong>Your rhythm by project</strong>
          </div>
          <div className="history-tags">
            {tags.map((t) => (
              <button
                className={`tag-chip ${t.color} ${t.id === tagId ? "selected" : ""}`}
                key={t.id}
                onClick={() => setTagId(t.id)}
                type="button"
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
        {tag ? (
          <>
            <section className="year-panel inline-year">
              <div className="section-heading">
                <div>
                  <small>Year at a glance</small>
                  <strong>
                    From{" "}
                    {heatmapStart.toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                    })}
                  </strong>
                </div>
                <span>Each square is one day</span>
              </div>
              <YearHeatmap
                counts={counts}
                onSelect={select}
                rests={rests}
                selectedDate={selected}
                start={heatmapStart}
              />
            </section>
            <div className="progress-calendar-grid">
              <section className="month-panel">
                <div className="calendar-heading">
                  <div>
                    <small>Monthly rhythm</small>
                    <strong>
                      {month.toLocaleDateString("en-US", {
                        month: "long",
                        year: "numeric",
                      })}
                    </strong>
                  </div>
                  <div>
                    <button
                      aria-label="Previous month"
                      className="button icon-button"
                      onClick={() =>
                        setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
                      }
                      type="button"
                    >
                      <Icon name="left" />
                    </button>
                    <button
                      aria-label="Next month"
                      className="button icon-button"
                      onClick={() =>
                        setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
                      }
                      type="button"
                    >
                      <Icon name="right" />
                    </button>
                  </div>
                </div>
                <MonthCalendar
                  counts={counts}
                  month={month}
                  onSelect={select}
                  rests={rests}
                  selectedDate={selected}
                />
              </section>
              <aside className="compact-day-control">
                <div>
                  <small>Selected day</small>
                  <strong>{selectedLabel}</strong>
                  <span
                    className={
                      selectedCount
                        ? "day-status active"
                        : isRest
                          ? "day-status rest"
                          : "day-status"
                    }
                  >
                    {selectedCount
                      ? `${selectedCount} completed`
                      : isRest
                        ? "Rest day"
                        : "No activity"}
                  </span>
                </div>
                <button
                  className={`button rest-toggle ${isRest ? "active" : ""}`}
                  disabled={selectedCount > 0}
                  onClick={toggleRest}
                  type="button"
                >
                  {selectedCount
                    ? "Activity recorded from tasks"
                    : isRest
                      ? "Marked as intentional rest"
                      : "Mark as intentional rest"}
                  {!selectedCount && <Icon name={isRest ? "check" : "moon"} size={15} />}
                </button>
              </aside>
            </div>
            <section className="done-list">
              <div className="section-heading">
                <div>
                  <small>Completed</small>
                  <strong>Tasks you finished</strong>
                </div>
                <span>{tagDone.length} total</span>
              </div>
              {tagDone.length ? (
                <ul>
                  {tagDone.map((t) => (
                    <li key={t.id}>
                      <Icon name="check" size={14} />
                      <strong>{t.title}</strong>
                      <span>
                        {new Date(t.completedAt!).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        · {t.duration} min
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="done-empty">
                  Nothing completed yet. Finish a task in this project to see it here.
                </p>
              )}
            </section>
          </>
        ) : (
          <p className="done-empty">Create a project to see its history.</p>
        )}
        <button className="button primary sheet-finish" onClick={close} type="button">
          Back to the story
        </button>
      </div>
    </section>
  )
}
