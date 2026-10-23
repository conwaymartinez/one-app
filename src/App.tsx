import { FormEvent, useEffect, useMemo, useRef, useState } from "react"
import Icon from "./Icon"
import OutlineClock from "./OutlineClock"
import type { Color, DayOutline, Tag } from "./types"

type View = "home" | "plan" | "cooldown"
type Task = {
  id: number
  title: string
  duration: number
  tagId: string | null
  completed: boolean
  carried?: boolean
  /** Sample task shipped with the test build. */
  example?: boolean
  hour?: number
  /** Local YYYY-MM-DD of the scheduled hour. */
  date?: string
  category?: string
  color?: Color
  completedAt?: string
}
type DailyReview = { rests: string[]; notes?: Record<string, string> }

const starterTags: Tag[] = [
  { id: "one-app", name: "One app", color: "lavender" },
  { id: "deep-work", name: "Deep work", color: "blue" },
  { id: "admin", name: "Admin", color: "peach" },
  { id: "personal", name: "Personal", color: "sage" },
]
const seed: Task[] = [
  {
    id: 1,
    title: "Review launch brief",
    duration: 45,
    tagId: "one-app",
    completed: false,
    example: true,
  },
  {
    id: 2,
    title: "Write project proposal",
    duration: 60,
    tagId: "deep-work",
    completed: false,
    example: true,
    hour: 10,
  },
  {
    id: 3,
    title: "Reply to design feedback",
    duration: 30,
    tagId: "admin",
    completed: false,
    example: true,
  },
  {
    id: 4,
    title: "Afternoon walk",
    duration: 30,
    tagId: "personal",
    completed: false,
    example: true,
    hour: 14,
  },
]
const allHours = Array.from({ length: 24 }, (_, i) => i)
/** Set to false to hide the Wrapped tab. */
const SHOW_WRAPPED = true
const palette: Color[] = ["lavender", "blue", "peach", "sage"]
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

const emptyOutline: DayOutline = { focus: null, hours: {} }

/** Day outlines keyed by local YYYY-MM-DD, validated defensively. */
function loadOutlines(): Record<string, DayOutline> {
  try {
    const stored = JSON.parse(localStorage.getItem("one-outlines") || "{}")
    if (!stored || typeof stored !== "object") return {}
    const result: Record<string, DayOutline> = {}
    for (const [key, value] of Object.entries(stored as Record<string, any>)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !value || typeof value !== "object")
        continue
      const hours: Record<number, string> = {}
      for (const [hour, tagId] of Object.entries(value.hours || {})) {
        const h = Number(hour)
        if (Number.isInteger(h) && h >= 0 && h < 24 && typeof tagId === "string")
          hours[h] = tagId
      }
      result[key] = {
        focus: typeof value.focus === "string" ? value.focus : null,
        hours,
      }
    }
    return result
  } catch {
    return {}
  }
}

function loadCooldownReviews() {
  try {
    const stored = JSON.parse(
      localStorage.getItem("one-cooldown-reviews") || "{}",
    ) as Record<string, { rests?: unknown; notes?: unknown }>
    if (!stored || typeof stored !== "object") return {}
    return Object.fromEntries(
      Object.entries(stored).map(([key, review]) => [
        key,
        {
          rests: Array.isArray(review?.rests)
            ? review.rests.filter((id): id is string => typeof id === "string")
            : [],
          notes:
            review?.notes && typeof review.notes === "object"
              ? Object.fromEntries(
                  Object.entries(review.notes as Record<string, unknown>).filter(
                    (entry): entry is [string, string] =>
                      typeof entry[1] === "string",
                  ),
                )
              : {},
        },
      ]),
    )
  } catch {
    return {}
  }
}


function Button({
  children,
  className = "",
  icon,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: string }) {
  return (
    <button className={`button ${className}`} {...props}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  )
}

function hourLabel(hour: number) {
  const h = hour % 24
  if (h === 0) return "12 AM"
  if (h === 12) return "12 PM"
  return `${h % 12} ${h < 12 ? "AM" : "PM"}`
}

/** "Today", "Tomorrow", "Yesterday", or a short weekday. */
function dayName(key: string, today = localDateKey()) {
  const diff = Math.round(
    (dateFromKey(key).getTime() - dateFromKey(today).getTime()) / 86400000,
  )
  if (diff === 0) return "Today"
  if (diff === 1) return "Tomorrow"
  if (diff === -1) return "Yesterday"
  return dateFromKey(key).toLocaleDateString("en-US", { weekday: "long" })
}

/** Tasks scheduled before dates existed belong to today. */
function withDates(list: Task[]) {
  const today = localDateKey()
  return list.map((task) =>
    task.hour !== undefined && !task.date ? { ...task, date: today } : task,
  )
}

function TaskCard({
  task,
  tag,
  toggle,
  chooseTime,
  chooseTag,
  edit,
  startDrag,
  dragging,
}: {
  task: Task
  tag?: Tag
  toggle: (id: number) => void
  chooseTime: (task: Task) => void
  chooseTag: (id: number) => void
  edit: (task: Task) => void
  startDrag: (e: React.PointerEvent, task: Task) => void
  dragging: boolean
}) {
  const when =
    task.hour === undefined
      ? null
      : task.date && task.date !== localDateKey()
        ? `${dayName(task.date).slice(0, 3)} ${hourLabel(task.hour)}`
        : hourLabel(task.hour)
  return (
    <article
      className={`task-card ${dragging ? "dragging" : ""}`}
      onPointerDown={(e) => startDrag(e, task)}
    >
      <span aria-hidden className="grip">
        <Icon name="grip" size={15} />
      </span>
      <button
        aria-label={`Mark ${task.title} complete`}
        className="check"
        onClick={() => toggle(task.id)}
        type="button"
      />
      <div className="task-copy">
        <div className="task-title">
          <button
            aria-label={`Edit ${task.title}`}
            className="task-name"
            onClick={() => edit(task)}
            type="button"
          >
            {task.title}
          </button>
          {task.example && <span>Example</span>}
        </div>
        <div className="task-meta">
          <button
            className={`tag-chip ${tag?.color || "untagged"}`}
            onClick={() => chooseTag(task.id)}
            type="button"
          >
            {tag?.name || "Add project"}
          </button>
          <i /> <span>{task.duration} min</span>
          {when && (
            <>
              <i />
              <span>{when}</span>
            </>
          )}
        </div>
      </div>
      <button
        aria-label={`Schedule ${task.title}`}
        className={`schedule-task ${
          task.hour === undefined ? "unassigned" : ""
        }`}
        onClick={() => chooseTime(task)}
        type="button"
      >
        <Icon name="calendar" size={16} />
      </button>
    </article>
  )
}

