import { Unicode11Addon } from '@xterm/addon-unicode11';
import type { Terminal, IUnicodeVersionProvider } from '@xterm/xterm';
import { sanitize, type SnapshotRow } from './model';

// Use the exact width table loaded by Terminal.vue, rather than JS string length
// or a different Unicode release. Activation only registers a pure provider.
let provider: IUnicodeVersionProvider;
new Unicode11Addon().activate({
  unicode: {
    register: (value: IUnicodeVersionProvider) => {
      provider = value;
    },
  },
} as unknown as Terminal);
const stripAnsi = (text: string) => text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
export function cellWidth(text: string): number {
  return Array.from(stripAnsi(text)).reduce(
    (sum, ch) => sum + provider.wcwidth(ch.codePointAt(0)!),
    0,
  );
}
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  let cells = 0;
  let separator = '';
  for (const token of text.match(/\s+|\S+/gu) ?? []) {
    if (/^\s+$/u.test(token)) {
      separator = token;
      continue;
    }
    const size = cellWidth(token);
    const gap = line ? separator : '';
    if (line && cells + cellWidth(gap) + size > width) {
      lines.push(line);
      line = '';
      cells = 0;
    }
    if (line) {
      line += gap;
      cells += cellWidth(gap);
    }
    separator = '';
    // Only an indivisible token wider than the whole column may be split.
    // Keep zero-width combining marks attached to their preceding character.
    for (const ch of token) {
      const charCells = cellWidth(ch);
      if (cells + charCells > width && line) {
        lines.push(line);
        line = '';
        cells = 0;
      }
      line += ch;
      cells += charCells;
    }
  }
  if (line || !lines.length) lines.push(line);
  return lines;
}
export interface RenderOptions {
  cols: number;
  rows?: number;
  plain?: boolean;
}
export function renderSnapshot(rows: SnapshotRow[], options: RenderOptions): string[] {
  const cols = Math.max(2, Math.floor(options.cols || 80));
  // Compact outline adapted from assets/logo/openhop_logo_vector.svg:
  // swept-back ears, right-facing head, speed strokes and extended hind leg.
  // Keep the existing Terminal introduction entirely independent.
  const brand = [
    '       __..._',
    '      / / /  \\',
    '      \\_\\/ o  \\_',
    ' --.___  /    __)',
    '   (___)/    /',
    ' --/  ____.-\\',
    '   \\_/    \\__\\',
    '       openHop',
  ];
  const brandWidth = Math.max(...brand.map(cellWidth));
  const side = !options.plain && cols >= 100 && (options.rows ?? 30) >= brand.length;
  const margin = side ? brandWidth + 2 : 0;
  const width = cols - margin;
  const output: string[] = [];
  // Bold text uses the existing theme-aware ANSI white/brightWhite slots.
  // Accent cyan has only 2.14:1 contrast on the light surface; text has >17:1.
  const color = (text: string) => (options.plain ? text : `\x1b[1;37m${text}\x1b[0m`);
  if (!side && !options.plain) output.push(...wrap('openHop · Repeater snapshot', cols).map(color));
  const labelWidth = Math.min(
    rows.reduce((max, row) => Math.max(max, cellWidth(sanitize(row.label)) + 2), 14),
    28,
    Math.floor(width / 3),
  );
  for (const row of rows) {
    const label = sanitize(row.label);
    const value = sanitize(row.value);
    // A bounded shared label column gives each record hanging continuations.
    // Oversized labels and tiny terminals stack; wrap before styling so no
    // responsive path can silently drop bold or split ANSI sequences.
    if (cellWidth(label) + 2 <= labelWidth && width >= 45) {
      const prefix = label + ': ' + ' '.repeat(labelWidth - cellWidth(label) - 2);
      wrap(value, width - labelWidth).forEach((part, i) =>
        output.push((i === 0 ? color(prefix) : ' '.repeat(labelWidth)) + part),
      );
    } else {
      output.push(...wrap(`${label}:`, width).map(color), ...wrap(value, width));
    }
  }
  if (side) {
    return Array.from(
      { length: Math.max(output.length, brand.length) },
      (_, i) => color((brand[i] ?? '').padEnd(brandWidth)) + '  ' + (output[i] ?? ''),
    );
  }
  return output;
}
