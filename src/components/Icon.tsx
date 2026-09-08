/** Единый набор иконок в стиле Lucide: viewBox 24, обводка 1.7, без заливки.
 *  Эмодзи в роли иконок не используем. */
const PATHS = {
  arrow: 'M5 12h13M13 6.6 18.4 12 13 17.4',
  arrowUpRight: 'M7 17 17 7M8 7h9v9',
  arrowLeft: 'M19 12H6M11 6.6 5.6 12 11 17.4',
  arrowDown: 'M12 5v13M6.6 13 12 18.4 17.4 13',
  arrowUp: 'M12 19V6M6.6 11 12 5.6 17.4 11',
  phone: 'M6.5 3h3l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5L16 12l4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4 6.2 2 2 0 0 1 6 4z',
  whatsapp: 'M12 3a9 9 0 0 0-7.7 13.7L3 21l4.4-1.2A9 9 0 1 0 12 3zM8.6 8.2c.2-.4.4-.4.6-.4h.5c.2 0 .4 0 .6.5l.8 1.8c.1.2 0 .4-.1.6l-.4.5c-.2.2-.3.4-.1.7a7 7 0 0 0 3.1 2.7c.3.1.5.1.7-.1l.6-.7c.2-.2.4-.2.6-.1l1.7.8c.2.1.4.2.4.4v.6c0 .5-.5 1.1-1 1.2-.5.2-1.2.2-3.3-.7a11 11 0 0 1-4.5-4c-.4-.6-.9-1.6-.9-2.5 0-.9.5-1.3.7-1.5z',
  mail: 'M3 6.5h18v11H3zM3 7l9 6 9-6',
  check: 'M4.5 12.5 9.5 17.5 19.5 6.5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  search: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM16.2 16.2 21 21',
  clock: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 7v5.2l3.3 2',
  pin: 'M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  wallet: 'M3 7.5h15a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7.5V7a2 2 0 0 1 2-2h11M16.5 13h.01',
  shield: 'M12 3 20 6v6c0 4.5-3.4 7.6-8 9-4.6-1.4-8-4.5-8-9V6z',
  chevron: 'M6 9.5 12 15.5 18 9.5',
  x: 'M6 6l12 12M18 6 6 18',
  star: 'm12 4 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7 1-5.6-4.1-4 5.6-.8z',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6.2 6.2l2.8 2.8M15 15l2.8 2.8M17.8 6.2 15 9M9 15l-2.8 2.8',
  tools: 'M14.5 5.5a3.5 3.5 0 0 0 4.6 4.6L21 12l-9 9-3-3 9-9zM7.5 3 4 6.5 6 10l3-1 1-3z',
  home: 'M4 10.5 12 4l8 6.5V20H4z',
  truck: 'M3 7h11v9H3zM14 10.5h4l3 3V16h-7zM7 19a1.6 1.6 0 1 0 0-3.2A1.6 1.6 0 0 0 7 19zM17.5 19a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z',
  sparkles: 'M12 3l1.4 3.6L17 8l-3.6 1.4L12 13l-1.4-3.6L7 8l3.6-1.4zM18 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z',
} as const

export type IconName = keyof typeof PATHS

export default function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className} width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.7}
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
