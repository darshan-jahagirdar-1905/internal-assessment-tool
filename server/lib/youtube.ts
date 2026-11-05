// YouTube helpers (architecture.md section 9.1).

const ID = /^[A-Za-z0-9_-]{11}$/

// Accepts a video id or a youtube.com / youtu.be / embed / shorts URL.
export function parseYouTubeId(input: string): string | null {
  const value = input.trim()
  if (ID.test(value)) return value
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^www\.|^m\./, '')
  let id: string | null = null
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0] ?? null
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v')
    else {
      const [, kind, rest] = url.pathname.split('/')
      if (kind === 'embed' || kind === 'shorts' || kind === 'live') id = rest ?? null
    }
  }
  return id && ID.test(id) ? id : null
}

export type EmbedCheck =
  | { ok: true; youtubeId: string; title: string }
  | { ok: false; reason: 'bad_url' | 'not_embeddable' | 'not_found' | 'check_failed' }

type Fetcher = (url: string) => Promise<{ status: number; json(): Promise<unknown> }>

// Asks YouTube's oEmbed endpoint whether the video can be embedded.
// 200 = embeddable; 401/403 = private or embedding switched off; 400/404 = no such video.
export async function checkEmbeddable(input: string, fetcher: Fetcher = fetch): Promise<EmbedCheck> {
  const youtubeId = parseYouTubeId(input)
  if (!youtubeId) return { ok: false, reason: 'bad_url' }
  const oembed = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${youtubeId}`)}`
  try {
    const res = await fetcher(oembed)
    if (res.status === 200) {
      const body = (await res.json()) as { title?: unknown }
      return { ok: true, youtubeId, title: typeof body.title === 'string' ? body.title : '' }
    }
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'not_embeddable' }
    if (res.status === 400 || res.status === 404) return { ok: false, reason: 'not_found' }
    return { ok: false, reason: 'check_failed' }
  } catch {
    return { ok: false, reason: 'check_failed' }
  }
}
