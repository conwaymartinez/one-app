export type Color = "sage" | "peach" | "lavender" | "blue"
export type Tag = { id: string; name: string; color: Color }
/** One day's outline: a focus tag in the center and a tag per hour (0–23). */
export type DayOutline = { focus: string | null; hours: Record<number, string> }

export type Task = {
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
  /** Swiped away to the right: hidden from the list, kept on the calendar. */
  archived?: boolean
}

/** A non-project label for an hour in the daily review. */
export type LifeLabel = "life:sick" | "life:commute" | "life:interrupted"

/** End-of-day review, keyed by local YYYY-MM-DD in `one-cooldown-reviews`. */
export type DailyReview = {
  /** Projects marked as intentional rest on this day (History). */
  rests: string[]
  /** Older per-project notes; kept so saved data still loads. */
  notes?: Record<string, string>
  /** What really happened, per hour: a project id or a LifeLabel. Only hours that differ from the outline are stored. */
  actualHours?: Record<number, string>
  /** One note for the whole day. */
  dayNote?: string
  /** ISO time the day was confirmed in the review. */
  confirmedAt?: string
}

/** How much planning the user has room for right now: the depth slider. Saved in `one-depth`. */
export type Depth = "park" | "outline" | "plan"

/**
 * Everything is a note, saved in `one-notes`. A note with a `duration` is a task
 * (listed in the Planner); one that also has a `date` and `hour` sits on the calendar.
 * A note with no duration is parked. All extra fields are optional, so notes saved
 * before this change load unchanged.
 */
export type Note = {
  id: number
  text: string
  /** Project chosen on the Outline, if any. */
  tagId?: string | null
  /** ISO time it was parked. */
  createdAt: string
  /** Minutes. Set = this note is a task. */
  duration?: number
  completed?: boolean
  hour?: number
  /** Local YYYY-MM-DD of the scheduled hour. */
  date?: string
  completedAt?: string
  archived?: boolean
  carried?: boolean
  /** Sample task shipped with the test build (never synced). */
  example?: boolean
  /** ISO time a parked note was swiped done. Done notes leave Park. */
  doneAt?: string
}
