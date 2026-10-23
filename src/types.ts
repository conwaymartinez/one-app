export type Color = "sage" | "peach" | "lavender" | "blue"
export type Tag = { id: string; name: string; color: Color }
/** One day's outline: a focus tag in the center and a tag per hour (0–23). */
export type DayOutline = { focus: string | null; hours: Record<number, string> }
