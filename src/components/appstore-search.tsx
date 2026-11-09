import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { AppStoreResult } from '@shared/types';

export const APP_STORE_COUNTRIES = [
  ['us', '美国'],
  ['cn', '中国'],
  ['hk', '香港'],
  ['tw', '台湾'],
  ['jp', '日本'],
  ['sg', '新加坡'],
  ['gb', '英国'],
] as const;

/** App Store 搜索取数：服务库表单与订阅弹窗共用，避免各自维护防抖与取消逻辑 */
export function useAppStoreSearch(term: string, country: string) {
  const [results, setResults] = useState<AppStoreResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const value = term.trim();
    if (value.length < 2) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .searchAppStore(value, country, controller.signal)
        .then((apps) => {
          setResults(apps);
          setError(null);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setError(err instanceof Error ? err.message : '搜索失败');
          setResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term, country]);

  return { results, loading, error };
}

/** App Store 应用搜索：服务库页面独立使用 */
export function AppStoreSearch({
  onSelect,
  selectedIconUrl,
  placeholder = '搜索 App，如 ChatGPT、Notion',
  autoFocus = false,
}: {
  onSelect: (app: AppStoreResult) => void;
  selectedIconUrl?: string | null;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [term, setTerm] = useState('');
  const [country, setCountry] = useState('us');
  const { results, loading, error } = useAppStoreSearch(term, country);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={placeholder}
            className="pl-8"
            autoComplete="off"
            autoFocus={autoFocus}
          />
        </div>
        <Select value={country} onValueChange={setCountry}>
          <SelectTrigger className="h-9 w-[88px] shrink-0 text-[11.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {APP_STORE_COUNTRIES.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-[11px] text-destructive">{error}</p>}

      {term.trim().length >= 2 && (
        <div className="max-h-[196px] overflow-y-auto rounded-md border border-border bg-card">
          {loading ? (
            <p className="px-3 py-6 text-center text-[11.5px] text-muted-foreground">搜索中…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-6 text-center text-[11.5px] text-muted-foreground">
              没有找到匹配的 App
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {results.map((app) => (
                <li key={app.trackId}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(app);
                      setTerm('');
                    }}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-muted',
                      selectedIconUrl === app.iconUrl && 'bg-muted',
                    )}
                  >
                    <img
                      src={app.iconUrl}
                      alt=""
                      className="size-8 shrink-0 rounded-[7px] ring-1 ring-black/[0.06]"
                      loading="lazy"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium">{app.name}</span>
                      <span className="mt-0.5 block truncate text-[10.5px] text-muted-foreground">
                        {app.seller}
                        {app.seller && app.genre ? ` · ${app.genre}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
