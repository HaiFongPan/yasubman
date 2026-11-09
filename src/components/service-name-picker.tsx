import { useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Link2Off, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { ServiceIcon } from '@/components/service-icon';
import { APP_STORE_COUNTRIES, useAppStoreSearch } from '@/components/appstore-search';
import { useCatalog, useCategories, useSubscriptions } from '@/lib/queries';
import { cn, initialsOf } from '@/lib/utils';
import type { AppStoreResult, CatalogItem } from '@shared/types';

const LIBRARY_LIMIT = 6;
const APP_LIMIT = 6;

export interface ServiceNamePickerProps {
  /** 订阅名称，同时也是搜索词 */
  name: string;
  /** 已关联的服务库条目 */
  serviceId: number | null;
  /** 已选中的 App Store 结果（保存时会写入服务库） */
  app: AppStoreResult | null;
  onNameChange: (value: string) => void;
  onPickService: (item: CatalogItem) => void;
  onPickApp: (app: AppStoreResult) => void;
  /** 断开关联，仅保留名称文本 */
  onClearLink: () => void;
  disabled?: boolean;
}

/**
 * 服务 / 名称合一输入：一个输入框同时承担「输入订阅名称」与「搜索服务库、App Store」。
 * 服务库命中直接关联服务；App Store 命中在保存订阅时自动写入服务库；纯文本则视为自定义名称。
 */
export function ServiceNamePicker({
  name,
  serviceId,
  app,
  onNameChange,
  onPickService,
  onPickApp,
  onClearLink,
  disabled,
}: ServiceNamePickerProps) {
  const { data: catalog = [] } = useCatalog();
  const { data: categories = [] } = useCategories();
  const { data: subscriptions = [] } = useSubscriptions();
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState<string>('us');
  const inputRef = useRef<HTMLInputElement>(null);

  const query = name.trim();
  const { results, loading, error } = useAppStoreSearch(query, country);

  const categoryLabel = useMemo(() => {
    const map = new Map(categories.map((item) => [item.slug, item.label]));
    return (slug: string) => map.get(slug) ?? slug;
  }, [categories]);

  /**
   * 服务库条目用的是厂商名（OpenAI、Anthropic），用户却按产品名搜（ChatGPT、Claude）。
   * 用已有订阅的「名称 → 所属服务」反查做别名，让两种叫法都能命中。
   */
  const aliases = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const sub of subscriptions) {
      if (!sub.serviceId) continue;
      const list = map.get(sub.serviceId) ?? [];
      list.push(sub.name);
      map.set(sub.serviceId, list);
    }
    return map;
  }, [subscriptions]);

  const libraryMatches = useMemo(() => {
    const q = query.toLowerCase();
    const hits = q
      ? catalog.filter(
          (item) =>
            item.name.toLowerCase().includes(q) ||
            (aliases.get(item.id) ?? []).some((alias) => alias.toLowerCase().includes(q)),
        )
      : catalog;
    return { total: hits.length, items: hits.slice(0, LIBRARY_LIMIT) };
  }, [aliases, catalog, query]);

  /** 命中的服务库条目标题名称与搜索词无关时，提示是哪个订阅名触发的 */
  const aliasHint = (item: CatalogItem): string | null => {
    const q = query.toLowerCase();
    if (!q || item.name.toLowerCase().includes(q)) return null;
    const hit = (aliases.get(item.id) ?? []).find((alias) => alias.toLowerCase().includes(q));
    return hit ? `订阅名：${hit}` : null;
  };

  const selectedService = serviceId
    ? (catalog.find((item) => item.id === serviceId) ?? null)
    : null;
  const appResults = results.slice(0, APP_LIMIT);

  const close = () => {
    setOpen(false);
    inputRef.current?.blur();
  };

  const status = app
    ? selectedService
      ? `已在服务库中「${selectedService.name}」，保存时更新该条目`
      : '保存订阅时自动加入服务库'
    : selectedService
      ? `已关联服务库「${selectedService.name}」`
      : query
        ? '自定义名称，不关联服务库'
        : null;

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-2.5 flex size-4 -translate-y-1/2 items-center justify-center">
              {app ? (
                <img
                  src={app.iconUrl}
                  alt=""
                  className="size-4 rounded-[4px] ring-1 ring-black/[0.06]"
                  loading="lazy"
                />
              ) : selectedService ? (
                <ServiceIcon
                  icon={selectedService}
                  size={16}
                  fallbackLabel={initialsOf(selectedService.name)}
                />
              ) : (
                <Search className="size-3.5 text-muted-foreground" />
              )}
            </span>
            <Input
              ref={inputRef}
              value={name}
              disabled={disabled}
              onChange={(event) => {
                onNameChange(event.target.value);
                setOpen(true);
              }}
              onClick={() => setOpen(true)}
              placeholder="搜索服务库 / App Store，或直接输入名称"
              className="pl-8 pr-8"
              autoComplete="off"
            />
            <ChevronsUpDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 opacity-50" />
          </div>
        </PopoverAnchor>

        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="max-h-[340px] overflow-y-auto p-1">
            <section>
              <header className="flex items-center justify-between px-2 pt-1 pb-1">
                <span className="text-[10px] font-medium tracking-[0.1em] text-muted-foreground/80 uppercase">
                  服务库
                </span>
                <span className="font-mono text-[10px] text-muted-foreground/70">
                  {libraryMatches.total}
                </span>
              </header>
              {libraryMatches.items.length === 0 ? (
                <p className="px-2 py-2 text-[11.5px] text-muted-foreground">服务库没有匹配项</p>
              ) : (
                libraryMatches.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onPickService(item);
                      close();
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted"
                  >
                    <ServiceIcon icon={item} size={22} fallbackLabel={initialsOf(item.name)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{item.name}</span>
                      {aliasHint(item) && (
                        <span className="block truncate text-[10.5px] text-muted-foreground">
                          {aliasHint(item)}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-[10.5px] text-muted-foreground">
                      {categoryLabel(item.category)}
                    </span>
                    {item.id === serviceId && <Check className="size-3.5 shrink-0" />}
                  </button>
                ))
              )}
              {libraryMatches.total > LIBRARY_LIMIT && (
                <p className="px-2 pb-1 text-[10.5px] text-muted-foreground/70">
                  还有 {libraryMatches.total - LIBRARY_LIMIT} 项，继续输入可缩小范围
                </p>
              )}
            </section>

            <section className="mt-1 border-t border-border/70 pt-1">
              <header className="flex items-center justify-between px-2 pt-1 pb-1">
                <span className="text-[10px] font-medium tracking-[0.1em] text-muted-foreground/80 uppercase">
                  App Store
                </span>
                <select
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                  className="h-5 rounded border border-input bg-card px-1 text-[10.5px] text-muted-foreground outline-none"
                  aria-label="App Store 国家或地区"
                >
                  {APP_STORE_COUNTRIES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </header>
              {error ? (
                <p className="px-2 py-2 text-[11.5px] text-destructive">{error}</p>
              ) : query.length < 2 ? (
                <p className="px-2 py-2 text-[11.5px] text-muted-foreground">
                  输入 2 个字符以上可搜索 App Store
                </p>
              ) : loading ? (
                <p className="px-2 py-2 text-[11.5px] text-muted-foreground">搜索中…</p>
              ) : appResults.length === 0 ? (
                <p className="px-2 py-2 text-[11.5px] text-muted-foreground">
                  没有找到匹配的 App
                </p>
              ) : (
                appResults.map((result) => (
                  <button
                    key={result.trackId}
                    type="button"
                    onClick={() => {
                      onPickApp(result);
                      close();
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted"
                  >
                    <img
                      src={result.iconUrl}
                      alt=""
                      className="size-[22px] shrink-0 rounded-[6px] ring-1 ring-black/[0.06]"
                      loading="lazy"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{result.name}</span>
                      <span className="block truncate text-[10.5px] text-muted-foreground">
                        {result.seller}
                        {result.seller && result.genre ? ` · ${result.genre}` : ''}
                      </span>
                    </span>
                    {app?.trackId === result.trackId && <Check className="size-3.5 shrink-0" />}
                  </button>
                ))
              )}
            </section>
          </div>

          <div className="border-t border-border p-1">
            <button
              type="button"
              onClick={() => {
                onClearLink();
                close();
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-muted-foreground hover:bg-muted',
                !serviceId && !app && 'text-foreground',
              )}
            >
              <Link2Off className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                {query ? `使用「${query}」作为自定义名称` : '使用自定义名称'}
              </span>
              {!serviceId && !app && <Check className="size-3.5 shrink-0" />}
            </button>
          </div>
        </PopoverContent>
      </Popover>

      {status && (
        <p className="text-[11px] text-muted-foreground/80">
          {app && !selectedService ? 'ⓘ ' : ''}
          {status}
        </p>
      )}
    </div>
  );
}
