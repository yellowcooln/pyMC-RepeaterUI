import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Setup hardware card layout', () => {
  it('constrains grid cards and wraps long board descriptions within their column', () => {
    const source = readFileSync(join(process.cwd(), 'src/views/Setup.vue'), 'utf-8');

    expect(source).toContain('grid min-w-0 grid-cols-1 md:grid-cols-2');
    expect(source).toContain('min-w-0 overflow-hidden p-4');
    expect(source).toContain('flex min-w-0 items-start justify-between');
    expect(source).toContain('min-w-0 flex-1');
    expect(source.match(/\[overflow-wrap:anywhere\]/g)).toHaveLength(2);
  });
});
