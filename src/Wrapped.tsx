import { useEffect, useMemo, useRef, useState } from "react"
import Icon from "./Icon"
import type { Color, DailyReview, DayOutline, Tag, Task } from "./types"

// Wrapped: 1) review the day (plan vs. what happened), 2) a story of the day.

const LIFE = [
  { id: "life:sick", name: "Sick", cls: "sick" },
  { id: "life:commute", name: "Commute", cls: "commute" },
  { id: "life:interrupted", name: "Interrupted", cls: "interrupted" },
] as const
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
    <div className="wrap-day-toggle" role="tablist">
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

/* ── Screen 1: the review, one question at a time ─────────────────────── */

type StepKind = "start" | "block" | "extra" | "tasks" | "note" | "summary"
type Step = { id: string; kind: StepKind; run?: number }

const lifeHints: Record<string, string> = {
  "life:sick": "Rest and recovery",
  "life:commute": "On the move",
  "life:interrupted": "Something else came up",
}

function hourSpan(start: number, end: number) {
  return `${hourLabel(start)} – ${hourLabel(end)}`
}

function DayReview({
  dateKey,
  day,
  dayToggle,
  confirm,
  tags,
  tasks,
  updateReview,
  setTaskDone,
}: Props & {
  dateKey: string
  day: Day
  dayToggle: React.ReactNode
  isToday: boolean
  confirm: () => void
}) {
  const { review, planned, actual, tagById } = day
  const weekday = dateFromKey(dateKey).toLocaleDateString("en-US", { weekday: "long" })
  const [changed, setChanged] = useState(
    () => Object.keys(review.actualHours || {}).length > 0 || !day.runs.length,
  )
  // Freeze the task list so unchecking a task never makes it vanish mid-review.
  const [taskIds] = useState(() => day.dayTasks.map((t) => t.id))
  const reviewTasks = taskIds
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is Task => !!t)
  function buildSteps(withChanges: boolean): Step[] {
    const steps: Step[] = [{ id: "start", kind: "start" }]
    if (withChanges) {
      day.runs.forEach((_, i) => steps.push({ id: `block-${i}`, kind: "block", run: i }))
      steps.push({ id: "extra", kind: "extra" })
    }
    if (taskIds.length) steps.push({ id: "tasks", kind: "tasks" })
    steps.push({ id: "note", kind: "note" }, { id: "summary", kind: "summary" })
    return steps
  }
  const steps = buildSteps(changed)
  const [stepId, setStepId] = useState(() =>
    review.confirmedAt ? "summary" : "start",
  )
  const index = Math.max(0, steps.findIndex((s) => s.id === stepId))
  const step = steps[index]
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  // Editing from the summary: answer, then head straight back to it
  // (hour questions still run through the remaining hour questions).
  const [fromSummary, setFromSummary] = useState(false)
  function go(id: string) {
    window.clearTimeout(timer.current)
    if (stepId === "summary") setFromSummary(true)
    if (id === "summary") setFromSummary(false)
    setStepId(id)
  }
  function next(after = 0, list = steps) {
    window.clearTimeout(timer.current)
    const i = list.findIndex((s) => s.id === stepId)
    const current = list[i]
    let target = list[Math.min(list.length - 1, i + 1)].id
    if (fromSummary && current && current.kind !== "start" && current.kind !== "block")
      target = "summary"
    if (target === "summary") setFromSummary(false)
    if (after) timer.current = window.setTimeout(() => setStepId(target), after)
    else setStepId(target)
  }
  function back() {
    go(steps[Math.max(0, index - 1)].id)
  }
  function setHours(update: (hours: Record<number, string>) => void) {
    updateReview(dateKey, (r) => {
      const hours = { ...(r.actualHours || {}) }
      update(hours)
      const nextReview = { ...r, actualHours: hours }
      if (!Object.keys(hours).length) delete nextReview.actualHours
      return nextReview
    })
  }
  function choosePlan(asPlanned: boolean) {
    if (asPlanned)
      setHours((hours) => {
        for (const h of day.plannedHours) delete hours[h]
      })
    setChanged(!asPlanned)
    const list = buildSteps(!asPlanned)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setStepId(list[1].id), 260)
  }
  const labelName = (id: string) =>
    tagById.get(id)?.name || LIFE.find((l) => l.id === id)?.name || ""
  const labelClass = (id: string) => {
    const life = LIFE.find((l) => l.id === id)
    return life ? `life ${life.cls}` : tagById.get(id)?.color || ""
  }
  const questionNumber = steps
    .slice(0, index + 1)
    .filter((s) => s.kind !== "summary").length

  let body: React.ReactNode = null
  if (step.kind === "start") {
    body = (
      <>
        {dayToggle}
        <FlowRings day={day} />
        <h1 className="flow-q">How did {weekday} go?</h1>
        {day.runs.length ? (
          <p className="flow-sub">
            You planned {day.plannedHours.length}h
            {day.focus ? (
              <>
                {" "}with a focus on <b className={`ink-${day.focus.color}`}>{day.focus.name}</b>
              </>
            ) : null}
            .
          </p>
        ) : (
          <p className="flow-sub">There was no outline for this day.</p>
        )}
        <div className="choices">
          {day.runs.length ? (
            <>
              <Choice k="A" onClick={() => choosePlan(true)} selected={!changed && !!review.confirmedAt}>
                Pretty much to plan
              </Choice>
              <Choice k="B" onClick={() => choosePlan(false)} selected={changed && Object.keys(review.actualHours || {}).length > 0}>
                Some things changed
              </Choice>
            </>
          ) : (
            <>
              <Choice k="A" onClick={() => go("extra")}>Log what took my time</Choice>
              <Choice k="B" onClick={() => go(taskIds.length ? "tasks" : "note")}>Nothing to log</Choice>
            </>
          )}
        </div>
      </>
    )
  } else if (step.kind === "block" && step.run !== undefined) {
    body = (
      <BlockQuestion
        key={step.id}
        labelClass={labelClass}
        onDone={() => next(380)}
        planned={planned}
        actual={actual}
        run={day.runs[step.run]}
        setHours={setHours}
        tags={tags}
      />
    )
  } else if (step.kind === "extra") {
    body = (
      <ExtraQuestion
        actual={actual}
        labelClass={labelClass}
        labelName={labelName}
        planned={planned}
        review={review}
        setHours={setHours}
        tags={tags}
      />
    )
  } else if (step.kind === "tasks") {
    const doneCount = reviewTasks.filter((t) => t.completed).length
    body = (
      <>
        <h1 className="flow-q">Which of these got done?</h1>
        <p className="flow-sub">
          {doneCount} of {reviewTasks.length} checked off. Tap to change.
        </p>
        <div className="task-picks">
          {reviewTasks.map((t) => {
            const tag = t.tagId ? tagById.get(t.tagId) : undefined
            return (
              <button
                aria-pressed={t.completed}
                className={`task-pick ${t.completed ? "done" : ""}`}
                key={t.id}
                onClick={() => setTaskDone(t.id, !t.completed, dateKey)}
                type="button"
              >
                <span className="pick-check">
                  {t.completed && <Icon name="check" size={16} />}
                </span>
                <span className="pick-copy">
                  <strong>{t.title}</strong>
                  <small>
                    {tag && <i className={`swatch ${tag.color}`} />}
                    {tag ? `${tag.name} · ` : ""}
                    {t.hour !== undefined && t.date === dateKey ? `${hourLabel(t.hour)} · ` : ""}
                    {t.duration} min
                  </small>
                </span>
              </button>
            )
          })}
        </div>
      </>
    )
  } else if (step.kind === "note") {
    body = (
      <>
        <h1 className="flow-q">One line about {weekday}.</h1>
        <p className="flow-sub">What stood out? What would you change tomorrow? Optional.</p>
        <textarea
          aria-label="Note for the day"
          className="flow-note"
          onChange={(e) => {
            const value = e.target.value
            updateReview(dateKey, (r) => ({ ...r, dayNote: value }))
          }}
          placeholder="Type your answer here…"
          rows={3}
          value={review.dayNote || ""}
        />
      </>
    )
  } else {
    const first = steps.find((s) => s.kind === "block")?.id || "start"
    const done = day.done.length
    body = (
      <>
        <h1 className="flow-q">{weekday}, summarized</h1>
        <p className="flow-sub">Tap anything to change it.</p>
        <div className="health-grid">
          <button className="health-tile wide" onClick={() => go("start")} type="button">
            <small>Planned vs. lived</small>
            <div className="health-rings">
              <MiniRings label="Planned" owner={planned} tagById={tagById} />
              <MiniRings delay={300} label="Lived" owner={actual} tagById={tagById} />
            </div>
          </button>
          <button className="health-tile" onClick={() => go(first)} type="button">
            <small>On plan</small>
            <b>
              {day.onPlan}
              <em>/{day.plannedHours.length}h</em>
            </b>
            <Meter value={day.plannedHours.length ? day.onPlan / day.plannedHours.length : 0} />
          </button>
          <button className="health-tile" onClick={() => go(taskIds.length ? "tasks" : "note")} type="button">
            <small>Tasks done</small>
            <b>
              {done}
              <em>/{reviewTasks.length}</em>
            </b>
            <Meter value={reviewTasks.length ? done / reviewTasks.length : 0} />
          </button>
          <button className="health-tile" onClick={() => go(changed ? first : "start")} type="button">
            <small>Life happened</small>
            <b>
              {day.lifeTotal}
              <em>h</em>
            </b>
            <span className="tile-detail">
              {day.life.length
                ? day.life.map((l) => `${l.hours}h ${l.name.toLowerCase()}`).join(" · ")
                : "Nothing got in the way"}
            </span>
          </button>
          <button className="health-tile" onClick={() => go(changed ? "extra" : "start")} type="button">
            <small>Focus</small>
            <b className={`tile-name ink-${day.focus?.color || "none"}`}>
              {day.focus?.name || "None set"}
            </b>
            <span className="tile-detail">
              {day.extra ? `+${day.extra}h unplanned work` : `${day.projectHours}h on projects`}
            </span>
          </button>
          <button className="health-tile wide" onClick={() => go("note")} type="button">
            <small>Note</small>
            <span className={`tile-note ${review.dayNote?.trim() ? "" : "empty"}`}>
              {review.dayNote?.trim() ? `“${review.dayNote.trim()}”` : "Add a line about the day"}
            </span>
          </button>
        </div>
      </>
    )
  }

  const isSummary = step.kind === "summary"
  return (
    <main className={`flow ${day.theme}`}>
      <div className="flow-progress" aria-hidden>
        <i style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
      </div>
      <section className="flow-stage" key={step.id}>
        {!isSummary && (
          <span className="flow-num">
            {questionNumber} <Icon name="right" size={13} />
          </span>
        )}
        {body}
      </section>
      <footer className="flow-nav">
        {index > 0 ? (
          <button aria-label="Previous question" className="flow-back" onClick={back} type="button">
            <Icon name="left" size={18} />
          </button>
        ) : (
          <span />
        )}
        {isSummary ? (
          <button className="flow-ok play" onClick={confirm} type="button">
            Looks right, play my day
            <Icon name="sparkle" size={16} />
          </button>
        ) : step.kind !== "start" ? (
          <button className="flow-ok" onClick={() => next()} type="button">
            {step.kind === "note" && !review.dayNote?.trim() ? "Skip" : "OK"}
            <Icon name="check" size={16} />
          </button>
        ) : (
          <span />
        )}
      </footer>
    </main>
  )
}

