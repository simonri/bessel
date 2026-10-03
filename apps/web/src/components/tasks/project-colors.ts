// Each project gets a stable pastel, picked from its name, so its tags and
// filter chip match everywhere without anyone having to choose colours.
const PASTEL_HUES = [305, 235, 165, 45, 0, 95, 270, 200] as const;

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function projectHue(name: string): number {
  return PASTEL_HUES[hashName(name.toLowerCase()) % PASTEL_HUES.length];
}

export function projectChipStyle(name: string): React.CSSProperties {
  const hue = projectHue(name);
  return {
    color: `oklch(0.84 0.08 ${hue})`,
    backgroundColor: `oklch(0.78 0.09 ${hue} / 0.14)`,
  };
}

export function projectDotColor(name: string): string {
  return `oklch(0.78 0.11 ${projectHue(name)})`;
}
