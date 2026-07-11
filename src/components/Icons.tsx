const PATHS: Record<string, string> = {
  hud: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  results: '<line x1="4" y1="20" x2="4" y2="12"/><line x1="12" y1="20" x2="12" y2="6"/><line x1="20" y1="20" x2="20" y2="15"/>',
  players: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/><circle cx="17.2" cy="9" r="2.4"/><path d="M15.5 20c0-2.6 1-4.6 3-5.4"/>',
  venues: '<path d="M4 21V6l8-3 8 3v15"/><path d="M4 21h16"/><path d="M9 9h1M14 9h1M9 13h1M14 13h1M9 17h2v4h-2z"/>',
  population: '<circle cx="12" cy="7.5" r="3"/><circle cx="5.5" cy="16.5" r="2.4"/><circle cx="18.5" cy="16.5" r="2.4"/><path d="M12 10.5v3M9.7 16h4.6M5.5 14.4V13M18.5 14.4V13"/>',
  settings: '<line x1="4" y1="7" x2="20" y2="7"/><circle cx="9" cy="7" r="2"/><line x1="4" y1="14" x2="20" y2="14"/><circle cx="16" cy="14" r="2"/><line x1="4" y1="21" x2="20" y2="21"/><circle cx="11" cy="21" r="2"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.6" y2="16.6"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  note: '<path d="M4 4h16v12H7l-3 3z"/>',
  cards: '<rect x="3" y="7" width="18" height="12" rx="1.5"/><path d="M3 11h18"/>',
};

export function Icon({
  name,
  className = 'icon',
  style,
}: {
  name: keyof typeof PATHS | string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      dangerouslySetInnerHTML={{ __html: PATHS[name] ?? '' }}
    />
  );
}
