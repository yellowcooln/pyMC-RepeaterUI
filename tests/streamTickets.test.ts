import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import ApiService, { authClient } from '@/utils/api';

const STREAM_CALLERS = [
  'src/utils/api.ts',
  'src/stores/websocket.ts',
  'src/views/GPSDiagnostics.vue',
  'src/views/CADCalibration.vue',
  'src/views/Logs.vue',
  'src/views/Neighbors.vue',
  'src/components/modals/UpdateModal.vue',
];

describe('stream tickets', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('requests an endpoint-scoped ticket through authenticated HTTP', async () => {
    const post = vi.spyOn(authClient, 'post').mockResolvedValue({
      data: {
        success: true,
        ticket: 'opaque-once',
        path: '/api/gps_stream',
        expires_in: 30,
      },
    });

    await expect(ApiService.createStreamTicket('/api/gps-stream')).resolves.toBe('opaque-once');
    expect(post).toHaveBeenCalledWith('/auth/stream_ticket', { path: '/api/gps-stream' });
  });

  it('rejects malformed ticket responses', async () => {
    vi.spyOn(authClient, 'post').mockResolvedValue({ data: { success: true } });
    await expect(ApiService.createStreamTicket('/ws/packets')).rejects.toThrow(
      'Stream ticket response was invalid',
    );
  });

  it('does not place reusable JWTs in browser stream URLs', () => {
    for (const relativePath of STREAM_CALLERS) {
      const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8');
      expect(source, relativePath).not.toMatch(/[?&]token=/);
      expect(source, relativePath).not.toContain("params.set('token'");
      expect(source, relativePath).not.toContain("query.set('token'");
    }
  });
});
