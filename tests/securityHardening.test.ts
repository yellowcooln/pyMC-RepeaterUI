import { describe, expect, it } from 'vitest';

import { summarizeApiError } from '@/utils/api';
import { loadConfigCache, sanitizeConfigForCache } from '@/stores/system';

describe('frontend security hardening', () => {
  it('summarizes Axios failures without retaining headers, response data, or query secrets', () => {
    const sentinel = 'SENTINEL-BEARER-SECRET';
    const summary = summarizeApiError({
      code: 'ERR_BAD_REQUEST',
      message: `request failed with ${sentinel}`,
      config: {
        method: 'post',
        url: `/auth/refresh?token=${sentinel}`,
        headers: { Authorization: `Bearer ${sentinel}` },
      },
      response: {
        status: 401,
        data: { token: sentinel },
      },
    });

    expect(summary).toEqual({
      status: 401,
      code: 'ERR_BAD_REQUEST',
      method: 'POST',
      path: '/auth/refresh',
    });
    expect(summarizeApiError(null)).toEqual({});
    expect(summarizeApiError(undefined)).toEqual({});
    expect(JSON.stringify(summary)).not.toContain(sentinel);
  });

  it('persists only the minimal non-secret configuration cache', () => {
    const sentinel = 'SENTINEL-CONFIG-SECRET';
    const cached = sanitizeConfigForCache({
      node_name: 'Hilltop',
      radio_type: 'pymc_tcp',
      repeater: {
        mode: 'monitor',
        latitude: 42.1,
        longitude: -71.2,
        admin_password: sentinel,
      },
      duty_cycle: {
        enforcement_enabled: true,
        max_airtime_percent: {
          source: sentinel,
          parsedValue: 10,
          secret: sentinel,
        },
      },
      mqtt_brokers: {
        brokers: [{ password: sentinel, token: sentinel }],
      },
      pymc_tcp: { token: sentinel },
    } as never);

    expect(cached).toEqual({
      node_name: 'Hilltop',
      radio_type: 'pymc_tcp',
      repeater: {
        mode: 'monitor',
        latitude: 42.1,
        longitude: -71.2,
      },
      duty_cycle: {
        enforcement_enabled: true,
        max_airtime_percent: { parsedValue: 10 },
      },
    });
    expect(JSON.stringify(cached)).not.toContain(sentinel);
  });

  it('sanitizes and rewrites a legacy cache before returning it', () => {
    sessionStorage.setItem(
      'pymc_config_cache',
      JSON.stringify({
        node_name: 'Legacy',
        web: { auth: { jwt_secret: 'OLD-SECRET' } },
        pymc_tcp: { token: 'OLD-SECRET' },
      }),
    );

    expect(loadConfigCache()).toEqual({ node_name: 'Legacy' });
    expect(sessionStorage.getItem('pymc_config_cache')).toBe('{"node_name":"Legacy"}');
  });
});
