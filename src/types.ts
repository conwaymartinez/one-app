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
