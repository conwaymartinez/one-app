import { useCallback, useEffect, useRef, useState } from "react"
import type { Color, DailyReview, DayOutline, Tag, Task } from "./types"

/**
 * Optional sync through a secret GitHub Gist.
 *
 * Every tag, task, day outline and day review is one "entry" with an
 * `updatedAt` time. Devices merge entry by entry (newest wins; deletions are
 * kept as tombstones), so existing saved data and its shapes are unchanged.
 * The token and gist id live only in this browser's localStorage.
 */

export type SyncData = {
  tags: Tag[]
  tasks: Task[]
  outlines: Record<string, DayOutline>
  reviews: Record<string, DailyReview>
}

type Entry = { t: number; d?: true; v?: unknown }
type Entries = Record<string, Entry>
/** Saved on this device: only times and deletions, never the data itself. */
type Meta = Record<string, { t: number; d?: true }>
type Config = { token: string; gistId?: string; lastSyncedAt?: number }

export type SyncStatus = "off" | "idle" | "syncing" | "error"

const CONFIG_KEY = "one-sync-config"
const META_KEY = "one-sync-meta"
const GIST_DESCRIPTION = "one-app-sync"
const GIST_FILE = "one-data.json"
const API = "https://api.github.com"
const PUSH_DELAY = 2000
const POLL_MS = 3 * 60 * 1000
const palette: Color[] = ["lavender", "blue", "peach", "sage"]
const dateKey = /^\d{4}-\d{2}-\d{2}$/

function readJson<T>(key: string, fallback: T): T {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "")
    return parsed && typeof parsed === "object" ? (parsed as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked; sync still works for this session.
  }
}

function loadConfig(): Config | null {
  const config = readJson<Partial<Config>>(CONFIG_KEY, {})
  return typeof config.token === "string" && config.token
    ? (config as Config)
    : null
}

/** Flatten app state into entries, using remembered update times. */
function toValues(data: SyncData): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const tag of data.tags) values[`tag:${tag.id}`] = tag
  for (const task of data.tasks) {
    if (!task.example) values[`task:${task.id}`] = task
  }
  for (const [day, outline] of Object.entries(data.outlines))
    values[`outline:${day}`] = outline
  for (const [day, review] of Object.entries(data.reviews))
    values[`review:${day}`] = review
  return values
}

function sameEntry(a: Entry | undefined, b: Entry | undefined) {
  if (!a || !b) return a === b
  return (
    a.t === b.t &&
    !!a.d === !!b.d &&
    JSON.stringify(a.v ?? null) === JSON.stringify(b.v ?? null)
  )
}

export function sameEntries(a: Entries, b: Entries) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) if (!sameEntry(a[key], b[key])) return false
  return true
}

/** Newest entry wins; on a tie the local one is kept. */
export function mergeEntries(local: Entries, remote: Entries): Entries {
  const merged: Entries = {}
  for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const a = local[key]
    const b = remote[key]
    merged[key] = !a ? b : !b ? a : b.t > a.t ? b : a
  }
  return merged
}

function isTag(value: any): value is Tag {
  return (
    !!value &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    palette.includes(value.color)
  )
}

function isTask(value: any): value is Task {
  return (
    !!value &&
    typeof value.id === "number" &&
    typeof value.title === "string" &&
    typeof value.duration === "number" &&
    typeof value.completed === "boolean"
  )
}

function isOutline(value: any): value is DayOutline {
  return (
    !!value &&
    typeof value === "object" &&
    (value.focus === null || typeof value.focus === "string") &&
    !!value.hours &&
    typeof value.hours === "object"
  )
}

function isReview(value: any): value is DailyReview {
  return !!value && typeof value === "object" && Array.isArray(value.rests)
}

/** Keep remote entries that look like real data; drop anything malformed. */
export function cleanRemote(raw: unknown): Entries {
  const items = (raw as { items?: unknown } | null)?.items
  const clean: Entries = {}
  if (!items || typeof items !== "object") return clean
  for (const [key, entry] of Object.entries(items as Record<string, any>)) {
    if (!entry || typeof entry.t !== "number" || !isFinite(entry.t)) continue
    if (entry.d === true) {
      clean[key] = { t: entry.t, d: true }
      continue
    }
    const [kind, ...rest] = key.split(":")
    const id = rest.join(":")
    const ok =
      (kind === "tag" && isTag(entry.v)) ||
      (kind === "task" && isTask(entry.v)) ||
      (kind === "outline" && dateKey.test(id) && isOutline(entry.v)) ||
      (kind === "review" && dateKey.test(id) && isReview(entry.v))
    if (ok) clean[key] = { t: entry.t, v: entry.v }
  }
  return clean
}

