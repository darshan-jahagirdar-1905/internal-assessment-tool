// YouTube IFrame Player helpers (architecture.md section 9.1): reading a
// video's length in the course editor, and the learner's video player.
// Everything resolves to null if YouTube can't be reached (e.g. a blocked
// network), so callers can fall back.

export const PLAYER_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 } as const

export type YTPlayer = {
  getDuration(): number
  getCurrentTime(): number
  getPlayerState(): number
  destroy(): void
}

type PlayerOptions = {
  videoId: string
  host: string
  width?: string | number
  height?: string | number
  playerVars?: Record<string, string | number>
  events: {
    onReady?(): void
    onStateChange?(event: { data: number }): void
    onError?(event: { data: number }): void
  }
}

export type YTNamespace = { Player: new (el: HTMLElement, opts: PlayerOptions) => YTPlayer }

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<YTNamespace | null> | null = null

export function loadYouTubeApi(): Promise<YTNamespace | null> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  apiPromise ??= new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), 10000)
    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timer)
      resolve(window.YT ?? null)
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.onerror = () => {
      window.clearTimeout(timer)
      resolve(null)
    }
    document.head.appendChild(script)
  })
  return apiPromise
}

export async function readDuration(youtubeId: string): Promise<number | null> {
  const YT = await loadYouTubeApi()
  if (!YT) return null
  return new Promise((resolve) => {
    const host = document.createElement('div')
    host.style.cssText = 'position:absolute;width:1px;height:1px;left:-9999px'
    const holder = document.createElement('div')
    host.appendChild(holder)
    document.body.appendChild(host)
    let player: YTPlayer | null = null
    const done = (value: number | null) => {
      window.clearTimeout(timer)
      player?.destroy()
      host.remove()
      resolve(value)
    }
    const timer = window.setTimeout(() => done(null), 10000)
    player = new YT.Player(holder, {
      videoId: youtubeId,
      host: 'https://www.youtube-nocookie.com',
      events: {
        onReady: () => {
          const seconds = Math.round(player?.getDuration() ?? 0)
          done(seconds > 0 ? seconds : null)
        },
        onError: () => done(null),
      },
    })
  })
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// "3:25" or "205" -> 205; anything else -> null.
export function parseDuration(text: string): number | null {
  const value = text.trim()
  const parts = value.split(':')
  if (parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null
  const seconds = parts.reduce((total, p) => total * 60 + Number(p), 0)
  return seconds > 0 ? seconds : null
}
