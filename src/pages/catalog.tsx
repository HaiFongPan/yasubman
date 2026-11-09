import { useEffect, useMemo, useState } from 'react';
import { MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { ServiceIcon } from '@/components/service-icon';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useSubscriptionDialog } from '@/components/subscription-dialog';
import { useCatalog, useCatalogMutations, useCategories, useSubscriptions } from '@/lib/queries';
import { AppStoreSearch } from '@/components/appstore-search';
import { cn, hostnameOf, initialsOf } from '@/lib/utils';
import {
  type AppStoreResult,
  type CatalogItem,
  type CategoryId,
  type IconKind,
} from '@shared/types';

function ServiceDialog({
  open,
  onOpenChange,
  item,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: CatalogItem | null;
}) {
  const { data: catalog = [] } = useCatalog();
  const { data: categories = [] } = useCategories();
  const { create, update } = useCatalogMutations();
  const brands = useMemo(() => catalog.filter((entry) => entry.iconKind === 'brand'), [catalog]);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<CategoryId>('other');
  const [iconKind, setIconKind] = useState<IconKind>('initials');
  const [iconData, setIconData] = useState('');
  const [color, setColor] = useState('#6B7280');
  const [website, setWebsite] = useState('');
  const [brandOpen, setBrandOpen] = useState(false);
  const [brandQuery, setBrandQuery] = useState('');
  const [selectedApp, setSelectedApp] = useState<AppStoreResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? '');
    setCategory(item?.category ?? 'other');
    setIconKind(item?.iconKind ?? 'initials');
    setIconData(item?.iconData ?? '');
    setColor(item?.color ?? '#6B7280');
    setWebsite(item?.website ?? '');
    setBrandQuery('');
    setSelectedApp(null);
  }, [open, item]);

  const preview = {
    kind: iconKind,
    data: iconKind === 'initials' ? iconData || initialsOf(name) : iconData,
    color,
  };

  const filteredBrands = brands.filter((brand) =>
    brand.name.toLowerCase().includes(brandQuery.trim().toLowerCase()),
  );

  const applyApp = (app: AppStoreResult) => {
    setSelectedApp(app);
    setIconKind('image');
    setIconData(app.iconUrl);
    setName(app.name);
    setCategory(app.category);
    setWebsite(app.storeUrl);
  };

  const changeIconKind = (value: IconKind) => {
    if (value !== 'image' && iconData.startsWith('http')) setIconData('');
    setIconKind(value);
  };

  const pending = create.isPending || update.isPending;

  const submit = async () => {
    if (!name.trim()) return;
    const payload = {
      name: name.trim(),
      category,
      iconKind,
      iconData: iconKind === 'initials' ? iconData || initialsOf(name) : iconData,
      color,
      website: website.trim() || null,
    };
    try {
      if (item) await update.mutateAsync({ id: item.id, input: payload });
      else await create.mutateAsync(payload);
      onOpenChange(false);
    } catch {
      /* 统一提示 */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90dvh,760px)] flex-col gap-0 overflow-hidden sm:max-w-[520px]">
        <DialogHeader className="shrink-0">
          <DialogTitle>{item ? '编辑服务' : '添加自定义服务'}</DialogTitle>
          <DialogDescription>
            自定义服务会出现在订阅表单的服务选择器和服务库中。
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <div className="flex items-center gap-3 rounded-md border border-border bg-muted/25 p-3">
            <ServiceIcon icon={preview} size={44} fallbackLabel={initialsOf(name)} />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium">{name.trim() || '服务名称'}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {categories.find((item) => item.slug === category)?.label ?? category} ·{' '}
                {iconKind === 'brand'
                  ? '品牌图形'
                  : iconKind === 'image'
                    ? 'App Store 图标'
                    : `字母「${preview.data || '—'}」`}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>名称</Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如 某云主机、家庭共享账号"
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>分类</Label>
              <Select value={category} onValueChange={(value) => setCategory(value as CategoryId)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((entry) => (
                    <SelectItem key={entry.slug} value={entry.slug}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>图标来源</Label>
              <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
                {(
                  [
                    ['initials', '字母'],
                    ['brand', '品牌'],
                    ['image', 'App Store'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => changeIconKind(value)}
                    className={cn(
                      'flex-1 rounded-[5px] py-1 text-[12px] transition-colors',
                      iconKind === value
                        ? 'bg-secondary font-medium text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {iconKind === 'initials' ? (
            <div className="space-y-1.5">
              <Label>字母标记（最多 3 个字符）</Label>
              <Input
                value={iconData}
                onChange={(event) => setIconData(event.target.value.slice(0, 3))}
                placeholder={initialsOf(name)}
                className="font-mono uppercase"
              />
            </div>
          ) : iconKind === 'brand' ? (
            <div className="space-y-1.5">
              <Label>品牌图形</Label>
              <Popover open={brandOpen} onOpenChange={setBrandOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-card px-2.5 text-left text-[13px] hover:bg-muted/50"
                  >
                    {iconData ? (
                      <ServiceIcon
                        icon={preview}
                        size={22}
                        fallbackLabel={initialsOf(name)}
                      />
                    ) : (
                      <span className="grid size-[22px] place-items-center rounded-[7px] border border-dashed border-input text-[10px]">
                        ?
                      </span>
                    )}
                    <span className="truncate text-muted-foreground">
                      {brands.find((brand) => brand.iconData === iconData)?.name ?? '选择一个品牌图形'}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                  <div className="flex items-center gap-2 border-b border-border px-2.5">
                    <Search className="size-3.5 text-muted-foreground" />
                    <input
                      value={brandQuery}
                      onChange={(event) => setBrandQuery(event.target.value)}
                      placeholder="搜索品牌…"
                      className="h-9 w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60"
                      autoFocus
                    />
                  </div>
                  <div className="grid max-h-[220px] grid-cols-8 gap-1 overflow-y-auto p-2">
                    {filteredBrands.slice(0, 160).map((brand) => (
                      <button
                        key={brand.id}
                        type="button"
                        title={brand.name}
                        onClick={() => {
                          setIconData(brand.iconData ?? '');
                          setColor(brand.color);
                          setBrandOpen(false);
                        }}
                        className={cn(
                          'grid aspect-square place-items-center rounded-md transition-colors hover:bg-muted',
                          brand.iconData === iconData && 'bg-muted ring-1 ring-ring/30',
                        )}
                      >
                        <ServiceIcon icon={brand} size={26} fallbackLabel={initialsOf(brand.name)} />
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>App Store 搜索</Label>
              <AppStoreSearch onSelect={applyApp} selectedIconUrl={iconData} />
              {selectedApp && (
                <div className="flex items-center gap-2.5 rounded-md border border-border bg-muted/25 px-2.5 py-2">
                  <img
                    src={selectedApp.iconUrl}
                    alt=""
                    className="size-8 rounded-[7px] ring-1 ring-black/[0.06]"
                    loading="lazy"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-medium">{selectedApp.name}</div>
                    <a
                      href={selectedApp.storeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10.5px] text-muted-foreground underline-offset-2 hover:underline"
                    >
                      在 App Store 查看
                    </a>
                  </div>
                </div>
              )}
              <p className="text-[10.5px] leading-relaxed text-muted-foreground">
                图标来自 App Store 搜索接口，仅用于标识本条订阅；点击结果会填入名称、分类与官网。
              </p>
            </div>
          )}

          <div className={cn('space-y-1.5', iconKind === 'image' && 'hidden')}>
            <Label>图标颜色</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="size-9 cursor-pointer rounded-md border border-input bg-card p-1"
                aria-label="选择颜色"
              />
              <Input
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="w-28 font-mono uppercase"
                maxLength={7}
              />
              <div className="flex gap-1.5">
                {['#2E6B4F', '#3D7EA6', '#6C63C7', '#C2553F', '#B08A2E', '#6B7280'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setColor(preset)}
                    aria-label={`使用颜色 ${preset}`}
                    className="size-5 rounded-full ring-1 ring-black/10 transition-transform hover:scale-110"
                    style={{ backgroundColor: preset }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>网站（可选）</Label>
            <Input
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              placeholder="https://"
              inputMode="url"
            />
          </div>
        </DialogBody>

        <DialogFooter className="shrink-0 bg-popover">
          <div className="text-[11px] text-muted-foreground">保存后可在订阅表单中选择</div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              onClick={submit}
              disabled={pending || !name.trim() || (iconKind === 'image' && !iconData)}
            >
              {pending ? '保存中…' : '保存'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CatalogPage() {
  const { data: catalog = [], isLoading } = useCatalog();
  const { data: subscriptions = [] } = useSubscriptions({});
  const { data: categories = [] } = useCategories();
  const { remove } = useCatalogMutations();
  const { openCreate } = useSubscriptionDialog();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | CategoryId>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CatalogItem | null>(null);

  const usage = useMemo(() => {
    const map = new Map<number, number>();
    for (const sub of subscriptions) {
      if (sub.serviceId) map.set(sub.serviceId, (map.get(sub.serviceId) ?? 0) + 1);
    }
    return map;
  }, [subscriptions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (q && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [catalog, query, category]);

  const groups = categories
    .map((entry) => ({
      ...entry,
      items: filtered.filter((item) => item.category === entry.slug),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Library"
        title="服务库"
        description="内置常见 AI、云服务、影音与效率工具。点击任意服务即可带着它创建订阅。"
        actions={
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">自定义服务</span>
            <span className="sm:hidden">自定义</span>
          </Button>
        }
      />

      <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索服务"
            className="pl-8"
            aria-label="搜索服务"
          />
        </div>
        <Select
          value={category}
          onValueChange={(value) => setCategory(value as 'all' | CategoryId)}
        >
          <SelectTrigger className="sm:w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分类</SelectItem>
            {categories.map((entry) => (
              <SelectItem key={entry.slug} value={entry.slug}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="hidden shrink-0 text-[11.5px] text-muted-foreground sm:block">
          {filtered.length} / {catalog.length} 个服务
        </span>
      </div>

      {isLoading ? (
        <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-[92px] animate-pulse rounded-lg bg-muted/60" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          className="mt-6"
          kicker="No match"
          title="没有匹配的服务"
          description="换个关键词，或添加一个自定义服务。"
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
              className="gap-1.5"
            >
              <Plus className="size-4" /> 添加服务
            </Button>
          }
        />
      ) : (
        <div className="mt-6 space-y-8">
          {groups.map((group) => (
            <section key={group.id}>
              <div className="flex items-baseline gap-2.5">
                <h2 className="text-[13px] font-semibold tracking-[-0.01em]">{group.label}</h2>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {group.items.length}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                {group.items.map((item) => {
                  const count = usage.get(item.id) ?? 0;
                  return (
                    <div key={item.id} className="group relative">
                      <button
                        type="button"
                        onClick={() =>
                          openCreate({
                            serviceId: item.id,
                            category: item.category,
                            name: item.name,
                            website: item.website,
                          })
                        }
                        className="flex w-full flex-col gap-3 rounded-lg border border-border bg-card p-3.5 text-left transition-colors hover:border-foreground/15 hover:bg-muted/30 active:bg-muted/50"
                      >
                        <span className="flex items-center gap-2.5">
                          <ServiceIcon icon={item} size={34} fallbackLabel={initialsOf(item.name)} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] font-medium">
                              {item.name}
                            </span>
                            <span className="mt-0.5 block truncate text-[10.5px] text-muted-foreground">
                              {count > 0 ? `${count} 项订阅` : item.isBuiltin ? '内置服务' : '自定义'}
                            </span>
                          </span>
                        </span>
                        <span className="flex items-center justify-between gap-2 border-t border-border/60 pt-2 text-[10.5px] text-muted-foreground">
                          <span className="truncate">
                            {hostnameOf(item.website) ??
                              categories.find((entry) => entry.slug === item.category)?.label ??
                              item.category}
                          </span>
                          <span className="inline-flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                            <Plus className="size-3" /> 添加
                          </span>
                        </span>
                      </button>

                      {!item.isBuiltin && (
                        <div className="absolute top-2 right-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="size-6 bg-card/80 text-muted-foreground backdrop-blur-sm hover:bg-muted"
                                aria-label="服务操作"
                              >
                                <MoreHorizontal className="size-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onSelect={() => {
                                  setEditing(item);
                                  setDialogOpen(true);
                                }}
                              >
                                <Pencil className="size-3.5" /> 编辑
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem destructive onSelect={() => setDeleteTarget(item)}>
                                <Trash2 className="size-3.5" /> 删除
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <ServiceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={editing}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除服务「{deleteTarget?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              关联的订阅会保留，但图标会回退为字母标记。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) {
                  remove.mutate(deleteTarget.id, {
                    onSettled: () => setDeleteTarget(null),
                  });
                }
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default CatalogPage;