function Modal({
  children,
  close,
}: {
  children: React.ReactNode
  close: () => void
}) {
  // Ignore a backdrop press right after opening: the tap that opened a popup
  // can arrive again as a mouse event and close it immediately.
  const openedAt = useRef(Date.now())
  return (
    <div
      className="backdrop"
      onMouseDown={() => Date.now() - openedAt.current > 350 && close()}
      role="presentation"
    >
      <section
        aria-modal="true"
        className="modal"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
      >
        {children}
      </section>
    </div>
  )
}

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
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="month-grid">
        {cells.map((day, index) =>
          day ? (
            <HabitDay
              count={counts[localDateKey(day)] || 0}
              date={day}
              isRest={rests.includes(localDateKey(day))}
              key={localDateKey(day)}
              onSelect={() => onSelect(localDateKey(day))}
              selected={selectedDate === localDateKey(day)}
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
        {days.map((day) => {
          const key = localDateKey(day)
          if (day < first || day > last)
            return <span className="year-empty" key={key} />
          return (
            <HabitDay
              compact
              count={counts[key] || 0}
              date={day}
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

const storyThemes: Record<Color, { mood: string; kicker: string }> = {
  lavender: { mood: "Dreamy", kicker: "Your day, in soft focus" },
  blue: { mood: "Electric", kicker: "Systems online. Today in" },
  peach: { mood: "Golden hour", kicker: "The sun set on" },
  sage: { mood: "Grounded", kicker: "Growing steadily in" },
}

export default function App() {
  const [tags, setTags] = useState<Tag[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem("one-tags") || "")
      if (!Array.isArray(saved)) return starterTags
      // Drop malformed entries so bad storage can't blank the whole app.
      return saved.filter(
        (tag): tag is Tag =>
          !!tag &&
          typeof tag.id === "string" &&
          typeof tag.name === "string" &&
          palette.includes(tag.color),
      )
    } catch {
      return starterTags
    }
  })
  const [tasks, setTasks] = useState<Task[]>(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("one-tasks") || "",
      ) as Task[]
      return withDates(
        saved.map((task) => ({
          ...task,
          tagId:
            task.tagId ??
            starterTags.find((tag) => tag.name === task.category)?.id ??
            null,
        })),
      )
    } catch {
      return withDates(seed)
    }
  })
  const [view, setView] = useState<View>("home")
  const [outlines, setOutlines] =
    useState<Record<string, DayOutline>>(loadOutlines)
  const [outlineDate, setOutlineDate] = useState(localDateKey)
  const [text, setText] = useState("")
  const [selectedTagId, setSelectedTagId] = useState(() => tags[0]?.id || "")
  const [tagTarget, setTagTarget] = useState<number | "new" | null>(null)
  const [manageTags, setManageTags] = useState(false)
  const [newTagName, setNewTagName] = useState("")
  const [scheduleTask, setScheduleTask] = useState<Task | null>(null)
  const [createSlot, setCreateSlot] = useState<{
    date: string
    hour: number
  } | null>(null)
  const [scheduleDay, setScheduleDay] = useState(localDateKey)
  const [calStart, setCalStart] = useState(localDateKey)
  const [now, setNow] = useState(() => new Date())
  const [taskDrag, setTaskDrag] = useState<{
    id: number
    x: number
    y: number
    target: { date: string; hour: number } | null
  } | null>(null)
  const dragRef = useRef<{
    id: number
    pointerId: number
    x0: number
    y0: number
    started: boolean
    edgeSince?: number
    /** Dragged from the calendar (moving a scheduled task). */
    fromCalendar?: boolean
    /** Touch long-press timer; the drag only starts once it fires. */
    pending?: number
  } | null>(null)
  const swipeRef = useRef<{
    pointerId: number
    x0: number
    y0: number
    active: boolean
  } | null>(null)
  const calRef = useRef<HTMLDivElement>(null)
  const suppressClickUntil = useRef(0)
  const calScrollRef = useRef<HTMLDivElement>(null)
  const pendingScrollHour = useRef<number | null>(null)
  const [flashSlot, setFlashSlot] = useState<{ date: string; hour: number } | null>(null)
  const [editTask, setEditTask] = useState<{ id: number; title: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [toastState, setToastState] = useState<{
    text: string
    id: number
    undo?: () => void
  } | null>(null)
  const toast = toastState?.text || ""
  const setToast = (text: string) =>
    setToastState(text ? { text, id: Date.now() } : null)
  const showUndo = (text: string, undo: () => void) =>
    setToastState({ text, id: Date.now(), undo })
  const [moreOpen, setMoreOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [reviews, setReviews] =
    useState<Record<string, DailyReview>>(loadCooldownReviews)
  const [rawActiveTagId, setActiveTagId] = useState("")
  const [selectedHistoryDate, setSelectedHistoryDate] = useState(localDateKey)
  const [historyMonth, setHistoryMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  )
  const [sheetOpen, setSheetOpen] = useState(false)
  const [holding, setHolding] = useState(false)
  const [noteFocused, setNoteFocused] = useState(false)
  const [storyRun, setStoryRun] = useState(0)
  const gesture = useRef<{ x: number; y: number; t: number } | null>(null)
  const [split, setSplit] = useState(() => {
    try {
      return Number(localStorage.getItem("one-split")) || 60
    } catch {
      return 60
    }
  })
  const plannerRef = useRef<HTMLElement>(null)
  useEffect(() => {
    try {
      localStorage.setItem("one-split", String(split))
    } catch {}
  }, [split])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(timer)
  }, [])
  // Open the calendar scrolled to the hour before now, or to the block that
  // was tapped in Home's Up next.
  useEffect(() => {
    if (view !== "plan") return
    const target = pendingScrollHour.current ?? Math.max(0, new Date().getHours() - 1)
    pendingScrollHour.current = null
    const row = calScrollRef.current?.querySelector<HTMLElement>(
      `[data-row="${target}"]`,
    )
    if (row && calScrollRef.current)
      calScrollRef.current.scrollTop = Math.max(0, row.offsetTop - 8)
  }, [view])
  useEffect(() => {
    if (!flashSlot) return
    const timer = window.setTimeout(() => setFlashSlot(null), 1600)
    return () => window.clearTimeout(timer)
  }, [flashSlot])
  function dragSplit(e: React.PointerEvent) {
    const rect = plannerRef.current?.getBoundingClientRect()
    if (!rect || !e.currentTarget.hasPointerCapture(e.pointerId)) return
    setSplit(
      Math.min(82, Math.max(18, ((e.clientY - rect.top) / rect.height) * 100)),
    )
  }
  useEffect(() => {
    try {
      localStorage.setItem("one-tags", JSON.stringify(tags))
    } catch {}
  }, [tags])
  useEffect(() => {
    try {
      localStorage.setItem("one-tasks", JSON.stringify(tasks))
    } catch {}
  }, [tasks])
  useEffect(() => {
    try {
      localStorage.setItem("one-outlines", JSON.stringify(outlines))
    } catch {
      // Storage full or blocked; the outline still works for this session.
    }
  }, [outlines])
  // Arrow keys cycle days on the home view (unless typing).
  useEffect(() => {
    if (view !== "home") return
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target?.closest("input, textarea, [role=dialog]")) return
      if (e.key === "ArrowLeft") shiftOutlineDay(-1)
      if (e.key === "ArrowRight") shiftOutlineDay(1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [view])
  useEffect(() => {
    try {
      localStorage.setItem("one-cooldown-reviews", JSON.stringify(reviews))
    } catch {
      // Storage full or blocked; reviews still work for this session.
    }
  }, [reviews])
  useEffect(() => {
    if (rawActiveTagId && !tags.some((tag) => tag.id === rawActiveTagId))
      setActiveTagId("")
  }, [rawActiveTagId, tags])
  useEffect(() => {
    if (!toastState) return
    const timer = window.setTimeout(
      () => setToastState(null),
      toastState.undo ? 5000 : 2400,
    )
    return () => window.clearTimeout(timer)
  }, [toastState])

  const date = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
  const todayKey = localDateKey(now)
  // Wrapped follows the real day, so an app left open overnight rolls over.
  const cooldownDate = todayKey
  // Unscheduled first, then by day and hour.
  const open = tasks
    .filter((t) => !t.completed)
    .sort((a, b) => {
      const ka = a.hour === undefined ? "" : `${a.date}-${String(a.hour).padStart(2, "0")}`
      const kb = b.hour === undefined ? "" : `${b.date}-${String(b.hour).padStart(2, "0")}`
      return ka === kb ? a.id - b.id : ka < kb ? -1 : 1
    })
  const calDays = [calStart, localDateKey(shiftDate(dateFromKey(calStart), 1))]
  const scheduled = tasks.filter((t) => t.hour !== undefined)
  const planned = scheduled
    .filter((t) => t.date && calDays.includes(t.date))
    .reduce((sum, t) => sum + t.duration, 0)
  const dragTask = taskDrag ? tasks.find((t) => t.id === taskDrag.id) : undefined
  /** The project the home outline gives this hour, if any. */
  const slotProject = (dateKey: string, hour: number) => {
    const id = outlines[dateKey]?.hours[hour]
    return id ? tags.find((tag) => tag.id === id) : undefined
  }
  /** Outlined hours only take tasks from their own project. */
  const canPlace = (task: Task, dateKey: string, hour: number) => {
    const project = slotProject(dateKey, hour)
    return !project || project.id === task.tagId
  }
  // The block an Up next row stands for, highlighted briefly in the planner.
  const flashRange = (() => {
    if (!flashSlot) return null
    const id = slotProject(flashSlot.date, flashSlot.hour)?.id
    if (!id) return null
    let start = flashSlot.hour
    let end = flashSlot.hour + 1
    while (start > 0 && slotProject(flashSlot.date, start - 1)?.id === id) start--
    while (end < 24 && slotProject(flashSlot.date, end)?.id === id) end++
    return { date: flashSlot.date, start, end }
  })()
  // At midnight, views that were showing "today" move on to the new day.
  const lastToday = useRef(todayKey)
  useEffect(() => {
    const previous = lastToday.current
    if (previous === todayKey) return
    lastToday.current = todayKey
    setOutlineDate((key) => (key === previous ? todayKey : key))
    setCalStart((key) => (key === previous ? todayKey : key))
    setSelectedHistoryDate((key) => (key === previous ? todayKey : key))
  }, [todayKey])
  const selectedTag = tags.find((tag) => tag.id === selectedTagId)
  const tagFor = (task: Task) => tags.find((tag) => tag.id === task.tagId)

  function add(e: FormEvent, slot?: { date: string; hour: number }) {
    e.preventDefault()
    if (!text.trim()) return
    const fixed = slot ? slotProject(slot.date, slot.hour) : undefined
    setTasks((all) => [
      ...all,
      {
        id: Date.now(),
        title: text.trim(),
        duration: 30,
        tagId: fixed?.id ?? (selectedTagId || null),
        completed: false,
        hour: slot?.hour,
        date: slot?.date,
      },
    ])
    setText("")
    setCreateSlot(null)
    if (slot)
      setToast(`Added for ${dayName(slot.date).toLowerCase()} at ${hourLabel(slot.hour)}`)
  }
  function cycleSelectedTag() {
    if (!tags.length) {
      setTagTarget("new")
      setManageTags(true)
      return
    }
    const current = tags.findIndex((tag) => tag.id === selectedTagId)
    setSelectedTagId(tags[(current + 1) % tags.length].id)
  }
  function toggle(id: number) {
    const task = tasks.find((t) => t.id === id)
    setTasks((all) =>
      all.map((t) =>
        t.id === id
          ? { ...t, completed: true, completedAt: new Date().toISOString() }
          : t,
      ),
    )
    if (task)
      showUndo(`Done: ${task.title}`, () =>
        setTasks((all) =>
          all.map((t) =>
            t.id === id ? { ...t, completed: false, completedAt: undefined } : t,
          ),
        ),
      )
  }
  function saveTaskTitle(e: FormEvent) {
    e.preventDefault()
    if (!editTask) return
    const title = editTask.title.trim()
    if (!title) return
    setTasks((all) => all.map((t) => (t.id === editTask.id ? { ...t, title } : t)))
    setEditTask(null)
    setToast("Task updated")
  }
  function deleteTask(id: number) {
    const task = tasks.find((t) => t.id === id)
    if (!task) return
    setTasks((all) => all.filter((t) => t.id !== id))
    setEditTask(null)
    showUndo(`Deleted: ${task.title}`, () => setTasks((all) => [...all, task]))
  }
  function schedule(id: number, dateKey: string, hour: number) {
    const task = tasks.find((t) => t.id === id)
    if (!task) return
    if (!canPlace(task, dateKey, hour)) {
      setToast(`${hourLabel(hour)} is outlined for ${slotProject(dateKey, hour)?.name}`)
      return
    }
    setTasks((all) =>
      all.map((t) => (t.id === id ? { ...t, hour, date: dateKey } : t)),
    )
    setScheduleTask(null)
    setToast(`Scheduled ${dayName(dateKey).toLowerCase()} at ${hourLabel(hour)}`)
  }
  function unschedule(id: number) {
    setTasks((all) =>
      all.map((t) =>
        t.id === id ? { ...t, hour: undefined, date: undefined } : t,
      ),
    )
    setToast("Moved back to your task list")
  }
  function openSchedule(task: Task) {
    setScheduleDay(task.date && calDays.includes(task.date) ? task.date : calDays[0])
    setScheduleTask(task)
  }

  // Dragging a task onto the calendar. Pointer events, so it works on touch:
  // with a mouse the whole card drags; with a finger, the grip handle does.
  function startTaskDrag(e: React.PointerEvent, task: Task) {
    const target = e.target as HTMLElement
    if (e.button !== 0 || target.closest("button")) return
    if (e.pointerType !== "mouse" && !target.closest(".grip")) return
    e.preventDefault()
    dragRef.current = {
      id: task.id,
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      started: false,
    }
  }
  // Scheduled tasks move too: drag with a mouse, or long-press with a finger
  // (a quick touch still scrolls or swipes). A plain tap opens "Choose a time".
  function startBlockDrag(e: React.PointerEvent, task: Task) {
    const target = e.target as HTMLElement
    if (e.button !== 0 || target.closest("button")) return
    const d = {
      id: task.id,
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      started: false,
      fromCalendar: true,
    } as NonNullable<typeof dragRef.current>
    // Also stops the browser's follow-up mouse events, which would otherwise
    // land on the popup a tap opens.
    e.preventDefault()
    if (e.pointerType !== "mouse")
      d.pending = window.setTimeout(() => {
        if (dragRef.current !== d) return
        d.started = true
        d.pending = undefined
        navigator.vibrate?.(12)
        setTaskDrag({ id: d.id, x: d.x0, y: d.y0, target: null })
      }, 380)
    dragRef.current = d
  }
  const dragHandlers = useRef({
    move: (_e: PointerEvent) => {},
    end: (_e: PointerEvent) => {},
  })
  dragHandlers.current.move = (e) => {
    swipeMove(e)
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    const moved = Math.hypot(e.clientX - d.x0, e.clientY - d.y0)
    if (d.pending !== undefined) {
      // Finger moved before the long-press: it's a scroll or swipe, not a drag.
      if (moved > 8) {
        window.clearTimeout(d.pending)
        dragRef.current = null
      }
      return
    }
    if (!d.started && moved < 6) return
    d.started = true
    const slot = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>("[data-slot]")
    const target = slot
      ? { date: slot.dataset.date!, hour: Number(slot.dataset.hour) }
      : null
    setTaskDrag({ id: d.id, x: e.clientX, y: e.clientY, target })
    // Scroll the calendar when you hold a task near its top or bottom edge.
    // The short wait stops it scrolling as a finger passes the edge.
    const box = calScrollRef.current?.getBoundingClientRect()
    const inside = box && e.clientX >= box.left && e.clientX <= box.right
    const edge =
      inside && e.clientY >= box.top && e.clientY < box.top + 44
        ? -1
        : inside && e.clientY <= box.bottom && e.clientY > box.bottom - 44
          ? 1
          : 0
    if (!edge) d.edgeSince = undefined
    else if (d.edgeSince === undefined) d.edgeSince = performance.now()
    else if (performance.now() - d.edgeSince > 350)
      calScrollRef.current!.scrollTop += edge * 12
  }
  dragHandlers.current.end = (e) => {
    swipeEnd(e)
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    dragRef.current = null
    if (d.pending !== undefined) window.clearTimeout(d.pending)
    if (d.started && e.type === "pointerup") {
      const under = document.elementFromPoint(e.clientX, e.clientY)
      const slot = under?.closest<HTMLElement>("[data-slot]")
      if (slot) schedule(d.id, slot.dataset.date!, Number(slot.dataset.hour))
      else if (d.fromCalendar && under?.closest(".task-panel")) unschedule(d.id)
    } else if (!d.started && d.fromCalendar && e.type === "pointerup") {
      const task = tasks.find((t) => t.id === d.id)
      if (task && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 8) openSchedule(task)
    }
    setTaskDrag(null)
  }
  useEffect(() => {
    const move = (e: PointerEvent) => dragHandlers.current.move(e)
    const end = (e: PointerEvent) => dragHandlers.current.end(e)
    // While a task is being dragged, keep the page from scrolling under it.
    const holdScroll = (e: TouchEvent) => {
      if (dragRef.current?.started) e.preventDefault()
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", end)
    window.addEventListener("pointercancel", end)
    window.addEventListener("touchmove", holdScroll, { passive: false })
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", end)
      window.removeEventListener("pointercancel", end)
      window.removeEventListener("touchmove", holdScroll)
    }
  }, [])

  // Swipe the calendar sideways to move a day, like Apple Calendar.
  function swipeStart(e: React.PointerEvent) {
    if (e.pointerType !== "touch" || swipeRef.current) return
    swipeRef.current = {
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      active: false,
    }
  }
  function setSwipe(px: number, animate: boolean) {
    const el = calRef.current
    if (!el) return
    el.classList.toggle("swiping", !animate)
    el.style.setProperty("--swipe", `${px}px`)
  }
  function swipeMove(e: PointerEvent) {
    const sw = swipeRef.current
    if (!sw || e.pointerId !== sw.pointerId) return
    if (dragRef.current?.started) {
      swipeRef.current = null
      setSwipe(0, true)
      return
    }
    const dx = e.clientX - sw.x0
    const dy = e.clientY - sw.y0
    if (!sw.active) {
      if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        sw.active = true
        const d = dragRef.current
        if (d?.pending !== undefined) {
          window.clearTimeout(d.pending)
          dragRef.current = null
        }
      } else if (Math.abs(dy) > 14) swipeRef.current = null
      return
    }
    setSwipe(dx, false)
  }
  function swipeEnd(e: PointerEvent) {
    const sw = swipeRef.current
    if (!sw || e.pointerId !== sw.pointerId) return
    swipeRef.current = null
    if (!sw.active) return
    suppressClickUntil.current = Date.now() + 400
    const dx = e.clientX - sw.x0
    const width = calRef.current?.clientWidth || 360
    if (e.type === "pointerup" && Math.abs(dx) > Math.min(90, width * 0.18)) {
      const dir = dx < 0 ? 1 : -1
      setCalStart((key) => localDateKey(shiftDate(dateFromKey(key), dir)))
      // The new day slides in from the side you swiped toward.
      setSwipe(dir * 70, false)
      requestAnimationFrame(() => requestAnimationFrame(() => setSwipe(0, true)))
    } else setSwipe(0, true)
  }
  function assignTag(tagId: string) {
    if (tagTarget === "new") setSelectedTagId(tagId)
    else if (typeof tagTarget === "number") {
      const task = tasks.find((t) => t.id === tagTarget)
      const bumped =
        task?.date !== undefined &&
        task.hour !== undefined &&
        !canPlace({ ...task, tagId }, task.date, task.hour)
      setTasks((all) =>
        all.map((t) =>
          t.id === tagTarget
            ? bumped
              ? { ...t, tagId, hour: undefined, date: undefined }
              : { ...t, tagId }
            : t,
        ),
      )
      if (bumped)
        setToast(
          `Unscheduled: ${hourLabel(task!.hour!)} is outlined for ${slotProject(task!.date!, task!.hour!)?.name}`,
        )
    }
    setTagTarget(null)
    setManageTags(false)
  }
  function addTag(e: FormEvent) {
    e.preventDefault()
    const name = newTagName.trim()
    if (!name) return
    const tag: Tag = {
      id: `tag-${Date.now()}`,
      name,
      color: palette[tags.length % palette.length],
    }
    setTags((all) => [...all, tag])
    setNewTagName("")
  }
  function deleteTag(id: string) {
    const removed = tags.find((tag) => tag.id === id)
    if (!removed) return
    const index = tags.indexOf(removed)
    const taggedTaskIds = new Set(
      tasks.filter((task) => task.tagId === id).map((task) => task.id),
    )
    const outlinesBefore = outlines
    const remaining = tags.filter((tag) => tag.id !== id)
    setTags(remaining)
    showUndo(`Deleted project: ${removed.name || "Untitled"}`, () => {
      setTags((all) =>
        all.some((tag) => tag.id === id)
          ? all
          : [...all.slice(0, index), removed, ...all.slice(index)],
      )
      setTasks((all) =>
        all.map((task) =>
          taggedTaskIds.has(task.id) && task.tagId === null
            ? { ...task, tagId: id }
            : task,
        ),
      )
      setOutlines(outlinesBefore)
    })
    setTasks((all) =>
      all.map((task) => (task.tagId === id ? { ...task, tagId: null } : task)),
    )
    setOutlines((all) =>
      Object.fromEntries(
        Object.entries(all).map(([key, outline]) => [
          key,
          {
            focus: outline.focus === id ? null : outline.focus,
            hours: Object.fromEntries(
              Object.entries(outline.hours).filter(([, tagId]) => tagId !== id),
            ),
          },
        ]),
      ),
    )
    if (selectedTagId === id) setSelectedTagId(remaining[0]?.id || "")
  }
  const trackedCompleted = tasks.filter((task) => task.completedAt)
  const todayCompleted = trackedCompleted.filter(
    (task) => localDateKey(new Date(task.completedAt!)) === cooldownDate,
  )
  const completionCounts = useMemo(
    () =>
      trackedCompleted.reduce(
        (all, task) => {
          if (!task.tagId || !task.completedAt) return all
          const key = localDateKey(new Date(task.completedAt))
          all[task.tagId] ||= {}
          all[task.tagId][key] = (all[task.tagId][key] || 0) + 1
          return all
        },
        {} as Record<string, Record<string, number>>,
      ),
    [trackedCompleted],
  )
  const currentTag = tags.find((tag) => tag.id === rawActiveTagId) || tags[0]
  const activeTagId = currentTag?.id || ""
  const storyIndex = Math.max(0, tags.findIndex((tag) => tag.id === activeTagId))
  const storyPaused = holding || sheetOpen || noteFocused
  const todayReview = reviews[cooldownDate] || { rests: [] }
  const todayNote = todayReview.notes?.[activeTagId] || ""
  const tagCompletedTasks = trackedCompleted
    .filter((task) => task.tagId === activeTagId)
    .sort((x, y) => y.completedAt!.localeCompare(x.completedAt!))
  const activeTag = currentTag
  const activeCounts = completionCounts[activeTagId] || {}
  const activeTodayTasks = todayCompleted.filter(
    (task) => task.tagId === activeTagId,
  )
  const topTodayTask = [...activeTodayTasks].sort(
    (x, y) => y.duration - x.duration,
  )[0]
  const activeTodayMinutes = activeTodayTasks.reduce(
    (sum, task) => sum + task.duration,
    0,
  )
  const activeRestDates = Object.entries(reviews)
    .filter(([, review]) => review.rests.includes(activeTagId))
    .map(([key]) => key)
  const selectedReview = reviews[selectedHistoryDate] || { rests: [] }
  const selectedTagCount = activeCounts[selectedHistoryDate] || 0
  const selectedDateLabel = dateFromKey(selectedHistoryDate).toLocaleDateString(
    "en-US",
    { weekday: "long", month: "long", day: "numeric" },
  )
  const currentMonthKey = todayKey.slice(0, 7)
  const heatmapStart = useMemo(() => {
    const [year, month] = currentMonthKey.split("-").map(Number)
    return new Date(year, month - 1, 1)
  }, [currentMonthKey])
  // "This year" means the current year, not the month being browsed below.
  const yearTotal = Object.entries(activeCounts)
    .filter(([key]) => key.startsWith(`${todayKey.slice(0, 4)}-`))
    .reduce((sum, [, count]) => sum + count, 0)
  let streak = 0
  if (activeTagId) {
    let cursor = dateFromKey(cooldownDate)
    while (true) {
      const key = localDateKey(cursor)
      if (activeCounts[key]) streak += 1
      else if (!reviews[key]?.rests.includes(activeTagId)) break
      cursor = shiftDate(cursor, -1)
    }
  }

  function goToStory(index: number) {
    const tag = tags[index]
    if (!tag) return
    setActiveTagId(tag.id)
    setStoryRun((run) => run + 1)
    setSelectedHistoryDate(cooldownDate)
    setHistoryMonth(new Date())
  }
  function nextStory() {
    if (storyIndex < tags.length - 1) goToStory(storyIndex + 1)
  }
  function prevStory() {
    goToStory(Math.max(0, storyIndex - 1))
  }
  function saveNote(note: string) {
    updateReview(cooldownDate, (review) => ({
      ...review,
      notes: { ...review.notes, [activeTagId]: note },
    }))
    if (note) setToast("Note saved")
  }
  function openCooldown() {
    setSheetOpen(false)
    setStoryRun((run) => run + 1)
    setActiveTagId("")
    setSelectedHistoryDate(cooldownDate)
    setHistoryMonth(new Date())
    setView("cooldown")
  }
  function selectHistoryDate(key: string) {
    setSelectedHistoryDate(key)
    const next = dateFromKey(key)
    setHistoryMonth(new Date(next.getFullYear(), next.getMonth(), 1))
  }
  function updateReview(
    dateKey: string,
    update: (review: DailyReview) => DailyReview,
  ) {
    setReviews((current) => ({
      ...current,
      [dateKey]: update(current[dateKey] || { rests: [] }),
    }))
  }
  function shiftOutlineDay(days: number) {
    setOutlineDate((key) => localDateKey(shiftDate(dateFromKey(key), days)))
  }
  function updateOutline(update: (outline: DayOutline) => DayOutline) {
    setOutlines((all) => {
      const next = update(all[outlineDate] || emptyOutline)
      const copy = { ...all }
      if (!next.focus && !Object.keys(next.hours).length) delete copy[outlineDate]
      else copy[outlineDate] = next
      return copy
    })
  }
  function toggleRest() {
    if (!activeTagId || selectedTagCount) return
    updateReview(selectedHistoryDate, (review) => ({
      ...review,
      rests: review.rests.includes(activeTagId)
        ? review.rests.filter((id) => id !== activeTagId)
        : [...review.rests, activeTagId],
    }))
  }
  return (
    <div className="app">
      <header className="topbar">
        <button
          aria-current={view === "home" ? "page" : undefined}
          aria-label="Home: outline your day"
          className={view === "home" ? "brand active" : "brand"}
          onClick={() => {
            setSheetOpen(false)
            setView("home")
          }}
          type="button"
        >
          <span>1</span>
          <strong>One</strong>
        </button>
        <div className="date-nav">
          {view !== "home" && (
            <div>
              <small>Today</small>
              <strong>{date}</strong>
            </div>
          )}
        </div>
        <div className="header-actions">
          <Button
            className={view === "plan" ? "nav-button active" : "nav-button"}
            icon="list"
            onClick={() => setView("plan")}
          >
            Planner
          </Button>
          {SHOW_WRAPPED && (
            <Button
              className={view === "cooldown" ? "nav-button active" : "nav-button"}
              icon="moon"
              onClick={openCooldown}
            >
              Wrapped
            </Button>
          )}
          <Button
            className={moreOpen ? "nav-button more active" : "nav-button more"}
            icon="more"
            onClick={() => {
              setConfirmReset(false)
              setMoreOpen(true)
            }}
          >
            More
          </Button>
        </div>
      </header>

      {view === "plan" && (
        <>
          <main
            className="planner"
            ref={plannerRef}
            style={
              {
                "--split": `${split}fr`,
                "--rest": `${100 - split}fr`,
              } as React.CSSProperties
            }
          >
            <section className="task-panel">
              <div className="heading">
                <div>
                  <small>Your list</small>
                  <h1>Tasks</h1>
                </div>
                <span className="count">{open.length}</span>
              </div>
              <form className="quick-add" onSubmit={add}>
                <Icon name="plus" />
                <input
                  aria-label="Add a task"
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Add something to your day"
                  value={text}
                />
                <button
                  aria-label={`Current project: ${selectedTag?.name || "none"}. Tap to choose the next project.`}
                  className={`quick-tag ${selectedTag?.color || "untagged"}`}
                  onClick={cycleSelectedTag}
                  type="button"
                >
                  {selectedTag?.name || "Project"}
                </button>
                <button className="quick-submit" type="submit">
                  Add
                </button>
              </form>
              <p className="hint">
                <Icon name="sparkle" size={14} /> Drag a task by its handle onto
                the calendar. Outlined hours only take their own project.
              </p>
              <div className="task-list">
                {open.map((t) => (
                  <TaskCard
                    chooseTag={setTagTarget}
                    chooseTime={openSchedule}
                    edit={(task) => {
                      setConfirmDelete(false)
                      setEditTask({ id: task.id, title: task.title })
                    }}
                    dragging={taskDrag?.id === t.id}
                    key={t.id}
                    startDrag={startTaskDrag}
                    tag={tagFor(t)}
                    task={t}
                    toggle={toggle}
                  />
                ))}
              </div>
            </section>

            <div
              aria-label="Resize split"
              aria-orientation="horizontal"
              aria-valuemax={82}
              aria-valuemin={18}
              aria-valuenow={Math.round(split)}
              className="split-handle"
              onDoubleClick={() => setSplit(60)}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp") setSplit((v) => Math.max(18, v - 5))
                if (e.key === "ArrowDown") setSplit((v) => Math.min(82, v + 5))
              }}
              onPointerDown={(e) =>
                e.currentTarget.setPointerCapture(e.pointerId)
              }
              onPointerMove={dragSplit}
              role="separator"
              tabIndex={0}
            >
              <i />
            </div>
            <section className="calendar-panel">
              <div className="heading">
                <div>
                  <small>
                    {planned >= 60
                      ? `${Math.floor(planned / 60)}h${planned % 60 ? ` ${planned % 60}m` : ""}`
                      : `${planned}m`}{" "}
                    planned
                  </small>
                  <h2>Schedule</h2>
                </div>
                <div className="cal-nav">
                  {calStart !== todayKey && (
                    <button
                      className="cal-today"
                      onClick={() => setCalStart(todayKey)}
                      type="button"
                    >
                      Today
                    </button>
                  )}
                  <Button
                    aria-label="Earlier day"
                    className="icon-button"
                    icon="left"
                    onClick={() =>
                      setCalStart((key) => localDateKey(shiftDate(dateFromKey(key), -1)))
                    }
                  />
                  <Button
                    aria-label="Later day"
                    className="icon-button"
                    icon="right"
                    onClick={() =>
                      setCalStart((key) => localDateKey(shiftDate(dateFromKey(key), 1)))
                    }
                  />
                </div>
              </div>
              <div
                className={`cal ${taskDrag ? "is-dragging" : ""}`}
                onPointerDown={swipeStart}
                ref={calRef}
              >
                <div className="cal-days">
                  <span />
                  {calDays.map((key) => (
                    <div
                      className={`cal-day ${key === todayKey ? "is-today" : ""}`}
                      key={key}
                    >
                      <small>{dayName(key, todayKey)}</small>
                      <strong>
                        {dateFromKey(key).toLocaleDateString("en-US", { weekday: "short" })}{" "}
                        <b>{dateFromKey(key).getDate()}</b>
                      </strong>
                    </div>
                  ))}
                </div>
                <div className="cal-scroll" ref={calScrollRef}>
                  {allHours.map((hour) => (
                    <div className="cal-row" data-row={hour} key={hour}>
                      <time>{hour === 0 ? "" : hourLabel(hour)}</time>
                      {calDays.map((key) => {
                        const project = slotProject(key, hour)
                        const runStart =
                          project && slotProject(key, hour - 1)?.id !== project.id
                        const blocks = scheduled.filter(
                          (t) => t.date === key && t.hour === hour,
                        )
                        const isTarget =
                          taskDrag?.target?.date === key &&
                          taskDrag.target.hour === hour
                        const blocked = dragTask && !canPlace(dragTask, key, hour)
                        return (
                          <div
                            className={[
                              "slot",
                              project ? `has-project ${project.color}` : "",
                              runStart ? "run-start" : "",
                              key === todayKey && hour < now.getHours() ? "past" : "",
                              blocked ? "blocked" : "",
                              isTarget ? (blocked ? "target no" : "target") : "",
                              flashRange?.date === key &&
                              hour >= flashRange.start &&
                              hour < flashRange.end
                                ? "flash"
                                : "",
                            ].join(" ")}
                            data-date={key}
                            data-hour={hour}
                            data-slot
                            key={key}
                          >
                            <button
                              aria-label={`New task ${dayName(key, todayKey).toLowerCase()} at ${hourLabel(hour)}${project ? `, ${project.name} hour` : ""}`}
                              className="slot-hit"
                              onClick={() => {
                                if (Date.now() < suppressClickUntil.current) return
                                setText("")
                                setCreateSlot({ date: key, hour })
                              }}
                              type="button"
                            />
                            {runStart && <span className="slot-label">{project!.name}</span>}
                            {key === todayKey && hour === now.getHours() && (
                              <i
                                aria-hidden
                                className="now-line"
                                style={{ top: `${(now.getMinutes() / 60) * 100}%` }}
                              />
                            )}
                            {blocks.map((t) => (
                              <article
                                className={`block ${tagFor(t)?.color || "untagged"} ${
                                  t.completed ? "done" : ""
                                } ${canPlace(t, key, hour) ? "" : "mismatch"} ${
                                  taskDrag?.id === t.id ? "dragging" : ""
                                }`}
                                key={t.id}
                                onPointerDown={(e) => !t.completed && startBlockDrag(e, t)}
                                title={
                                  canPlace(t, key, hour)
                                    ? undefined
                                    : `This hour is now outlined for ${project?.name}`
                                }
                              >
                                <strong>{t.title}</strong>
                                <small>
                                  {t.duration}m
                                  {canPlace(t, key, hour) ? "" : ` · not ${project?.name}`}
                                </small>
                                {!t.completed && (
                                  <button
                                    aria-label={`Remove ${t.title} from calendar`}
                                    onClick={() => unschedule(t.id)}
                                    type="button"
                                  >
                                    <Icon name="close" size={12} />
                                  </button>
                                )}
                              </article>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </main>
        </>
      )}

      {view === "home" && (
        <OutlineClock
          dateKey={outlineDate}
          notify={setToast}
          onChange={updateOutline}
          onManageTags={() => {
            setTagTarget("new")
            setManageTags(true)
          }}
          onMore={() => {
            setConfirmReset(false)
            setMoreOpen(true)
          }}
          onOpenPlanner={(dateKey, hour) => {
            pendingScrollHour.current = hour
            setCalStart(dateKey)
            setFlashSlot({ date: dateKey, hour })
            setView("plan")
          }}
          onShiftDay={shiftOutlineDay}
          onToday={() => setOutlineDate(todayKey)}
          onUndoable={(message, before) => {
            const key = outlineDate
            showUndo(message, () =>
              setOutlines((all) => {
                const copy = { ...all }
                if (!before.focus && !Object.keys(before.hours).length) delete copy[key]
                else copy[key] = before
                return copy
              }),
            )
          }}
          outline={outlines[outlineDate] || emptyOutline}
          previous={
            outlines[localDateKey(shiftDate(dateFromKey(outlineDate), -1))] ||
            null
          }
          tags={tags}
          todayKey={todayKey}
        />
      )}

      {view === "cooldown" && (
        <main className={`wrapped ${activeTag?.color || "sage"}`}>
          {activeTag ? (
            <>
              <div className="wrapped-glow" key={`glow-${activeTag.id}`} />
              <header className="story-top">
                <div className="story-segments">
                  {tags.map((tag, index) => (
                    <span
                      className={
                        index < storyIndex
                          ? "done"
                          : index === storyIndex
                            ? "active"
                            : ""
                      }
                      key={tag.id}
                    >
                      {index === storyIndex && (
                        <i
                          key={`${tag.id}-${storyRun}`}
                          onAnimationEnd={nextStory}
                          style={{
                            animationPlayState: storyPaused
                              ? "paused"
                              : "running",
                          }}
                        />
                      )}
                    </span>
                  ))}
                </div>
                <div className="story-meta">
                  <span className="story-avatar">
                    {activeTag.name.slice(0, 1).toUpperCase()}
                  </span>
                  <strong>{activeTag.name}</strong>
                  <small>Today</small>
                  {storyPaused && !sheetOpen && <em>Paused</em>}
                </div>
              </header>

              <section
                className="story-stage"
                key={`${activeTag.id}-${storyRun}`}
                onPointerCancel={() => setHolding(false)}
                onPointerDown={(e) => {
                  gesture.current = { x: e.clientX, y: e.clientY, t: Date.now() }
                  setHolding(true)
                }}
                onPointerUp={(e) => {
                  setHolding(false)
                  const start = gesture.current
                  if (!start) return
                  const dy = e.clientY - start.y
                  const dx = e.clientX - start.x
                  if (dy < -50) return setSheetOpen(true)
                  if (Math.abs(dx) > 60) return dx < 0 ? nextStory() : prevStory()
                  if (Date.now() - start.t > 280) return
                  const rect = e.currentTarget.getBoundingClientRect()
                  if (e.clientX - rect.left < rect.width / 3) prevStory()
                  else nextStory()
                }}
              >
                <div aria-hidden className="story-deco">
                  <span /><span /><span />
                </div>
                <div className="wrap-layout">
                  <div className="wrap-lead">
                    <small className="wrap-kicker" style={{ "--d": 0 } as React.CSSProperties}>
                      {storyThemes[activeTag.color].kicker}
                    </small>
                    <h1 aria-label={activeTag.name} className="wrap-title">
                      {activeTag.name.split("").map((char, i) => (
                        <span
                          key={i}
                          style={{ "--i": i } as React.CSSProperties}
                        >
                          {char === " " ? "\u00a0" : char}
                        </span>
                      ))}
                    </h1>
                    {activeTodayTasks.length ? (
                      <p className="wrap-hero" style={{ "--d": 2 } as React.CSSProperties}>
                        <b>
                          <CountUp delay={700} value={activeTodayMinutes} />
                        </b>
                        <span>
                          minutes
                          <br />
                          invested
                        </span>
                      </p>
                    ) : (
                      <p className="wrap-hero quiet" style={{ "--d": 2 } as React.CSSProperties}>
                        <b>A quiet day.</b>
                        <span>
                          {todayReview.rests.includes(activeTagId)
                            ? "Intentional rest. Rhythm protected."
                            : "Resting on purpose? Mark it in the details."}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="wrap-side">
                    {topTodayTask && (
                      <div className="win-card" style={{ "--d": 3 } as React.CSSProperties}>
                        <svg className="win-badge" viewBox="0 0 100 100">
                          <defs>
                            <path
                              d="M50,50 m-37,0 a37,37 0 1,1 74,0 a37,37 0 1,1 -74,0"
                              id="win-circle"
                            />
                          </defs>
                          <text>
                            <textPath href="#win-circle">
                              BIGGEST WIN ★ BIGGEST WIN ★
                            </textPath>
                          </text>
                        </svg>
                        <span className="win-star">★</span>
                        <small>Biggest win</small>
                        <strong>{topTodayTask.title}</strong>
                        <em>{topTodayTask.duration} min of pure focus</em>
                      </div>
                    )}
                    <div className="wrap-stats">
                      {activeTodayTasks.length > 0 && (
                        <p style={{ "--d": 4 } as React.CSSProperties}>
                          <b>
                            <CountUp delay={1300} value={activeTodayTasks.length} />
                          </b>
                          <span>
                            {activeTodayTasks.length === 1 ? "task" : "tasks"} done
                          </span>
                        </p>
                      )}
                      <p style={{ "--d": 5 } as React.CSSProperties}>
                        <b>
                          <CountUp delay={1500} value={streak} />
                        </b>
                        <span>day rhythm</span>
                      </p>
                      <p style={{ "--d": 6 } as React.CSSProperties}>
                        <b>
                          <CountUp delay={1700} value={yearTotal} />
                        </b>
                        <span>this year</span>
                      </p>
                    </div>
                    {todayNote && (
                      <blockquote style={{ "--d": 7 } as React.CSSProperties}>“{todayNote}”</blockquote>
                    )}
                  </div>
                </div>
                <div aria-hidden className="wrap-marquee">
                  <div>
                    {Array.from({ length: 2 }, (_, copy) => (
                      <span key={copy}>
                        {[0, 1, 2].map((n) => (
                          <span key={n}>
                            {activeTag.name} <i>✦</i>{" "}
                            {storyThemes[activeTag.color].mood} <i>✦</i>{" "}
                            {streak} day rhythm <i>✦</i>{" "}
                          </span>
                        ))}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  className="swipe-hint"
                  onClick={() => setSheetOpen(true)}
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                  type="button"
                >
                  <span className="chev" />
                  Swipe up for details
                </button>
              </section>

              <form
                className="note-bar"
                key={`note-${activeTag.id}`}
                onSubmit={(e) => {
                  e.preventDefault()
                  const input = e.currentTarget.elements.namedItem(
                    "note",
                  ) as HTMLInputElement
                  saveNote(input.value.trim())
                  input.blur()
                }}
              >
                <input
                  aria-label={`Note for ${activeTag.name}`}
                  autoComplete="off"
                  defaultValue={todayNote}
                  name="note"
                  onBlur={() => setNoteFocused(false)}
                  onFocus={() => setNoteFocused(true)}
                  placeholder={`Note on ${activeTag.name}…`}
                />
                <Button aria-label="Save note" className="note-send" icon="check" type="submit" />
              </form>

              <section
                aria-hidden={!sheetOpen}
                className={`story-sheet ${sheetOpen ? "open" : ""}`}
              >
                <button
                  aria-label="Close details"
                  className="sheet-handle"
                  onClick={() => setSheetOpen(false)}
                  type="button"
                >
                  <span />
                </button>
                <div className="sheet-body">
                <section className="year-panel inline-year">
                  <div className="section-heading">
                    <div>
                      <small>Year at a glance</small>
                      <strong>From {heatmapStart.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</strong>
                    </div>
                    <span>Each square is one day</span>
                  </div>
                  <YearHeatmap
                    counts={activeCounts}
                    onSelect={selectHistoryDate}
                    rests={activeRestDates}
                    selectedDate={selectedHistoryDate}
                    start={heatmapStart}
                  />
                </section>
                <div className="progress-calendar-grid">
                  <section className="month-panel">
                    <div className="calendar-heading">
                      <div>
                        <small>Monthly rhythm</small>
                        <strong>
                          {historyMonth.toLocaleDateString("en-US", {
                            month: "long",
                            year: "numeric",
                          })}
                        </strong>
                      </div>
                      <div>
                        <Button
                          aria-label="Previous month"
                          className="icon-button"
                          icon="left"
                          onClick={() =>
                            setHistoryMonth(
                              (current) =>
                                new Date(
                                  current.getFullYear(),
                                  current.getMonth() - 1,
                                  1,
                                ),
                            )
                          }
                        />
                        <Button
                          aria-label="Next month"
                          className="icon-button"
                          icon="right"
                          onClick={() =>
                            setHistoryMonth(
                              (current) =>
                                new Date(
                                  current.getFullYear(),
                                  current.getMonth() + 1,
                                  1,
                                ),
                            )
                          }
                        />
                      </div>
                    </div>
                    <MonthCalendar
                      counts={activeCounts}
                      month={historyMonth}
                      onSelect={selectHistoryDate}
                      rests={activeRestDates}
                      selectedDate={selectedHistoryDate}
                    />
                  </section>
                  <aside className="compact-day-control">
                    <div>
                      <small>Selected day</small>
                      <strong>{selectedDateLabel}</strong>
                      <span
                        className={
                          selectedTagCount
                            ? "day-status active"
                            : selectedReview.rests.includes(activeTagId)
                              ? "day-status rest"
                              : "day-status"
                        }
                      >
                        {selectedTagCount
                          ? `${selectedTagCount} completed`
                          : selectedReview.rests.includes(activeTagId)
                            ? "Rest day"
                            : "No activity"}
                      </span>
                    </div>
                    <Button
                      className={`rest-toggle ${
                        selectedReview.rests.includes(activeTagId)
                          ? "active"
                          : ""
                      }`}
                      disabled={selectedTagCount > 0}
                      onClick={toggleRest}
                    >
                      {selectedTagCount
                        ? "Activity recorded from tasks"
                        : selectedReview.rests.includes(activeTagId)
                          ? "Marked as intentional rest"
                          : "Mark as intentional rest"}
                      {!selectedTagCount && (
                        <Icon
                          name={
                            selectedReview.rests.includes(activeTagId)
                              ? "check"
                              : "moon"
                          }
                          size={15}
                        />
                      )}
                    </Button>
                  </aside>
                </div>
                  <section className="done-list">
                    <div className="section-heading">
                      <div>
                        <small>Completed</small>
                        <strong>Tasks you finished</strong>
                      </div>
                      <span>{tagCompletedTasks.length} total</span>
                    </div>
                    {tagCompletedTasks.length ? (
                      <ul>
                        {tagCompletedTasks.map((task) => (
                          <li key={task.id}>
                            <Icon name="check" size={14} />
                            <strong>{task.title}</strong>
                            <span>
                              {new Date(task.completedAt!).toLocaleDateString(
                                "en-US",
                                { month: "short", day: "numeric" },
                              )}{" "}
                              · {task.duration} min
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
                  <Button
                    className="primary sheet-finish"
                    onClick={() => {
                      setView("home")
                      setToast("Today’s wrap is complete")
                    }}
                  >
                    Finish the day
                    <Icon name="check" size={16} />
                  </Button>
                </div>
              </section>
            </>
          ) : (
            <section className="wrapped-empty">
              <Icon name="sparkle" size={18} />
              <span>Create a project to start your wrap.</span>
            </section>
          )}
        </main>
      )}

      {scheduleTask && (
        <Modal close={() => setScheduleTask(null)}>
          <div className="modal-head">
            <div>
              <small>Choose a time</small>
              <h2>Schedule “{scheduleTask.title}”</h2>
            </div>
            <Button
              aria-label="Close"
              className="icon-button"
              icon="close"
              onClick={() => setScheduleTask(null)}
            />
          </div>
          <div className="day-toggle" role="tablist">
            {calDays.map((key) => (
              <button
                aria-selected={scheduleDay === key}
                className={scheduleDay === key ? "active" : ""}
                key={key}
                onClick={() => setScheduleDay(key)}
                role="tab"
                type="button"
              >
                {dayName(key, todayKey)}
              </button>
            ))}
          </div>
          <div className="time-options">
            {allHours
              .filter((hour) => scheduleDay !== todayKey || hour >= now.getHours())
              .map((hour) => {
                const project = slotProject(scheduleDay, hour)
                const ok = canPlace(scheduleTask, scheduleDay, hour)
                const count = scheduled.filter(
                  (t) => t.date === scheduleDay && t.hour === hour,
                ).length
                return (
                  <button
                    className={`${project ? `has-project ${project.color}` : ""} ${ok ? "" : "no"}`}
                    disabled={!ok}
                    key={hour}
                    onClick={() => schedule(scheduleTask.id, scheduleDay, hour)}
                    type="button"
                  >
                    <strong>{hourLabel(hour)}</strong>
                    <small>
                      {project
                        ? ok
                          ? `${project.name} hour`
                          : `Outlined for ${project.name}`
                        : "Open"}
                      {count ? ` · ${count} planned` : ""}
                    </small>
                    {ok && <Icon name="right" size={16} />}
                  </button>
                )
              })}
          </div>
        </Modal>
      )}
      {createSlot && (
        <Modal close={() => setCreateSlot(null)}>
          <div className="modal-head">
            <div>
              <small>New time block · {dayName(createSlot.date, todayKey)}</small>
              <h2>{hourLabel(createSlot.hour)}</h2>
            </div>
            <Button
              aria-label="Close"
              className="icon-button"
              icon="close"
              onClick={() => setCreateSlot(null)}
            />
          </div>
          <p className="modal-copy">
            This creates a task in your list and schedules it here.
          </p>
          <form className="modal-form" onSubmit={(e) => add(e, createSlot)}>
            <label htmlFor="scheduled-task">What do you want to work on?</label>
            <input
              autoFocus
              id="scheduled-task"
              onChange={(e) => setText(e.target.value)}
              placeholder="Name your task"
              value={text}
            />
            {slotProject(createSlot.date, createSlot.hour) ? (
              <div
                className={`modal-tag fixed ${slotProject(createSlot.date, createSlot.hour)!.color}`}
              >
                <span>{slotProject(createSlot.date, createSlot.hour)!.name}</span>
                <small>Outlined hour</small>
              </div>
            ) : (
              <button
                className={`modal-tag ${selectedTag?.color || "untagged"}`}
                onClick={() => setTagTarget("new")}
                type="button"
              >
                <span>{selectedTag?.name || "Choose a project"}</span>
                <Icon name="right" size={15} />
              </button>
            )}
            <Button className="primary" type="submit">
              Add to my day
              <Icon name="right" size={16} />
            </Button>
          </form>
        </Modal>
      )}
      {editTask && (
        <Modal close={() => setEditTask(null)}>
          <div className="modal-head">
            <div>
              <small>Edit task</small>
              <h2>{tasks.find((t) => t.id === editTask.id)?.title}</h2>
            </div>
            <Button
              aria-label="Close"
              className="icon-button"
              icon="close"
              onClick={() => setEditTask(null)}
            />
          </div>
          <form className="modal-form" onSubmit={saveTaskTitle}>
            <label htmlFor="edit-task-title">Name</label>
            <input
              autoFocus
              id="edit-task-title"
              onChange={(e) => setEditTask({ ...editTask, title: e.target.value })}
              value={editTask.title}
            />
            <Button className="primary" disabled={!editTask.title.trim()} type="submit">
              Save
            </Button>
          </form>
          <button
            className={`delete-task ${confirmDelete ? "confirm" : ""}`}
            onClick={() => {
              if (!confirmDelete) return setConfirmDelete(true)
              deleteTask(editTask.id)
            }}
            type="button"
          >
            {confirmDelete ? "Tap again to delete this task" : "Delete task"}
          </button>
        </Modal>
      )}
      {moreOpen && (
        <Modal close={() => setMoreOpen(false)}>
          <div className="modal-head">
            <div>
              <small>Test build</small>
              <h2>One</h2>
            </div>
            <Button
              aria-label="Close"
              className="icon-button"
              icon="close"
              onClick={() => setMoreOpen(false)}
            />
          </div>
          <p className="modal-copy">
            Everything you add is saved in this browser on this device only. It
            isn’t synced or sent anywhere.
          </p>
          <div className="more-actions">
            <button
              className={`more-row ${confirmReset ? "danger" : ""}`}
              onClick={() => {
                if (!confirmReset) return setConfirmReset(true)
                setTags(starterTags)
                setTasks(withDates(seed))
                setOutlines({})
                setReviews({})
                setSelectedTagId(starterTags[0].id)
                setOutlineDate(todayKey)
                setCalStart(todayKey)
                setConfirmReset(false)
                setMoreOpen(false)
                setView("home")
                setToast("Sample data restored")
              }}
              type="button"
            >
              <span>
                <strong>
                  {confirmReset ? "Tap again to erase everything" : "Reset to sample data"}
                </strong>
                <small>
                  Removes your projects, tasks and outlines, and restores the examples.
                </small>
              </span>
            </button>
          </div>
        </Modal>
      )}
      {tagTarget !== null && (
        <Modal
          close={() => {
            setTagTarget(null)
            setManageTags(false)
          }}
        >
          <div className="modal-head">
            <div>
              <small>Color with meaning</small>
              <h2>{manageTags ? "Manage projects" : "Choose a project"}</h2>
            </div>
            <Button
              aria-label="Close"
              className="icon-button"
              icon="close"
              onClick={() => {
                setTagTarget(null)
                setManageTags(false)
              }}
            />
          </div>
          {!manageTags ? (
            <>
              <div className="tag-options">
                {tags.map((tag) => (
                  <button
                    className={tag.color}
                    key={tag.id}
                    onClick={() => assignTag(tag.id)}
                    type="button"
                  >
                    <i />
                    <span>{tag.name}</span>
                    <Icon name="right" size={15} />
                  </button>
                ))}
              </div>
              <button
                className="manage-tags"
                onClick={() => setManageTags(true)}
                type="button"
              >
                Manage projects
              </button>
            </>
          ) : (
            <>
              <div className="tag-manager">
                {tags.map((tag) => (
                  <div className="tag-row" key={tag.id}>
                    <i className={tag.color} />
                    <input
                      aria-label={`Rename ${tag.name}`}
                      onChange={(e) =>
                        setTags((all) =>
                          all.map((item) =>
                            item.id === tag.id
                              ? { ...item, name: e.target.value }
                              : item,
                          ),
                        )
                      }
                      value={tag.name}
                    />
                    <div className="color-options">
                      {palette.map((color) => (
                        <button
                          aria-label={`Make ${tag.name} ${color}`}
                          className={`${color} ${
                            tag.color === color ? "active" : ""
                          }`}
                          key={color}
                          onClick={() =>
                            setTags((all) =>
                              all.map((item) =>
                                item.id === tag.id ? { ...item, color } : item,
                              ),
                            )
                          }
                          type="button"
                        />
                      ))}
                    </div>
                    <button
                      aria-label={`Delete ${tag.name}`}
                      className="delete-tag"
                      onClick={() => deleteTag(tag.id)}
                      type="button"
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <form className="new-tag" onSubmit={addTag}>
                <input
                  aria-label="New project name"
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="New project name"
                  value={newTagName}
                />
                <Button className="primary" type="submit">
                  <Icon name="plus" size={15} />
                  Add project
                </Button>
              </form>
              <button
                className="manage-tags"
                onClick={() => setManageTags(false)}
                type="button"
              >
                Back to projects
              </button>
            </>
          )}
        </Modal>
      )}
      {taskDrag && dragTask && (
        <div
          aria-hidden
          className={`task-ghost ${tagFor(dragTask)?.color || "untagged"} ${
            taskDrag.target && !canPlace(dragTask, taskDrag.target.date, taskDrag.target.hour)
              ? "no"
              : ""
          }`}
          style={{ left: taskDrag.x, top: taskDrag.y }}
        >
          <i />
          <span>{dragTask.title}</span>
          {taskDrag.target && (
            <small>
              {canPlace(dragTask, taskDrag.target.date, taskDrag.target.hour)
                ? `${dayName(taskDrag.target.date, todayKey).slice(0, 3)} ${hourLabel(taskDrag.target.hour)}`
                : `${slotProject(taskDrag.target.date, taskDrag.target.hour)?.name} only`}
            </small>
          )}
        </div>
      )}
      {toast && (
        <div className="toast" key={toastState?.id} role="status">
          <span>
            <Icon name="check" size={14} />
          </span>
          {toast}
          {toastState?.undo && (
            <button
              className="toast-undo"
              onClick={() => {
                toastState.undo!()
                setToast("Undone")
              }}
              type="button"
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  )
}
