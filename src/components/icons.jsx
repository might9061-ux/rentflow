// Minimal inline icon set (stroke-based, inherits currentColor).
const S = ({ children, size = 18, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>{children}</svg>
)

export const IconGrid = (p) => <S {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></S>
export const IconBuilding = (p) => <S {...p}><path d="M3 21h18"/><path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M15 21V9h2a2 2 0 0 1 2 2v10"/><path d="M9 7h2M9 11h2M9 15h2"/></S>
export const IconUsers = (p) => <S {...p}><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 6a3 3 0 0 1 0 6"/><path d="M18 14a6 6 0 0 1 3 6"/></S>
export const IconCheck = (p) => <S {...p}><path d="M4 12.5l5 5 11-11"/></S>
export const IconCheckCircle = (p) => <S {...p}><circle cx="12" cy="12" r="9"/><path d="M8.5 12l2.5 2.5 5-5"/></S>
export const IconX = (p) => <S {...p}><path d="M6 6l12 12M18 6L6 18"/></S>
export const IconWallet = (p) => <S {...p}><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="16.5" cy="14" r="1.2"/></S>
export const IconBell = (p) => <S {...p}><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10.5 19a1.8 1.8 0 0 0 3 0"/></S>
export const IconReceipt = (p) => <S {...p}><path d="M5 3v18l2-1.4L9 21l2-1.4L13 21l2-1.4L17 21l2-1.4V3l-2 1.4L15 3l-2 1.4L11 3 9 4.4 7 3 5 4.4Z"/><path d="M8 8h8M8 12h8M8 16h5"/></S>
export const IconClock = (p) => <S {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></S>
export const IconPlus = (p) => <S {...p}><path d="M12 5v14M5 12h14"/></S>
export const IconEdit = (p) => <S {...p}><path d="M4 20h4l10-10-4-4L4 16v4Z"/><path d="M13.5 6.5l4 4"/></S>
export const IconSend = (p) => <S {...p}><path d="M21 3L10 14"/><path d="M21 3l-7 18-4-8-8-4 19-6Z"/></S>
export const IconLogout = (p) => <S {...p}><path d="M14 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2"/><path d="M18 12H9M15 9l3 3-3 3"/></S>
export const IconKey = (p) => <S {...p}><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L21 2M17 6l2 2M14 9l2 2"/></S>
export const IconShield = (p) => <S {...p}><path d="M12 3l8 3v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-3Z"/><path d="M9 12l2 2 4-4"/></S>
export const IconWhatsapp = (p) => <S {...p}><path d="M3 21l1.7-5A8 8 0 1 1 8 19.3L3 21Z"/><path d="M8.5 9c0 4 2.5 6.5 6.5 6.5l1-2-2.2-1-1 1c-1.2-.4-2.4-1.6-2.8-2.8l1-1L10 7.5 8.5 9Z"/></S>
export const IconDownload = (p) => <S {...p}><path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></S>
export const IconShare = (p) => <S {...p}><path d="M12 16V4"/><path d="M8 8l4-4 4 4"/><path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/></S>
export const IconChevron = (p) => <S {...p}><path d="M9 6l6 6-6 6"/></S>
export const IconArrowRight = (p) => <S {...p}><path d="M5 12h14M13 6l6 6-6 6"/></S>
export const IconHome = (p) => <S {...p}><path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/></S>
export const IconMail = (p) => <S {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M4 7l8 6 8-6"/></S>
export const IconPhone = (p) => <S {...p}><path d="M5 3h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z"/></S>
export const IconMenu = (p) => <S {...p}><path d="M4 6h16M4 12h16M4 18h16"/></S>
export const IconTrash = (p) => <S {...p}><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13"/></S>
export const IconWarn = (p) => <S {...p}><path d="M12 3l9 16H3l9-16Z"/><path d="M12 9v5M12 17h.01"/></S>
export const IconInfo = (p) => <S {...p}><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></S>
export const IconSparkle = (p) => <S {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/></S>
export const IconEye = (p) => <S {...p}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></S>
export const IconSun = (p) => <S {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></S>
export const IconMoon = (p) => <S {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></S>
export const IconPalette = (p) => <S {...p}><path d="M12 3a9 9 0 0 0 0 18c1 0 1.6-.8 1.6-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-3.9-4-7.4-9-7.4Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="11" r="1"/></S>
export const IconTag = (p) => <S {...p}><path d="M3 11.5V4a1 1 0 0 1 1-1h7.5a1 1 0 0 1 .7.3l8.5 8.5a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 12.2a1 1 0 0 1-.3-.7Z"/><circle cx="7.5" cy="7.5" r="1.4"/></S>
export const IconSettings = (p) => <S {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></S>
export const IconEyeOff = (p) => <S {...p}><path d="M3 3l18 18"/><path d="M10.6 6.1A10.8 10.8 0 0 1 12 6c6.4 0 10 6 10 6a16.8 16.8 0 0 1-3.2 3.9M6.6 6.6A16.7 16.7 0 0 0 2 12s3.6 6 10 6a10.6 10.6 0 0 0 4.2-.8"/><path d="M9.6 9.6a3 3 0 0 0 4.2 4.2"/></S>
export const IconWrench = (p) => <S {...p}><path d="M14.7 6.3a4 4 0 0 0-5.2 5L4 16.8a2 2 0 0 0 2.8 2.8l5.5-5.5a4 4 0 0 0 5-5.2l-2.4 2.4-2.3-.6-.6-2.3Z"/></S>
export const IconChart = (p) => <S {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></S>
export const IconCash = (p) => <S {...p}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v6M18 9v6"/></S>