/** Turn merged entries back into app state, keeping local order and examples. */
export function materialize(merged: Entries, local: SyncData): SyncData {
  const live = (key: string) => (merged[key] && !merged[key].d ? merged[key].v : undefined)

  const tags: Tag[] = []
  const seenTags = new Set<string>()
  for (const tag of local.tags) {
    const value = live(`tag:${tag.id}`) as Tag | undefined
    if (value) tags.push(value)
    seenTags.add(tag.id)
  }
  const tasks: Task[] = []
  const seenTasks = new Set<number>()
  for (const task of local.tasks) {
    if (task.example) {
      tasks.push(task)
      continue
    }
    const value = live(`task:${task.id}`) as Task | undefined
    if (value) tasks.push(value)
    seenTasks.add(task.id)
  }
  const outlines: Record<string, DayOutline> = {}
  const reviews: Record<string, DailyReview> = {}
  for (const key of Object.keys(merged)) {
    const value = live(key)
    if (value === undefined) continue
    const [kind, ...rest] = key.split(":")
    const id = rest.join(":")
    if (kind === "tag" && !seenTags.has(id)) tags.push(value as Tag)
    if (kind === "task" && !seenTasks.has(Number(id))) tasks.push(value as Task)
    if (kind === "outline") outlines[id] = value as DayOutline
    if (kind === "review") reviews[id] = value as DailyReview
  }
  return { tags, tasks, outlines, reviews }
}

async function github(
  config: Config,
  path: string,
  init: RequestInit = {},
): Promise<any> {
  const res = await fetch(path.startsWith("http") ? path : API + path, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  })
  if (res.status === 401) throw new Error("GitHub rejected the token.")
  if (res.status === 403 || res.status === 429)
    throw new Error("GitHub is rate limiting this token. Try again later.")
  if (res.status === 404) throw new Error("Synced gist not found.")
  if (!res.ok) throw new Error(`GitHub error ${res.status}.`)
  return res.json()
}

/** Find the gist this app created, or make a new secret one. */
async function findOrCreateGist(config: Config): Promise<string> {
  for (let page = 1; page <= 5; page++) {
    const gists = await github(config, `/gists?per_page=100&page=${page}`)
    if (!Array.isArray(gists)) break
    const found = gists.find(
      (gist: any) => gist.description === GIST_DESCRIPTION && gist.files?.[GIST_FILE],
    )
    if (found) return found.id
    if (gists.length < 100) break
  }
  const created = await github(config, "/gists", {
    method: "POST",
    body: JSON.stringify({
      description: GIST_DESCRIPTION,
      public: false,
      files: { [GIST_FILE]: { content: JSON.stringify({ version: 1, items: {} }) } },
    }),
  })
  return created.id
}

async function pullRemote(config: Config, gistId: string): Promise<Entries> {
  const gist = await github(config, `/gists/${gistId}`)
  const file = gist.files?.[GIST_FILE]
  if (!file) return {}
  let text: string = file.content ?? ""
  if (file.truncated && file.raw_url) {
    const res = await fetch(file.raw_url, { cache: "no-store" })
    text = await res.text()
  }
  try {
    return cleanRemote(JSON.parse(text))
  } catch {
    return {}
  }
}

