import type { AppStoreResult, CategoryId } from '../shared/types';

const CACHE_TTL = 86_400_000;
const cache = new Map<string, { at: number; data: AppStoreResult[] }>();
const inFlight = new Map<string, Promise<AppStoreResult[]>>();

const GENRE_CATEGORY: Record<string, CategoryId> = {
  Productivity: 'productivity',
  Business: 'productivity',
  Utilities: 'productivity',
  Education: 'productivity',
  'Developer Tools': 'dev',
  'Graphics & Design': 'productivity',
  Entertainment: 'media',
  'Photo & Video': 'media',
  Music: 'media',
  Books: 'media',
  News: 'media',
  Games: 'media',
  'Social Networking': 'other',
  Finance: 'other',
  'Health & Fitness': 'other',
  Lifestyle: 'other',
  Shopping: 'other',
  Travel: 'other',
  'Food & Drink': 'other',
};

interface RawApp {
  trackId?: number;
  bundleId?: string;
  trackName?: string;
  sellerName?: string;
  primaryGenreName?: string;
  artworkUrl512?: string;
  artworkUrl100?: string;
  trackViewUrl?: string;
  kind?: string;
}

function toIconUrl(app: RawApp): string | null {
  const base = app.artworkUrl512 ?? app.artworkUrl100;
  if (!base) return null;
  return base.replace(/\/\d+x\d+bb\.(jpg|jpeg|png)$/i, '/512x512bb.$1');
}

/** App Store 的 trackName 常带副标题或营销后缀：Notion: Notes… / 爱奇艺-《…》 */
function normalizeName(name: string): string {
  const cleaned = name.split(/\s[-–—]\s|[:：]|-(?=《)/)[0].trim();
  return (cleaned || name).slice(0, 60);
}

function mapApp(app: RawApp): AppStoreResult | null {
  const iconUrl = toIconUrl(app);
  if (!app.trackId || !app.trackName || !iconUrl || !app.trackViewUrl) return null;
  const genre = app.primaryGenreName ?? '';
  return {
    trackId: app.trackId,
    bundleId: app.bundleId ?? null,
    name: normalizeName(app.trackName),
    seller: app.sellerName ?? '',
    genre,
    iconUrl,
    storeUrl: app.trackViewUrl.split('?')[0],
    category: GENRE_CATEGORY[genre] ?? 'other',
  };
}

async function fetchSearch(term: string, country: string): Promise<AppStoreResult[]> {
  const params = new URLSearchParams({
    term,
    entity: 'software',
    country,
    limit: '12',
  });
  const res = await fetch(`https://itunes.apple.com/search?${params}`, {
    signal: AbortSignal.timeout(10_000),
    headers: { accept: 'application/json', 'user-agent': 'yasubman/0.1' },
  });
  if (res.status === 429) throw new Error('App Store 搜索接口限流，请稍后再试');
  if (!res.ok) throw new Error(`App Store 返回 HTTP ${res.status}`);
  const data = (await res.json()) as { results?: RawApp[] };
  const seen = new Set<number>();
  const apps: AppStoreResult[] = [];
  for (const raw of data.results ?? []) {
    if (raw.kind !== 'software') continue;
    const app = mapApp(raw);
    if (!app || seen.has(app.trackId)) continue;
    seen.add(app.trackId);
    apps.push(app);
  }
  return apps;
}

export async function searchAppStore(term: string, country: string): Promise<AppStoreResult[]> {
  const key = `${country}:${term.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.data;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = fetchSearch(term, country)
    .then((data) => {
      cache.set(key, { at: Date.now(), data });
      if (cache.size > 200) {
        const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (oldest) cache.delete(oldest[0]);
      }
      return data;
    })
    .finally(() => inFlight.delete(key));

  inFlight.set(key, request);
  return request;
}
