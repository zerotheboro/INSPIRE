import { ReactNode } from "react"

export type IconName =
  | "spark"
  | "heart"
  | "message"
  | "leaf"
  | "water"
  | "pool"
  | "spa"
  | "steam"
  | "massage"
  | "yoga"
  | "book"
  | "garden"
  | "fish"
  | "bed"
  | "user"
  | "phone"
  | "mail"
  | "pin"
  | "facebook"
  | "instagram"
  | "tiktok"
  | "youtube"
  | "zalo"
  | "arrow"
  | "check"
  | "shield"

export default function Icon({
  name,
  size = 22
}: {
  name: IconName
  size?: number
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  }

  const paths: Record<IconName, ReactNode> = {
    spark: <><path d="M12 2l1.8 5.1L19 9l-5.2 1.9L12 16l-1.8-5.1L5 9l5.2-1.9L12 2Z"/><path d="M19 16l.9 2.5L22.5 20l-2.6 1-.9 2.5-.9-2.5-2.6-1 2.6-1 .9-2.5Z"/></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/>,
    message: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/><path d="M8 9h8M8 13h5"/></>,
    leaf: <><path d="M20 4c-8 0-14 4-14 10 0 3 2 5 5 5 6 0 9-7 9-15Z"/><path d="M4 21c2-5 6-8 12-11"/></>,
    water: <><path d="M2 8c3 2 5 2 8 0s5-2 8 0 4 2 4 2"/><path d="M2 13c3 2 5 2 8 0s5-2 8 0 4 2 4 2"/><path d="M2 18c3 2 5 2 8 0s5-2 8 0 4 2 4 2"/></>,
    pool: <><path d="M2 15c3 2 5 2 8 0s5-2 8 0 4 2 4 2"/><path d="M2 20c3 2 5 2 8 0s5-2 8 0 4 2 4 2"/><path d="M6 13V6a2 2 0 0 1 4 0M10 9h6V6a2 2 0 0 1 4 0"/></>,
    spa: <><path d="M12 22c4-3 6-6 6-10-3 0-5 1-6 3-1-2-3-3-6-3 0 4 2 7 6 10Z"/><path d="M12 15c-2-2-3-5 0-9 3 4 2 7 0 9Z"/></>,
    steam: <><path d="M8 3c2 2-2 4 0 6s-2 4 0 6"/><path d="M16 3c2 2-2 4 0 6s-2 4 0 6"/><path d="M4 20h16"/></>,
    massage: <><circle cx="12" cy="5" r="2"/><path d="M6 11c2-2 4-3 6-3s4 1 6 3M8 20l2-7 2 3 2-3 2 7"/></>,
    yoga: <><circle cx="12" cy="4" r="2"/><path d="M12 6v6M7 9l5 3 5-3M5 20l7-8 7 8M9 20h6"/></>,
    book: <><path d="M4 5a3 3 0 0 1 3-3h5v18H7a3 3 0 0 0-3 3Z"/><path d="M20 5a3 3 0 0 0-3-3h-5v18h5a3 3 0 0 1 3 3Z"/></>,
    garden: <><path d="M12 22V10"/><path d="M12 14c-5 0-7-3-7-7 5 0 7 3 7 7ZM12 10c5 0 7-3 7-7-5 0-7 3-7 7Z"/></>,
    fish: <><path d="M4 12c3-5 8-6 13-2l4-3v10l-4-3c-5 4-10 3-13-2Z"/><circle cx="14" cy="11" r=".7" fill="currentColor"/></>,
    bed: <><path d="M3 20v-9M21 20v-7a3 3 0 0 0-3-3H9a3 3 0 0 0-3 3v3"/><path d="M3 16h18M6 10V7h4v3"/></>,
    user: <><circle cx="12" cy="7" r="4"/><path d="M4 22c0-5 3-8 8-8s8 3 8 8"/></>,
    phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c1 .4 1.9.6 2.9.7A2 2 0 0 1 22 16.9Z"/>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    facebook: <><circle cx="12" cy="12" r="9"/><path d="M13.5 8H15V5.5h-2c-2 0-3 1.2-3 3V11H8v2.5h2V19h3v-5.5h2.2l.4-2.5H13V9c0-.7.2-1 1-1Z"/></>,
    instagram: <><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor"/></>,
    tiktok: <><path d="M15 4v10a4 4 0 1 1-4-4"/><path d="M15 4c1 3 3 4 6 4"/></>,
    youtube: <><rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3Z"/></>,
    zalo: <><rect x="3" y="4" width="18" height="16" rx="4"/><path d="M7 9h4l-4 6h4M13 15V9h3c2 0 2 3 0 3h-3M18 9v6"/></>,
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
  }

  return <svg {...common}>{paths[name]}</svg>
}