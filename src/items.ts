import type { Note, Task } from "./types"

/**
 * One list for everything (saved in `one-notes`). The Planner still works with
 * `Task` objects; they are a view of the notes that have a length.
 */

type Update<T> = T | ((current: T) => T)

const dateKey = /^\d{4}-\d{2}-\d{2}$/

/** A note with a length is a task. */
export function isTaskItem(note: Note) {
  return typeof note.duration === "number"
}

/** Still in Park: no length, not done. */
export function isParked(note: Note) {
  return !isTaskItem(note) && !note.doneAt
}

/** Parked notes, newest first. */
export function parkedNotes(all: Note[]): Note[] {
  return all
    .filter(isParked)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
}

export function toTask(note: Note): Task {
  const task: Task = {
    id: note.id,
    title: note.text,
    duration: note.duration ?? 30,
    tagId: note.tagId ?? null,
    completed: !!note.completed,
  }
  if (note.hour !== undefined) task.hour = note.hour
  if (note.date !== undefined) task.date = note.date
  if (note.completedAt !== undefined) task.completedAt = note.completedAt
  if (note.archived) task.archived = true
  if (note.carried) task.carried = true
  if (note.example) task.example = true
  return task
}

/** A task written back as a note, keeping when it was first parked. */
export function fromTask(task: Task, previous?: Note): Note {
  const note: Note = {
    id: task.id,
    text: task.title,
    tagId: task.tagId ?? null,
    createdAt: previous?.createdAt ?? new Date(task.id > 1e11 ? task.id : Date.now()).toISOString(),
    duration: task.duration,
    completed: task.completed,
  }
  if (task.hour !== undefined) note.hour = task.hour
  if (task.date !== undefined) note.date = task.date
  if (task.completedAt !== undefined) note.completedAt = task.completedAt
  if (task.archived) note.archived = true
  if (task.carried) note.carried = true
  if (task.example) note.example = true
  return note
}

/** The task view of the list, in saved order. */
export function taskList(all: Note[]): Task[] {
  return all.filter(isTaskItem).map(toTask)
}

/** Apply a change made to the task view back onto the one list. */
export function applyTasks(all: Note[], update: Update<Task[]>): Note[] {
  const current = taskList(all)
  const next = typeof update === "function" ? update(current) : update
  if (next === current) return all
  const byId = new Map(all.map((note) => [note.id, note]))
  const ids = new Set(next.map((task) => task.id))
  const rest = all.filter((note) => !isTaskItem(note) && !ids.has(note.id))
  return [...rest, ...next.map((task) => fromTask(task, byId.get(task.id)))]
}

/** Apply a change made to the parked view back onto the one list. */
export function applyNotes(all: Note[], update: Update<Note[]>): Note[] {
  const current = parkedNotes(all)
  const next = typeof update === "function" ? update(current) : update
  if (next === current) return all
  const ids = new Set(next.map((note) => note.id))
  const others = all.filter((note) => !isParked(note) && !ids.has(note.id))
  return [...next, ...others]
}

/** Change one note in place (same id, same place in the list). */
export function patchItem(all: Note[], id: number, change: (note: Note) => Note): Note[] {
  return all.map((note) => (note.id === id ? change(note) : note))
}

/** Give a note a length (and optionally a slot): it becomes a task. */
export function scheduleNote(
  note: Note,
  tagId: string | null,
  duration: number,
  slot?: { date: string; hour: number },
): Note {
  const next: Note = { ...note, tagId, duration, completed: false }
  delete next.doneAt
  if (slot) {
    next.date = slot.date
    next.hour = slot.hour
  }
  return next
}

/** Validate one saved note. Fields that are missing stay missing. */
export function cleanItem(raw: unknown, today: string): Note | null {
  const n = raw as Record<string, unknown> | null
  if (!n || typeof n !== "object" || typeof n.id !== "number" || typeof n.text !== "string")
    return null
  const note: Note = {
    id: n.id,
    text: n.text,
    tagId: typeof n.tagId === "string" ? n.tagId : null,
    createdAt: typeof n.createdAt === "string" ? n.createdAt : new Date().toISOString(),
  }
  if (typeof n.duration === "number" && isFinite(n.duration) && n.duration > 0) {
    note.duration = n.duration
    note.completed = n.completed === true
    if (typeof n.hour === "number" && Number.isInteger(n.hour) && n.hour >= 0 && n.hour < 24) {
      note.hour = n.hour
      // Scheduled before dates existed: today.
      note.date = typeof n.date === "string" && dateKey.test(n.date) ? n.date : today
    }
    if (typeof n.completedAt === "string") note.completedAt = n.completedAt
    if (n.archived === true) note.archived = true
    if (n.carried === true) note.carried = true
    if (n.example === true) note.example = true
  }
  if (typeof n.doneAt === "string") note.doneAt = n.doneAt
  return note
}

/** Read the one list. `null` means nothing was ever saved (a first visit). */
export function readItems(saved: string | null, today: string): Note[] | null {
  if (saved === null) return null
  try {
    const parsed: unknown = JSON.parse(saved)
    if (!Array.isArray(parsed)) return []
    const seen = new Set<number>()
    const items: Note[] = []
    for (const raw of parsed) {
      const note = cleanItem(raw, today)
      if (note && !seen.has(note.id)) {
        seen.add(note.id)
        items.push(note)
      }
    }
    return items
  } catch {
    return []
  }
}
