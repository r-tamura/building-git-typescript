// SRG: Select Graphic Rendition
const SRG_CODES = {
  red: 31,
  green: 32,
} as const;

export type Style = keyof typeof SRG_CODES;

export function format(style: Style, text: string) {
  const code = SRG_CODES[style];
  return `\x1b[${code}m${text}\x1b[m`;
}
