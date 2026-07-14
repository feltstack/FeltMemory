/** Small shared UI atoms: switch, tag chip, stat box. */
import { tagColor, tagSlug } from '../types';
import type { SheetAnchor } from '../state/UiContext';

/** Anchor rect of the clicked element, for desktop popover positioning. */
export function anchorOf(e: React.MouseEvent): SheetAnchor {
  // Anchor to the whole row/record container so the card's top meets the
  // ROW's bottom border (not the small badge that was tapped).
  const el = e.currentTarget as HTMLElement;
  const container = (el.closest('.seat-row, tr') as HTMLElement | null) ?? el;
  const r = container.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, left: r.left };
}

export function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <div
      className={`switch ${on ? 'on' : ''}`}
      role="switch"
      aria-checked={on}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <div className="knob" />
    </div>
  );
}

export function TagChip({
  tag,
  verified,
  allTags,
  style,
}: {
  tag: string;
  verified?: boolean;
  allTags: string[];
  style?: React.CSSProperties;
}) {
  if (!tag) return <span className="tag-chip untagged">Untagged</span>;
  const color = tagColor(tag, allTags);
  return (
    <span
      className={`tag-chip ${tagSlug(tag)}`}
      style={{ color, borderColor: color, ...style }}
    >
      {tag}
      {verified ? ' ✓' : ''}
    </span>
  );
}

export function StatBox({ v, label }: { v: string; label: string }) {
  return (
    <div className="stat-box">
      <b>{v}</b>
      <span>{label}</span>
    </div>
  );
}

/** Initials for seat chips — same derivation as the mockup. */
export function initialsOf(name: string): string {
  return (name || '?')
    .split(/[\s/]/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
