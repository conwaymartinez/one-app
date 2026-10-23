export default function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    left: <path d="m15 18-6-6 6-6" />,
    right: <path d="m9 18 6-6-6-6" />,
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    eraser: (
      <>
        <path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l9.6-9.6a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 21" />
        <path d="M22 21H7M5 11l9 9" />
      </>
    ),
    grip: <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />,
    list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
    moon: <path d="M20.5 15.5A9 9 0 0 1 8.5 3.5a9 9 0 1 0 12 12Z" />,
    plus: <path d="M12 5v14M5 12h14" />,
    more: (
      <>
        <circle cx="5" cy="12" fill="currentColor" r="1.7" stroke="none" />
        <circle cx="12" cy="12" fill="currentColor" r="1.7" stroke="none" />
        <circle cx="19" cy="12" fill="currentColor" r="1.7" stroke="none" />
      </>
    ),
    sparkle: (
      <path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3Z" />
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
    flame: (
      <path d="M13 22c4-1 7-4.5 7-9 0-3-1.5-5.5-4-7 .2 2.5-.8 4-2.2 4.7.2-3.8-2-6.4-5.3-8.7.2 4-4.5 6.7-4.5 11 0 4.5 3 8 7 9-1.8-1.2-2.5-2.8-2-4.7.4-1.5 1.5-2.5 2.7-3.4-.1 2 .8 3.1 2 3.8.8-1 1.2-2.1 1.1-3.5 1.4 1.2 2.2 2.7 2.2 4.2 0 1.5-.7 2.7-2 3.6" />
    ),
  }
  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      {paths[name]}
    </svg>
  )
}
