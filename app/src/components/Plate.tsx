interface Props {
  caption: string;
  height?: number;
}

/** Photograph placeholder — stands in for the design's drop-in image plates. */
export function Plate({ caption, height = 200 }: Props) {
  return (
    <div className="plate pci-plate" style={{ height }}>
      <div className="ring" />
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="10" r="1.75" />
        <path d="m21 15-5-5-9 9" />
      </svg>
      <span>{caption}</span>
    </div>
  );
}