function Choice({
  k,
  children,
  onClick,
  selected = false,
  hint,
  swatch,
}: {
  k: string
  children: React.ReactNode
  onClick: () => void
  selected?: boolean
  hint?: string
  swatch?: string
}) {
  const [flash, setFlash] = useState(false)
  return (
    <button
      aria-pressed={selected}
      className={`choice ${selected ? "selected" : ""} ${flash ? "flash" : ""}`}
      onAnimationEnd={() => setFlash(false)}
      onClick={() => {
        setFlash(true)
        onClick()
      }}
      type="button"
    >
      <kbd>{k}</kbd>
      {swatch && <i className={`swatch ${swatch}`} />}
      <span>
        {children}
        {hint && <small>{hint}</small>}
      </span>
      {selected && <Icon name="check" size={16} />}
    </button>
  )
}

function Meter({ value }: { value: number }) {
  return (
    <span className="meter">
      <i style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} />
    </span>
  )
}

/** The planned day as one ring, for the opening question. */
function FlowRings({ day }: { day: Day }) {
  return (
    <div className="flow-ring">
      <MiniRings label="" owner={day.planned} tagById={day.tagById} />
    </div>
  )
}

const keys = "ABCDEFGHIJ"

function BlockQuestion({
  run,
  planned,
  actual,
  tags,
  setHours,
  labelClass,
  onDone,
}: {
  run: { start: number; end: number; tag: Tag }
  planned: (h: number) => string | null
  actual: (h: number) => string | null
  tags: Tag[]
  setHours: (update: (hours: Record<number, string>) => void) => void
  labelClass: (id: string) => string
  onDone: () => void
}) {
  const len = run.end - run.start
  const range = Array.from({ length: len }, (_, i) => run.start + i)
  const changedHours = range.filter((h) => actual(h) !== planned(h))
  const existing = changedHours.length
    ? (() => {
        const counts = new Map<string, number>()
        for (const h of changedHours) {
          const id = actual(h) || ""
          counts.set(id, (counts.get(id) || 0) + 1)
        }
        return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
      })()
    : null
  const [answer, setAnswer] = useState<"yes" | "partly" | "no" | null>(
    !changedHours.length ? null : changedHours.length === len ? "no" : "partly",
  )
  const [doneHours, setDoneHours] = useState(
    changedHours.length && changedHours.length < len ? len - changedHours.length : Math.max(1, len - 1),
  )
  const [replacement, setReplacement] = useState<string | null>(existing)
  function write(done: number, rep: string | null) {
    setHours((hours) => {
      range.forEach((h, i) => {
        if (!rep || i < done) delete hours[h]
        else hours[h] = rep
      })
    })
  }
  const options = [
    ...LIFE.map((l) => ({ id: l.id, name: l.name, hint: lifeHints[l.id] })),
    ...tags
      .filter((t) => t.id !== run.tag.id)
      .map((t) => ({ id: t.id, name: t.name, hint: "Another project" })),
  ]
  const asking = answer === "no" || answer === "partly"
  return (
    <>
      <h1 className="flow-q">
        <span className="mono flow-time">{hourSpan(run.start, run.end)}</span>
        was for <b className={`ink-${run.tag.color}`}>{run.tag.name}</b>. Did it happen?
      </h1>
      <div className="choices">
        <Choice
          k="A"
          onClick={() => {
            setAnswer("yes")
            setReplacement(null)
            write(len, null)
            onDone()
          }}
          selected={answer === "yes"}
        >
          Yes, all {len}h
        </Choice>
        {len > 1 && (
          <Choice
            k="B"
            onClick={() => {
              setAnswer("partly")
              if (replacement) write(doneHours, replacement)
            }}
            selected={answer === "partly"}
          >
            Partly
          </Choice>
        )}
        <Choice
          k={len > 1 ? "C" : "B"}
          onClick={() => {
            setAnswer("no")
            if (replacement) write(0, replacement)
          }}
          selected={answer === "no"}
        >
          No
        </Choice>
      </div>
      {answer === "partly" && (
        <div className="followup">
          <p className="followup-q">How much of it happened?</p>
          <div className="pill-row">
            {Array.from({ length: len - 1 }, (_, i) => i + 1).map((n) => (
              <button
                className={`pill ${doneHours === n ? "selected" : ""}`}
                key={n}
                onClick={() => {
                  setDoneHours(n)
                  if (replacement) write(n, replacement)
                }}
                type="button"
              >
                {n}h
              </button>
            ))}
          </div>
        </div>
      )}
      {asking && (
        <div className="followup">
          <p className="followup-q">
            What took {answer === "partly" ? `the other ${len - doneHours}h` : "its place"}?
          </p>
          <div className="choices compact">
            {options.map((o, i) => (
              <Choice
                hint={o.hint}
                k={keys[i] || "•"}
                key={o.id}
                onClick={() => {
                  setReplacement(o.id)
                  write(answer === "no" ? 0 : doneHours, o.id)
                  onDone()
                }}
                selected={replacement === o.id}
                swatch={labelClass(o.id)}
              >
                {o.name}
              </Choice>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function ExtraQuestion({
  planned,
  actual,
  review,
  tags,
  setHours,
  labelClass,
  labelName,
}: {
  planned: (h: number) => string | null
  actual: (h: number) => string | null
  review: DailyReview
  tags: Tag[]
  setHours: (update: (hours: Record<number, string>) => void) => void
  labelClass: (id: string) => string
  labelName: (id: string) => string
}) {
  const [label, setLabel] = useState<string | null>(null)
  const [start, setStart] = useState<number | null>(null)
  // Logged extras: unplanned hours that now have a label, grouped into runs.
  const extras: { start: number; end: number; id: string }[] = []
  for (const h of allHours) {
    const id = !planned(h) ? actual(h) : null
    if (!id) continue
    const last = extras[extras.length - 1]
    if (last && last.end === h && last.id === id) last.end = h + 1
    else extras.push({ start: h, end: h + 1, id })
  }
  const free = allHours.filter((h) => !planned(h) && !review.actualHours?.[h])
  let maxLen = 0
  if (start !== null) while (maxLen < 6 && free.includes(start + maxLen)) maxLen++
  const options = [
    ...LIFE.map((l) => ({ id: l.id, name: l.name })),
    ...tags.map((t) => ({ id: t.id, name: t.name })),
  ]
  return (
    <>
      <h1 className="flow-q">Anything else take your time?</h1>
      <p className="flow-sub">A commute, a sick hour, or work you didn’t plan for. Skip if not.</p>
      {extras.length > 0 && (
        <ul className="extra-list">
          {extras.map((x) => (
            <li key={x.start}>
              <i className={`swatch ${labelClass(x.id)}`} />
              <strong>{labelName(x.id)}</strong>
              <span className="mono">
                {hourSpan(x.start, x.end)} · {x.end - x.start}h
              </span>
              <button
                aria-label={`Remove ${labelName(x.id)}`}
                onClick={() =>
                  setHours((hours) => {
                    for (let h = x.start; h < x.end; h++) delete hours[h]
                  })
                }
                type="button"
              >
                <Icon name="close" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="followup">
        <p className="followup-q">{extras.length ? "Add another" : "What was it?"}</p>
        <div className="pill-row">
          {options.map((o) => (
            <button
              className={`pill ${label === o.id ? "selected" : ""}`}
              key={o.id}
              onClick={() => {
                setLabel(label === o.id ? null : o.id)
                setStart(null)
              }}
              type="button"
            >
              <i className={`swatch ${labelClass(o.id)}`} />
              {o.name}
            </button>
          ))}
        </div>
      </div>
      {label && (
        <div className="followup">
          <p className="followup-q">When did it start?</p>
          {free.length ? (
            <div className="pill-row hours">
              {free.map((h) => (
                <button
                  className={`pill ${start === h ? "selected" : ""}`}
                  key={h}
                  onClick={() => setStart(h)}
                  type="button"
                >
                  {hourLabel(h)}
                </button>
              ))}
            </div>
          ) : (
            <p className="flow-sub">Every hour is already accounted for.</p>
          )}
        </div>
      )}
      {label && start !== null && (
        <div className="followup">
          <p className="followup-q">For how long?</p>
          <div className="pill-row">
            {Array.from({ length: maxLen }, (_, i) => i + 1).map((n) => (
              <button
                className="pill"
                key={n}
                onClick={() => {
                  setHours((hours) => {
                    for (let h = start; h < start + n; h++) hours[h] = label
                  })
                  setLabel(null)
                  setStart(null)
                }}
                type="button"
              >
                {n}h
              </button>
            ))}
          </div>
        </div>
      )}
    </>
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
      {label && <figcaption>{label}</figcaption>}
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
