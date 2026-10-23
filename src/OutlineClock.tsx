import { useEffect, useRef, useState } from "react"
import Icon from "./Icon"
import type { DayOutline, Tag } from "./types"

// Projects are stored as tags (`Tag`) so saved data keeps working.

/** Paint tool: a project id, or the eraser. */
const ERASE = "__erase"
type Tool = string
type Target = number | "center" | null
type Gesture =
  | {
      kind: "chip"
      tool: Tool
      pointerId: number
      x0: number
      y0: number
      dragging: boolean
    }
  | {
      kind: "brush"
      tool: Tool
      pointerId: number
      start: number
      last: number
      moved: boolean
      /** Outline before the stroke, so an eraser stroke can be undone. */
      before: DayOutline
      touched: Set<number>
    }
type Run = { start: number; end: number; id: string | null }

// Geometry (SVG units). Inner ring = 12 AM–12 PM, outer ring = 12 PM–12 AM.
const SIZE = 440
const C = SIZE / 2
const CENTER_R = 100
const RINGS = [
  { r0: 108, r1: 146 },
  { r0: 154, r1: 196 },
]
const GAP = 1.1 // degrees trimmed from each side of an hour

function polar(r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180
  return [C + r * Math.cos(a), C + r * Math.sin(a)] as const
}

function sector(r0: number, r1: number, a0: number, a1: number) {
  const large = a1 - a0 > 180 ? 1 : 0
  const [x0, y0] = polar(r1, a0)
  const [x1, y1] = polar(r1, a1)
  const [x2, y2] = polar(r0, a1)
  const [x3, y3] = polar(r0, a0)
  return `M${x0} ${y0}A${r1} ${r1} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${large} 0 ${x3} ${y3}Z`
}

function clock(hour: number) {
  const h = hour % 24
  return { n: h % 12 === 0 ? 12 : h % 12, pm: h >= 12 }
}

export function hourRange(start: number, end = start + 1) {
  const a = clock(start)
  const b = clock(end)
  if (a.pm === b.pm && end - start < 12)
    return `${a.n}:00–${b.n}:00 ${b.pm ? "PM" : "AM"}`
  return `${a.n}:00 ${a.pm ? "PM" : "AM"}–${b.n}:00 ${b.pm ? "PM" : "AM"}`
}

