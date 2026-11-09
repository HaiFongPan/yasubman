import type { CSSProperties } from 'react';
import type { IconKind } from '@shared/types';
import { cn } from '@/lib/utils';

export interface IconSpec {
  kind: IconKind;
  data: string | null;
  color: string;
}

export type ServiceIconInput =
  | IconSpec
  | { iconKind: IconKind; iconData: string | null; color: string };

export function toIconSpec(icon: ServiceIconInput): IconSpec {
  return 'kind' in icon
    ? icon
    : { kind: icon.iconKind, data: icon.iconData, color: icon.color };
}

export function ServiceIcon({
  icon,
  size = 34,
  className,
  fallbackLabel,
}: {
  icon: ServiceIconInput;
  size?: number;
  className?: string;
  /** 图片加载失败时显示的字母标记 */
  fallbackLabel?: string;
}) {
  const spec = toIconSpec(icon);
  const isImage = spec.kind === 'image' && !!spec.data;
  const glyph = Math.round(size * 0.54);
  const label =
    spec.kind === 'initials' ? spec.data?.slice(0, 3) : fallbackLabel?.slice(0, 3);

  return (
    <span
      className={cn(
        'service-icon relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] ring-1 ring-black/[0.04] ring-inset dark:ring-white/[0.06]',
        className,
      )}
      style={{ '--icon-color': spec.color, width: size, height: size } as CSSProperties}
      aria-hidden="true"
    >
      <span className="absolute inset-0 grid place-items-center">
        {spec.kind === 'brand' && spec.data ? (
          <svg viewBox="0 0 24 24" width={glyph} height={glyph} fill="currentColor">
            <path d={spec.data} />
          </svg>
        ) : label ? (
          <span
            className="font-mono leading-none font-medium tracking-tight"
            style={{ fontSize: Math.max(9, Math.round(size * 0.3)) }}
          >
            {label}
          </span>
        ) : null}
      </span>
      {isImage && (
        <img
          src={spec.data!}
          alt=""
          loading="lazy"
          decoding="async"
          className="relative z-10 size-full object-cover"
          onError={(event) => event.currentTarget.remove()}
        />
      )}
    </span>
  );
}
