// Reads a video's length from the YouTube player in the admin's browser
// (architecture.md section 9.1). Resolves null if YouTube can't be reached
// (e.g. a blocked network); the admin then types the length.

type YTPlayer = { getDuration(): number; destroy(): void }
type YTNamespace = {
  Player: new (el: HTMLElement, opts: { videoId: string; host: string; events: { onReady(): void; onError(): void } }) => YTPlayer
}
declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<YTNamespace | null> | null = null

function loadApi(): Promise<YTNamespace | null> {
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
  const YT = await loadApi()
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