function duration(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`
}

/** Hours strictly between `from` and `to` on the same ring, the short way round. */
function between(from: number, to: number) {
  if (Math.floor(from / 12) !== Math.floor(to / 12)) return []
  const base = Math.floor(from / 12) * 12
  const a = from % 12
  const b = to % 12
  const forward = (b - a + 12) % 12
  const step = forward <= 6 ? 1 : -1
  const out: number[] = []
  for (let i = (a + step + 12) % 12; i !== b; i = (i + step + 12) % 12)
    out.push(base + i)
  return out
}

/** Contiguous runs of the same project between hours `from` and `to`. */
function runs(owner: (hour: number) => string | null, from: number, to: number) {
  const out: Run[] = []
  for (let h = from; h < to; h++) {
    const id = owner(h)
    const last = out[out.length - 1]
    if (last && last.id === id && last.end === h) last.end = h + 1
    else out.push({ start: h, end: h + 1, id })
  }
  return out
}

function hitTest(x: number, y: number): Target {
  const el = document.elementFromPoint(x, y)
  const hour = el?.closest("[data-hour]")?.getAttribute("data-hour")
  if (hour != null) return Number(hour)
  if (el?.closest("[data-center]")) return "center"
  return null
}

export default function OutlineClock({
  dateKey,
  todayKey,
  outline,
  previous,
  tags: projects,
  onChange,
  onShiftDay,
  onToday,
  onManageTags: onManageProjects,
  notify,
  onUndoable,
  onOpenPlanner,
  onMore,
}: {
  dateKey: string
  todayKey: string
  outline: DayOutline
  previous: DayOutline | null
  tags: Tag[]
  onChange: (update: (outline: DayOutline) => DayOutline) => void
  onShiftDay: (days: number) => void
  onToday: () => void
  onManageTags: () => void
  notify: (message: string) => void
  /** Show a message with Undo that restores `before`. */
  onUndoable: (message: string, before: DayOutline) => void
  /** Show this day and hour in the Planner. */
  onOpenPlanner: (dateKey: string, hour: number) => void
  onMore: () => void
}) {
  const [armed, setArmed] = useState<Tool | null>(null)
  const [hover, setHover] = useState<Target>(null)
  const [ghost, setGhost] = useState<{ x: number; y: number; tool: Tool } | null>(
    null,
  )
  const [confirmClear, setConfirmClear] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const gesture = useRef<Gesture | null>(null)

  const byId = (id: string | null | undefined) =>
    id ? projects.find((p) => p.id === id) : undefined
  const owner = (hour: number) => byId(outline.hours[hour])?.id ?? null
  const focus = byId(outline.focus)
  const armedProject = armed && armed !== ERASE ? byId(armed) : undefined

  useEffect(() => {
    if (armed && armed !== ERASE && !projects.some((p) => p.id === armed))
      setArmed(null)
  }, [armed, projects])
  useEffect(() => {
    const tick = () => setNow(new Date())
    const timer = window.setInterval(tick, 10000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    if (!confirmClear) return
    const timer = window.setTimeout(() => setConfirmClear(false), 3000)
    return () => window.clearTimeout(timer)
  }, [confirmClear])
  useEffect(() => setConfirmClear(false), [dateKey])

  function paint(hours: number[], tool: Tool) {
    onChange((current) => {
      const next = { ...current.hours }
      for (const hour of hours) {
        if (tool === ERASE) delete next[hour]
        else next[hour] = tool
      }
      return { ...current, hours: next }
    })
  }

  const plural = (n: number) => `${n} ${n === 1 ? "hour" : "hours"}`

  function setFocus(tool: Tool) {
    if (tool === ERASE) {
      if (!outline.focus) return
      const before = outline
      onChange((current) => ({ ...current, focus: null }))
      onUndoable("Focus cleared", before)
      return
    }
    const project = byId(tool)
    if (!project) return
    onChange((current) => ({ ...current, focus: tool }))
    setArmed(tool)
    notify(`${project.name} is today’s focus`)
  }

  function tapHour(hour: number) {
    const tool = armed ?? outline.focus
    if (!tool) return notify("Pick a project first")
    if (tool === ERASE) {
      if (outline.hours[hour] === undefined) return
      const before = outline
      paint([hour], ERASE)
      onUndoable(`Erased ${plural(1)}`, before)
    } else if (outline.hours[hour] === tool) paint([hour], ERASE)
    else paint([hour], tool)
  }

  function tapCenter() {
    if (!armed) return
    if (armed !== ERASE && armed === outline.focus) setFocus(ERASE)
    else setFocus(armed)
  }

  // Window-level pointer tracking so drags work across the whole page.
  const handlers = useRef({
    move: (_e: PointerEvent) => {},
    end: (_e: PointerEvent) => {},
  })
  handlers.current.move = (e) => {
    const g = gesture.current
    if (!g || e.pointerId !== g.pointerId) return
    const target = hitTest(e.clientX, e.clientY)
    if (g.kind === "chip") {
      if (!g.dragging && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > 6)
        g.dragging = true
      if (g.dragging) {
        setGhost({ x: e.clientX, y: e.clientY, tool: g.tool })
        setHover(target)
      }
      return
    }
    setHover(target)
    if (typeof target === "number" && target !== g.last) {
      const run = [...between(g.last, target), target]
      if (!g.moved) run.unshift(g.start)
      g.moved = true
      g.last = target
      run.forEach((h) => g.touched.add(h))
      paint(run, g.tool)
    }
  }
  handlers.current.end = (e) => {
    const g = gesture.current
    if (!g || e.pointerId !== g.pointerId) return
    gesture.current = null
    if (g.kind === "chip") {
      if (g.dragging && e.type === "pointerup") {
        const target = hitTest(e.clientX, e.clientY)
        if (target === "center") setFocus(g.tool)
        else if (typeof target === "number") {
          if (g.tool === ERASE) {
            if (outline.hours[target] !== undefined) {
              const before = outline
              paint([target], ERASE)
              onUndoable(`Erased ${plural(1)}`, before)
            }
          } else paint([target], g.tool)
        }
      } else if (!g.dragging && e.type === "pointerup") {
        setArmed((current) => (current === g.tool ? null : g.tool))
      }
    } else if (!g.moved && e.type === "pointerup") {
      tapHour(g.start)
    } else if (g.moved && g.tool === ERASE) {
      const erased = [...g.touched].filter((h) => g.before.hours[h] !== undefined)
      if (erased.length) onUndoable(`Erased ${plural(erased.length)}`, g.before)
    }
    setGhost(null)
    setHover(null)
  }
  useEffect(() => {
    const move = (e: PointerEvent) => handlers.current.move(e)
    const end = (e: PointerEvent) => handlers.current.end(e)
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", end)
    window.addEventListener("pointercancel", end)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", end)
      window.removeEventListener("pointercancel", end)
    }
  }, [])

  function startChipDrag(e: React.PointerEvent, tool: Tool) {
    if (e.button !== 0) return
    e.preventDefault()
    gesture.current = {
      kind: "chip",
      tool,
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      dragging: false,
    }
  }

  function startBrush(e: React.PointerEvent, hour: number) {
    if (e.button !== 0) return
    e.preventDefault()
    // Paint with the project in hand; otherwise extend the block you grabbed;
    // otherwise fall back to the day's focus.
    const tool = armed ?? owner(hour) ?? outline.focus
    setHover(hour)
    if (!tool) return
    gesture.current = {
      kind: "brush",
      tool,
      pointerId: e.pointerId,
      start: hour,
      last: hour,
      moved: false,
      before: outline,
      touched: new Set([hour]),
    }
  }

  // Derived numbers
  const hoursFor: Record<string, number> = {}
  for (let h = 0; h < 24; h++) {
    const id = owner(h)
    if (id) hoursFor[id] = (hoursFor[id] || 0) + 1
  }
  const outlined = Object.values(hoursFor).reduce((sum, n) => sum + n, 0)
  const focusHours = focus ? hoursFor[focus.id] || 0 : 0
  const isToday = dateKey === todayKey
  const nowHour = now.getHours()
  const nowMinutes = nowHour * 60 + now.getMinutes()
  const isEmpty = !outline.focus && outlined === 0
  const previousHasData =
    !!previous && (!!previous.focus || Object.keys(previous.hours).length > 0)

  const date = new Date(
    Number(dateKey.slice(0, 4)),
    Number(dateKey.slice(5, 7)) - 1,
    Number(dateKey.slice(8, 10)),
  )
  const today = new Date(
    Number(todayKey.slice(0, 4)),
    Number(todayKey.slice(5, 7)) - 1,
    Number(todayKey.slice(8, 10)),
  )
  const offset = Math.round((date.getTime() - today.getTime()) / 86400000)
  const title =
    offset === 0
      ? "Today"
      : offset === 1
        ? "Tomorrow"
        : offset === -1
          ? "Yesterday"
          : date.toLocaleDateString("en-US", { weekday: "long" })
  const eyebrow = date
    .toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
    })
    .replace(/,/g, "")
    .replace(/^(\w+) /, "$1 · ")

  // Up next: today from the current block on; other days, the whole day.
  const allRuns = runs(owner, 0, 24)
  const nowRun = isToday
    ? allRuns.find((r) => r.start <= nowHour && nowHour < r.end)
    : undefined
  const listRuns =
    isToday && offset === 0 ? allRuns.filter((r) => r.end > nowHour) : allRuns
  const openCount = listRuns.filter((r) => !r.id).length
  const leftInBlock = nowRun ? nowRun.end * 60 - nowMinutes : 0

  // Clock hand
  const handAngle = ((nowHour % 12) * 60 + now.getMinutes()) / 2
  const activeRing = RINGS[nowHour < 12 ? 0 : 1]
  const [dotX, dotY] = polar((activeRing.r0 + activeRing.r1) / 2, handAngle)
  const [handX0, handY0] = polar(CENTER_R + 2, handAngle)
  const [handX1, handY1] = polar(RINGS[1].r1 + 8, handAngle)
  const time = `${nowHour % 12 === 0 ? 12 : nowHour % 12}:${String(now.getMinutes()).padStart(2, "0")}`

  const clip = (name: string, max: number) =>
    name.length > max ? `${name.slice(0, max - 1)}…` : name

  // The line under the clock: legend at rest, live readout while you work.
  const ghostProject = ghost && ghost.tool !== ERASE ? byId(ghost.tool) : undefined
  let readout: React.ReactNode = null
  if (ghost && hover === "center")
    readout =
      ghost.tool === ERASE ? (
        <>Drop to clear the focus</>
      ) : (
        <>
          Drop to make <b>{ghostProject?.name}</b> the focus
        </>
      )
  else if (typeof hover === "number") {
    const project = byId(outline.hours[hover])
    readout = (
      <>
        <span className="mono">{hourRange(hover)}</span>
        <i />
        {project ? <b>{project.name}</b> : <span>Open</span>}
      </>
    )
  }

  return (
    <main className={`outline ${ghost ? "is-dragging" : ""}`}>
      <header className="outline-head">
        <div aria-live="polite">
          <small>{eyebrow}</small>
          <h1>
            {title}
            {isToday && (
              <span className="head-time">
                {time}
                <em>{nowHour < 12 ? "AM" : "PM"}</em>
              </span>
            )}
          </h1>
        </div>
        <nav aria-label="Change day">
          {!isToday && (
            <button className="today-pill" onClick={onToday} type="button">
              Today
            </button>
          )}
          <button
            aria-label="Previous day"
            className="round-button"
            onClick={() => onShiftDay(-1)}
            type="button"
          >
            <Icon name="left" />
          </button>
          <button
            aria-label="Next day"
            className="round-button"
            onClick={() => onShiftDay(1)}
            type="button"
          >
            <Icon name="right" />
          </button>
          <button
            aria-label="More"
            className="round-button mobile-only"
            onClick={onMore}
            type="button"
          >
            <Icon name="more" />
          </button>
        </nav>
      </header>

      <div className="outline-body">
        <div className="clock-col">
          <div className="clock-wrap">
            <svg
              aria-label="Day outline. Inner ring is midnight to noon, outer ring is noon to midnight."
              className="clock"
              role="group"
              viewBox={`0 0 ${SIZE} ${SIZE}`}
            >
              <defs>
                {/* Open hours are hatched: free time on purpose, not missing data. */}
                {[0, 1].map((ring) => (
                  <pattern
                    height={7}
                    id={`open-hatch-${ring}`}
                    key={ring}
                    patternTransform="rotate(45)"
                    patternUnits="userSpaceOnUse"
                    width={7}
                  >
                    <rect className={`hatch-bg ring-${ring}`} height={7} width={7} />
                    <rect className="hatch-line" height={7} width={1.6} />
                  </pattern>
                ))}
              </defs>
              {/* One wedge per hour, so the partitions read like a clock face. */}
              <g className="blocks-layer" aria-hidden>
                {RINGS.map((ring, ringIndex) =>
                  Array.from({ length: 12 }, (_, i) => {
                    const hour = ringIndex * 12 + i
                    const project = byId(owner(hour))
                    return (
                      <path
                        className={`arc ${project ? project.color : `open ring-${ringIndex}`} ${
                          isToday && hour === nowHour ? "is-now" : ""
                        }`}
                        fill={project ? undefined : `url(#open-hatch-${ringIndex})`}
                        d={sector(ring.r0, ring.r1, i * 30 + GAP, (i + 1) * 30 - GAP)}
                        key={hour}
                      />
                    )
                  }),
                )}
                {typeof hover === "number" && (
                  <path
                    className="hover-outline"
                    d={sector(
                      RINGS[hover < 12 ? 0 : 1].r0,
                      RINGS[hover < 12 ? 0 : 1].r1,
                      (hover % 12) * 30 + GAP,
                      (hover % 12) * 30 + 30 - GAP,
                    )}
                  />
                )}
              </g>

              {/* Hit targets: one per hour, on top, invisible. */}
              {RINGS.map((ring, ringIndex) =>
                Array.from({ length: 12 }, (_, i) => {
                  const hour = ringIndex * 12 + i
                  const project = byId(outline.hours[hour])
                  return (
                    <path
                      aria-label={`${hourRange(hour)}: ${project ? project.name : "open"}`}
                      className="hit"
                      d={sector(ring.r0 - 3, ring.r1 + 3, i * 30, i * 30 + 30)}
                      data-hour={hour}
                      key={hour}
                      onBlur={() => setHover(null)}
                      onFocus={() => setHover(hour)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          tapHour(hour)
                        }
                      }}
                      onPointerDown={(e) => startBrush(e, hour)}
                      onPointerEnter={() => !gesture.current && setHover(hour)}
                      onPointerLeave={() =>
                        !gesture.current && setHover((h) => (h === hour ? null : h))
                      }
                      role="button"
                      tabIndex={0}
                    />
                  )
                }),
              )}

              {/* Center: the time today, the focus always. Drop a project here. */}
              <g
                aria-label={
                  focus
                    ? `Focus: ${focus.name}, ${focusHours} hours.`
                    : "No focus yet. Drop a project here."
                }
                className={`center ${focus ? `set ${focus.color}` : ""} ${
                  hover === "center" ? "hover" : ""
                }`}
                data-center
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    tapCenter()
                  }
                }}
                onPointerUp={() => !gesture.current && tapCenter()}
                role="button"
                tabIndex={0}
              >
                <circle className="center-disc" cx={C} cy={C} r={CENTER_R} />
                {[0, 3, 6, 9].map((n) => {
                  const [x, y] = polar(CENTER_R - 13, n * 30)
                  return (
                    <text className="numeral" key={n} x={x} y={y}>
                      {n === 0 ? 12 : n}
                    </text>
                  )
                })}
                {focus ? (
                  <>
                    <text className="center-eyebrow" x={C} y={C - 36}>
                      FOCUS
                    </text>
                    <text
                      className="center-name"
                      style={{
                        fontSize:
                          focus.name.length <= 8
                            ? 30
                            : focus.name.length <= 11
                              ? 24
                              : focus.name.length <= 14
                                ? 19
                                : 16,
                      }}
                      x={C}
                      y={C - 4}
                    >
                      {clip(focus.name, 17)}
                    </text>
                    <text className="center-sub" x={C} y={C + 30}>
                      {focusHours}h · {Math.round((focusHours / 24) * 100)}%
                    </text>
                  </>
                ) : (
                  <>
                    <text className="center-hint" x={C} y={C - 10}>
                      Drop a project
                    </text>
                    <text className="center-hint" x={C} y={C + 10}>
                      to set the focus
                    </text>
                  </>
                )}
              </g>

              {isToday && (
                <g aria-hidden className="hand">
                  <line x1={handX0} x2={handX1} y1={handY0} y2={handY1} />
                  <circle cx={dotX} cy={dotY} r={6} />
                </g>
              )}
            </svg>
          </div>

          <p className="outline-readout">
            {readout ?? (
              <>
                <span className="legend inner" />
                <span className="mono">Inner · 12A–12P</span>
                <span className="legend outer" />
                <span className="mono">Outer · 12P–12A</span>
              </>
            )}
          </p>
        </div>

        <div className="side-col">
          <section aria-labelledby="projects-title" className="projects">
            <div className="section-row">
              <h2 id="projects-title">Projects</h2>
              <small>
                {armed === ERASE
                  ? "Erasing · tap hours"
                  : armedProject
                    ? `${armedProject.name} · tap or drag hours`
                    : "Drag onto the clock"}
              </small>
            </div>
            <div className="project-chips">
              {projects.map((project) => {
                const hours = hoursFor[project.id] || 0
                return (
                  <button
                    aria-label={`${project.name}: ${hours} hours. Drag onto the clock, or press to paint with it.`}
                    aria-pressed={armed === project.id}
                    className={`project-chip ${project.color} ${
                      armed === project.id ? "armed" : ""
                    } ${outline.focus === project.id ? "is-focus" : ""}`}
                    key={project.id}
                    onClick={(e) => {
                      // Keyboard activation; pointer taps are handled on pointerup.
                      if (e.detail === 0)
                        setArmed((current) => (current === project.id ? null : project.id))
                    }}
                    onPointerDown={(e) => startChipDrag(e, project.id)}
                    type="button"
                  >
                    <i />
                    <span>{project.name}</span>
                    {hours > 0 && <b>{hours}h</b>}
                  </button>
                )
              })}
              <button
                aria-label="Eraser"
                aria-pressed={armed === ERASE}
                className={`project-chip quiet ${armed === ERASE ? "armed" : ""}`}
                onClick={(e) => {
                  if (e.detail === 0)
                    setArmed((current) => (current === ERASE ? null : ERASE))
                }}
                onPointerDown={(e) => startChipDrag(e, ERASE)}
                type="button"
              >
                <Icon name="eraser" size={14} />
                <span>Erase</span>
              </button>
              <button
                aria-label="Manage projects"
                className="project-chip quiet add"
                onClick={onManageProjects}
                type="button"
              >
                <Icon name="plus" size={14} />
                {!projects.length && <span>Add a project</span>}
              </button>
            </div>
          </section>

          <section aria-labelledby="next-title" className="up-next">
            <div className="section-row">
              <h2 id="next-title">{offset < 0 ? "The day" : "Up next"}</h2>
              {!isEmpty && openCount > 0 && (
                <small className="mono">
                  {openCount} open {openCount === 1 ? "section" : "sections"}
                </small>
              )}
            </div>
            {isEmpty ? (
              <div className="next-empty">
                <p>
                  Nothing outlined yet. Drag a project into the center to set the
                  day’s focus, then onto the hours you’ll give it.
                </p>
                {previousHasData && (
                  <button
                    className="text-button"
                    onClick={() => {
                      const before = outline
                      onChange(() => ({
                        focus: previous!.focus,
                        hours: { ...previous!.hours },
                      }))
                      onUndoable("Copied the previous day’s outline", before)
                    }}
                    type="button"
                  >
                    Copy the previous day’s outline
                  </button>
                )}
              </div>
            ) : (
              <ol className="next-list">
                {listRuns.map((run) => {
                  const project = byId(run.id)
                  const isNow = run === nowRun
                  const fill = armed && armed !== ERASE ? armed : outline.focus
                  const fillName = byId(fill)?.name
                  const content = (
                    <>
                      <i className={project ? project.color : "open"} />
                      <span className="next-name">
                        <strong>{project ? project.name : "Open"}</strong>
                        {isNow && <em>Now · {duration(leftInBlock)} left</em>}
                      </span>
                      <span className="mono next-time">
                        {hourRange(run.start, run.end)}
                      </span>
                    </>
                  )
                  return (
                    <li className={isNow ? "is-now" : ""} key={run.start}>
                      {project ? (
                        <button
                          aria-label={`${project.name}, ${hourRange(run.start, run.end)}. Open in the planner.`}
                          className="next-row to-planner"
                          onClick={() => onOpenPlanner(dateKey, run.start)}
                          type="button"
                        >
                          {content}
                          <Icon name="right" size={15} />
                        </button>
                      ) : (
                        <button
                          aria-label={
                            fillName
                              ? `Give ${hourRange(run.start, run.end)} to ${fillName}`
                              : `Open, ${hourRange(run.start, run.end)}. Pick a project first.`
                          }
                          className="next-row"
                          onClick={() => {
                            if (!fill) return notify("Pick a project first")
                            const hours: number[] = []
                            for (let h = run.start; h < run.end; h++) hours.push(h)
                            paint(hours, fill)
                            notify(`${hourRange(run.start, run.end)} → ${fillName}`)
                          }}
                          type="button"
                        >
                          {content}
                          <Icon name="plus" size={15} />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
            {!isEmpty && (
              <button
                className={`text-button clear ${confirmClear ? "confirm" : ""}`}
                onClick={() => {
                  if (!confirmClear) return setConfirmClear(true)
                  const before = outline
                  onChange(() => ({ focus: null, hours: {} }))
                  setConfirmClear(false)
                  onUndoable("Day cleared", before)
                }}
                type="button"
              >
                {confirmClear ? "Tap again to clear the day" : "Clear day"}
              </button>
            )}
          </section>
        </div>
      </div>

      {ghost && (
        <div
          aria-hidden
          className={`drag-ghost ${
            ghost.tool === ERASE ? "erase" : byId(ghost.tool)?.color || ""
          }`}
          style={{ left: ghost.x, top: ghost.y }}
        >
          <i />
          {ghost.tool === ERASE ? "Erase" : byId(ghost.tool)?.name}
        </div>
      )}
    </main>
  )
}
