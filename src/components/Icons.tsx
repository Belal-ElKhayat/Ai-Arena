import type { ReactNode, SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }
const base = (size = 16): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
})

const make = (paths: ReactNode) =>
  function Icon({ size, ...rest }: P) {
    return (
      <svg {...base(size)} {...rest}>
        {paths}
      </svg>
    )
  }

export const IconLock = make(<><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>)
export const IconPlay = make(<path d="M7 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L8.5 4.64A1 1 0 0 0 7 5.5Z" fill="currentColor" stroke="none" />)
export const IconPause = make(<><rect x="6.5" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" stroke="none" /><rect x="13.9" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" stroke="none" /></>)
export const IconFlag = make(<><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>)
export const IconRefresh = make(<><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>)
export const IconSwap = make(<><path d="M7 4 3 8l4 4" /><path d="M3 8h14" /><path d="m17 20 4-4-4-4" /><path d="M21 16H7" /></>)
export const IconShuffle = make(<><path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="m15 15 6 6" /><path d="M4 4l5 5" /></>)
export const IconCube = make(<><path d="M12 3 4 7.5v9L12 21l8-4.5v-9Z" /><path d="M4 7.5 12 12l8-4.5" /><path d="M12 12v9" /></>)
export const IconPalette = make(<><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.5-1.6 0-1.2-1-1.6-1-2.6 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5C21 6.4 17 3 12 3Z" /><circle cx="7.5" cy="11" r="1" fill="currentColor" /><circle cx="10" cy="7" r="1" fill="currentColor" /><circle cx="15" cy="7" r="1" fill="currentColor" /></>)
export const IconVolume = make(<><path d="M4 9.5v5h3.5L12 18V6L7.5 9.5Z" /><path d="M16 9a4 4 0 0 1 0 6" /><path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" /></>)
export const IconMute = make(<><path d="M4 9.5v5h3.5L12 18V6L7.5 9.5Z" /><path d="m16 9.5 5 5" /><path d="m21 9.5-5 5" /></>)
export const IconHistory = make(<><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v4h4" /><path d="M12 8v4l3 2" /></>)
export const IconSettings = make(<><path d="M4 7h10" /><path d="M18 7h2" /><circle cx="16" cy="7" r="2" /><path d="M4 17h4" /><path d="M12 17h8" /><circle cx="10" cy="17" r="2" /></>)
export const IconList = make(<><path d="M9 6h11" /><path d="M9 12h11" /><path d="M9 18h11" /><path d="M4 6h.01" /><path d="M4 12h.01" /><path d="M4 18h.01" /></>)
export const IconDownload = make(<><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></>)
export const IconCopy = make(<><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>)
export const IconClose = make(<><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>)
export const IconChevron = make(<path d="m6 9 6 6 6-6" />)
export const IconChevronLeft = make(<path d="m15 6-6 6 6 6" />)
export const IconChevronRight = make(<path d="m9 6 6 6-6 6" />)
export const IconSearch = make(<><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>)
export const IconCheck = make(<path d="m5 12.5 4.5 4.5L19 7.5" />)
export const IconAlert = make(<><path d="M12 4 2.5 20h19Z" /><path d="M12 10v4" /><path d="M12 17h.01" /></>)
export const IconKey = make(<><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9" /><path d="m17 6 3 3" /><path d="m15 8 2 2" /></>)
export const IconSpark = make(<path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7Z" />)
export const IconGauge = make(<><path d="M4.5 17a8.5 8.5 0 1 1 15 0" /><path d="m12 13 4-4" /><circle cx="12" cy="13" r="1.3" fill="currentColor" /></>)
export const IconSkipBack = make(<><path d="M6 5v14" /><path d="m18 6-9 6 9 6Z" /></>)
export const IconSkipFwd = make(<><path d="M18 5v14" /><path d="m6 6 9 6-9 6Z" /></>)
export const IconTrophy = make(<><path d="M8 4h8v5a4 4 0 0 1-8 0Z" /><path d="M8 6H5a3 3 0 0 0 3 4" /><path d="M16 6h3a3 3 0 0 1-3 4" /><path d="M12 13v4" /><path d="M8 20h8" /><path d="M9.5 17h5" /></>)
export const IconChat = make(<><path d="M4 5.5h11a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2Z" /><path d="M19 9h1a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1v3l-4-3h-3" /></>)
export const IconKnight = make(<><path d="M8 20h10" /><path d="M9 20c0-3 1-4.5 3-6l-3.5-.5L7 15l-2-2 4-6c1-1.6 2.5-3 5-3 3 0 5 2.4 5 6.5V20" /><circle cx="12.5" cy="8" r=".8" fill="currentColor" /></>)
export const IconGrid = make(<><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></>)
export const IconCards = make(<><rect x="3" y="6" width="10" height="14" rx="2" transform="rotate(-8 8 13)" /><rect x="10" y="4" width="10" height="14" rx="2" transform="rotate(8 15 11)" /></>)
export const IconDiscs = make(<><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="8" cy="9" r="1.6" /><circle cx="12" cy="9" r="1.6" /><circle cx="16" cy="9" r="1.6" /><circle cx="8" cy="15" r="1.6" fill="currentColor" /><circle cx="12" cy="15" r="1.6" /><circle cx="16" cy="15" r="1.6" fill="currentColor" /></>)
export const IconMic = make(<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0" /><path d="M12 17.5V21" /></>)
export const IconGavel = make(<><path d="m14 4 6 6" /><path d="m11 7 6 6" /><path d="m12.5 5.5-4 4 6 6 4-4" /><path d="M10 13 4 19" /><path d="M3 21h8" /></>)
export const IconSkipSpeech = make(<><path d="M4 9.5v5h3l4 3.5v-12L7 9.5Z" /><path d="m15 8 4 4-4 4" /><path d="M20 8v8" /></>)
export const IconDice = make(<><rect x="4" y="4" width="16" height="16" rx="4" /><circle cx="9" cy="9" r="1.2" fill="currentColor" /><circle cx="15" cy="15" r="1.2" fill="currentColor" /><circle cx="15" cy="9" r="1.2" fill="currentColor" /><circle cx="9" cy="15" r="1.2" fill="currentColor" /></>)
export const IconArrowDown = make(<><path d="M12 5v14" /><path d="m6 13 6 6 6-6" /></>)
export const IconStop = make(<rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" stroke="none" />)
export const IconArrowRight = make(<><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>)
export const IconUsers = make(<><circle cx="9" cy="8" r="3.2" /><path d="M3 19a6 6 0 0 1 12 0" /><path d="M16 5.2a3 3 0 0 1 0 5.6" /><path d="M18 14a5 5 0 0 1 3 5" /></>)
export const IconScale = make(<><path d="M12 4v16" /><path d="M8 20h8" /><path d="M5 7h14" /><path d="m5 7-2.5 6a3 3 0 0 0 5 0Z" /><path d="m19 7-2.5 6a3 3 0 0 0 5 0Z" /></>)
export const IconSword = make(<><path d="M14.5 4H20v5.5L10 19.5 4.5 14Z" /><path d="m7 16.5-3 3" /><path d="m6 12 6 6" /></>)
export const IconShield = make(<path d="M12 3 5 6v5c0 4.4 3 8.3 7 10 4-1.7 7-5.6 7-10V6Z" />)
export const IconCompass = make(<><circle cx="12" cy="12" r="8.5" /><path d="m15.5 8.5-2 5-5 2 2-5Z" /></>)
export const IconTarget = make(<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /><path d="M12 2v4" /><path d="M12 18v4" /><path d="M2 12h4" /><path d="M18 12h4" /></>)
export const IconMask = make(<><path d="M3 8c3-2 6-2 9 0 3-2 6-2 9 0 0 6-3 9-6 9-1.5 0-2.3-1.5-3-3-.7 1.5-1.5 3-3 3-3 0-6-3-6-9Z" /><path d="M7 11.5c.8-.6 1.7-.6 2.5 0" /><path d="M14.5 11.5c.8-.6 1.7-.6 2.5 0" /></>)
export const IconCrown = make(<><path d="M4 8l4 4 4-7 4 7 4-4-2 10H6Z" /><path d="M6 21h12" /></>)
export const IconHourglass = make(<><path d="M6 3h12" /><path d="M6 21h12" /><path d="M7 3c0 5 10 5 10 9s-10 4-10 9" /><path d="M17 3c0 5-10 5-10 9s10 4 10 9" /></>)
export const IconBolt = make(<path d="M13 3 5 13.5h6L10 21l8-10.5h-6Z" />)
export const IconPlus = make(<><path d="M12 5v14" /><path d="M5 12h14" /></>)
export const IconTrash = make(<><path d="M4 7h16" /><path d="m6 7 1 13h10l1-13" /><path d="M9 7V4h6v3" /><path d="M10 11v5M14 11v5" /></>)
export const IconPen = make(<><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z" /><path d="m13.5 6.5 4 4" /></>)
export const IconPentago = make(<><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /><path d="M14 17a3.5 3.5 0 1 0 3.5-3.5" /><path d="m17.5 11.5 0 2 2 0" /><circle cx="7" cy="7" r="1.4" fill="currentColor" /></>)
export const IconOverload = make(<><path d="M5 8h14l-1 12H6Z" /><path d="M8 8V5a4 4 0 0 1 8 0v3" /><path d="M12 11v4" /><path d="M12 18h.01" /></>)
export const IconRotateCw = make(<><path d="M19 12a7 7 0 1 1-2.1-5" /><path d="M19 4v4h-4" /></>)
export const IconRotateCcw = make(<><path d="M5 12a7 7 0 1 0 2.1-5" /><path d="M5 4v4h4" /></>)
