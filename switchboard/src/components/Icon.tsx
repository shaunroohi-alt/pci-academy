const paths: Record<string, string> = {
  plus: "M12 5v14M5 12h14",
  send: "M5 12h14M13 6l6 6-6 6",
  stop: "M7 7h10v10H7z",
  clip: "M21 11.5l-8.6 8.6a5 5 0 01-7.1-7.1l8.6-8.6a3.5 3.5 0 015 5l-8.6 8.6a2 2 0 01-2.8-2.8l7.9-7.9",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  check: "M5 12l5 5 9-10",
  refresh: "M20 11a8 8 0 10-2.3 5.7M20 5v6h-6",
  sliders: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4",
  chat: "M4 5h16v11H9l-5 4z",
  terminal: "M4 5h16v14H4zM7 9l3 3-3 3M12 15h5",
  folder: "M3 6h6l2 2h10v11H3z",
  file: "M6 3h8l4 4v14H6zM14 3v4h4",
  x: "M6 6l12 12M18 6L6 18",
  menu: "M4 6h16M4 12h16M4 18h16",
  pulse: "M3 12h4l3-7 4 14 3-7h4",
  edit: "M4 20h4L19 9l-4-4L4 16zM13 7l4 4",
  save: "M5 4h11l3 3v13H5zM8 4v5h7M8 20v-6h8v6",
  bolt: "M13 3L5 14h6l-1 7 8-11h-6z",
  chevron: "M9 6l6 6-6 6",
};

export function Icon({ name, size = 16, className }: { name: keyof typeof paths | string; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] ?? ""} />
    </svg>
  );
}