export function useSync(
  data: SyncData,
  apply: (next: SyncData) => void,
  onRemoteChange?: () => void,
) {
  const [config, setConfig] = useState<Config | null>(loadConfig)
  const [status, setStatus] = useState<SyncStatus>(config ? "idle" : "off")
  const [error, setError] = useState("")
  const [lastSyncedAt, setLastSyncedAt] = useState<number | undefined>(
    config?.lastSyncedAt,
  )

  const dataRef = useRef(data)
  dataRef.current = data
  const applyRef = useRef(apply)
  applyRef.current = apply
  const notifyRef = useRef(onRemoteChange)
  notifyRef.current = onRemoteChange
  const configRef = useRef(config)
  configRef.current = config

  // What each entry looked like last time we noticed it, as JSON text.
  const seen = useRef<Record<string, string> | null>(null)
  const meta = useRef<Meta>({})
  const metaLoaded = useRef(false)
  const pushTimer = useRef<number | undefined>(undefined)
  const running = useRef(false)
  const again = useRef(false)

  /** Stamp changed or deleted entries with the current time. */
  const track = useCallback((next: SyncData) => {
    if (!metaLoaded.current) {
      meta.current = readJson<Meta>(META_KEY, {})
      metaLoaded.current = true
    }
    const values = toValues(next)
    const now = Date.now()
    let changed = false
    if (seen.current === null) {
      // First look at this session: nothing changed yet, just remember.
      seen.current = {}
      for (const [key, value] of Object.entries(values))
        seen.current[key] = JSON.stringify(value)
      return false
    }
    for (const [key, value] of Object.entries(values)) {
      const json = JSON.stringify(value)
      if (seen.current[key] !== json) {
        meta.current[key] = { t: now }
        seen.current[key] = json
        changed = true
      }
    }
    for (const key of Object.keys(seen.current)) {
      if (!(key in values)) {
        meta.current[key] = { t: now, d: true }
        delete seen.current[key]
        changed = true
      }
    }
    if (changed) writeJson(META_KEY, meta.current)
    return changed
  }, [])

  /** Current local state as entries; untracked items count as time 0. */
  const localEntries = useCallback((): Entries => {
    const entries: Entries = {}
    const values = toValues(dataRef.current)
    for (const [key, value] of Object.entries(values)) {
      const known = meta.current[key]
      entries[key] = { t: known && !known.d ? known.t : 0, v: value }
    }
    for (const [key, entry] of Object.entries(meta.current)) {
      if (entry.d && !(key in values)) entries[key] = { t: entry.t, d: true }
    }
    return entries
  }, [])

  const sync = useCallback(async () => {
    const current = configRef.current
    if (!current) return
    if (running.current) {
      again.current = true
      return
    }
    running.current = true
    window.clearTimeout(pushTimer.current)
    setStatus("syncing")
    try {
      let gistId = current.gistId
      if (!gistId) {
        gistId = await findOrCreateGist(current)
        const saved = { ...current, gistId }
        configRef.current = saved
        writeJson(CONFIG_KEY, saved)
        setConfig(saved)
      }
      const remote = await pullRemote(configRef.current!, gistId)
      // Everything below is synchronous, so no edit can slip in between.
      track(dataRef.current)
      const local = localEntries()
      const merged = mergeEntries(local, remote)

      if (!sameEntries(merged, local)) {
        const next = materialize(merged, dataRef.current)
        for (const [key, value] of Object.entries(toValues(next)))
          seen.current![key] = JSON.stringify(value)
        for (const key of Object.keys(seen.current!))
          if (!(key in toValues(next))) delete seen.current![key]
        applyRef.current(next)
        notifyRef.current?.()
      }
      meta.current = Object.fromEntries(
        Object.entries(merged).map(([key, entry]) => [
          key,
          entry.d ? { t: entry.t, d: true as const } : { t: entry.t },
        ]),
      )
      writeJson(META_KEY, meta.current)

      if (!sameEntries(merged, remote)) {
        await github(configRef.current!, `/gists/${gistId}`, {
          method: "PATCH",
          body: JSON.stringify({
            files: {
              [GIST_FILE]: {
                content: JSON.stringify({ version: 1, items: merged }),
              },
            },
          }),
        })
      }
      const at = Date.now()
      const saved = { ...configRef.current!, lastSyncedAt: at }
      configRef.current = saved
      writeJson(CONFIG_KEY, saved)
      setLastSyncedAt(at)
      setError("")
      setStatus("idle")
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "Offline. Will retry."
          : e instanceof Error
            ? e.message
            : "Sync failed.",
      )
      setStatus("error")
    } finally {
      running.current = false
      if (again.current) {
        again.current = false
        window.setTimeout(sync, 500)
      }
    }
  }, [track, localEntries])

  // Notice local edits, and push shortly after.
  useEffect(() => {
    const changed = track(data)
    if (changed && configRef.current) {
      window.clearTimeout(pushTimer.current)
      pushTimer.current = window.setTimeout(sync, PUSH_DELAY)
    }
  }, [data, track, sync])

  // Pull on open, when the tab comes back, when back online, and every few minutes.
  const connected = !!config
  useEffect(() => {
    if (!connected) return
    sync()
    const onVisible = () => {
      if (document.visibilityState === "visible") sync()
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") sync()
    }, POLL_MS)
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("online", sync)
    return () => {
      window.clearInterval(timer)
      window.clearTimeout(pushTimer.current)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("online", sync)
    }
  }, [connected, sync])

  const connect = useCallback((token: string) => {
    const next: Config = { token: token.trim() }
    if (!next.token) return
    configRef.current = next
    writeJson(CONFIG_KEY, next)
    setConfig(next)
    setError("")
    setStatus("syncing")
  }, [])

  const disconnect = useCallback(() => {
    window.clearTimeout(pushTimer.current)
    configRef.current = null
    try {
      localStorage.removeItem(CONFIG_KEY)
      localStorage.removeItem(META_KEY)
    } catch {}
    meta.current = {}
    seen.current = null
    setConfig(null)
    setLastSyncedAt(undefined)
    setError("")
    setStatus("off")
  }, [])

  return { connected, status, error, lastSyncedAt, connect, disconnect, syncNow: sync }
}
