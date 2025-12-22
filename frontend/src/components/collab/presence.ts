export function hashToHue(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 360;
}

export function presenceColor(userId: string): {
  color: string;
  colorLight: string;
} {
  const hue = hashToHue(userId);
  // Use comma-separated hsl/hsla for broad browser compatibility.
  const color = `hsl(${hue}, 92%, 62%)`;
  const colorLight = `hsla(${hue}, 92%, 62%, 0.28)`;
  return { color, colorLight };
}
