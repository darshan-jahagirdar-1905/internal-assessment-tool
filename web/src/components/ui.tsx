import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon.tsx'

// Shared building blocks styled by index.css.

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="card">
      {title && <h2 className="card-title">{title}</h2>}
      {children}
    </section>
  )
}

export function StatTile({ icon, value, label }: { icon: IconName; value: ReactNode; label: string }) {
  return (
    <div className="card stat">
      <span className="stat-icon"><Icon name={icon} size={40} /></span>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  )
}

export function EmptyState({ title, text }: { title: string; text?: string }) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {text && <p className="empty-text">{text}</p>}
    </div>
  )
}

type BadgeTone = 'ok' | 'warn' | 'danger' | 'neutral'
export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function Logo() {
  // Text logo until the Transfunnel logo file arrives.
  return (
    <span className="logo">
      <span className="logo-mark">T</span>
      Transfunnel <span className="logo-sub">Learning</span>
    </span>
  )
}
