import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { defineComponent } from 'vue';

const TOKEN_KEY = 'pymc_jwt_token';
const CLIENT_ID_KEY = 'pymc_client_id';

const authClientMock = {
  get: vi.fn(),
  post: vi.fn(),
};
const fetchAuthMethodsMock = vi.fn();
const exchangeOidcCodeMock = vi.fn();

vi.mock('@/utils/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/api')>();
  return {
    ...actual,
    authClient: authClientMock,
    fetchAuthMethods: fetchAuthMethodsMock,
    exchangeOidcCode: exchangeOidcCodeMock,
  };
});

function b64url(s: string) {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function makeJWT(payload: object): string {
  return [
    b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
    b64url(JSON.stringify(payload)),
    'fakesig',
  ].join('.');
}

function mockAuthGet(
  methods: {
    local?: boolean;
    oidc?: boolean;
    oidc_provider_name?: string;
  } = {},
) {
  fetchAuthMethodsMock.mockResolvedValue({
    success: true,
    local: methods.local ?? true,
    oidc: methods.oidc ?? false,
    oidc_provider_name: methods.oidc_provider_name,
  });
  authClientMock.get.mockImplementation((url: string) => {
    if (url === '/api/site_info') {
      return Promise.resolve({ data: { success: true, site_name: 'Repeater Alpha' } });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

async function mountLogin(route = '/login') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', component: defineComponent({ template: '<div />' }) },
      { path: '/', component: defineComponent({ template: '<div />' }) },
    ],
  });
  await router.push(route);
  await router.isReady();

  const { default: Login } = await import('@/views/Login.vue');
  const wrapper = mount(Login, {
    global: {
      plugins: [router],
      stubs: {
        ChangePasswordModal: true,
        ThemeToggle: true,
        GitHubIcon: true,
        CoffeeIcon: true,
        Spinner: true,
      },
    },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('OIDC login metadata', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    authClientMock.get.mockReset();
    authClientMock.post.mockReset();
    fetchAuthMethodsMock.mockReset();
    exchangeOidcCodeMock.mockReset();
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('fetches public auth methods and preserves the local username/password form unchanged', async () => {
    mockAuthGet({ local: true, oidc: false });

    const { wrapper } = await mountLogin();

    expect(fetchAuthMethodsMock).toHaveBeenCalled();
    expect(wrapper.find('form[action="/"]').exists()).toBe(true);
    expect(wrapper.find('input[name="username"]').exists()).toBe(true);
    expect(wrapper.find('input[name="password"]').exists()).toBe(true);
    expect(wrapper.find('button[type="submit"]').text()).toContain('Sign In');
    expect(wrapper.text()).not.toContain('Sign in with');
  });

  it('shows both local login and a provider button in mixed mode', async () => {
    mockAuthGet({ local: true, oidc: true, oidc_provider_name: 'Authentik' });

    const { wrapper } = await mountLogin();

    expect(wrapper.find('form[action="/"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="oidc-login-button"]').text()).toContain(
      'Sign in with Authentik',
    );
  });

  it('hides local credentials and shows the provider button in OIDC-only mode', async () => {
    mockAuthGet({ local: false, oidc: true, oidc_provider_name: 'Authentik' });

    const { wrapper } = await mountLogin();

    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.get('[data-testid="oidc-login-button"]').text()).toContain(
      'Sign in with Authentik',
    );
  });

  it('falls back to local-compatible login with an actionable metadata error', async () => {
    authClientMock.get.mockImplementation((url: string) => {
      if (url === '/api/site_info') {
        return Promise.resolve({ data: { success: true, site_name: 'Repeater Alpha' } });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    fetchAuthMethodsMock.mockRejectedValue(new Error('provider metadata unavailable'));

    const { wrapper } = await mountLogin();

    expect(wrapper.find('form[action="/"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Could not load sign-in methods');
    expect(wrapper.text()).not.toContain('Sign in with');
  });
});

describe('OIDC browser flow', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    localStorage.setItem(CLIENT_ID_KEY, 'browser-client-1');
    authClientMock.get.mockReset();
    authClientMock.post.mockReset();
    fetchAuthMethodsMock.mockReset();
    exchangeOidcCodeMock.mockReset();
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('starts OIDC with the existing client ID and a safe local return_to', async () => {
    const { startOidcLogin } = await import('@/utils/auth');
    const navigate = vi.fn();

    startOidcLogin('browser-client-1', '/configuration?tab=web', navigate);

    expect(navigate).toHaveBeenCalledWith(
      '/auth/oidc/start?client_id=browser-client-1&return_to=%2Fconfiguration%3Ftab%3Dweb',
    );
  });

  it('normalizes unsafe return_to values before starting OIDC', async () => {
    const { startOidcLogin } = await import('@/utils/auth');
    const navigate = vi.fn();

    startOidcLogin('browser-client-1', 'https://evil.example', navigate);

    expect(navigate).toHaveBeenCalledWith(
      '/auth/oidc/start?client_id=browser-client-1&return_to=%2F',
    );
  });

  it('exchanges oidc_exchange, stores only the returned internal JWT, cleans history, and navigates home', async () => {
    mockAuthGet({ local: true, oidc: true, oidc_provider_name: 'Authentik' });
    exchangeOidcCodeMock.mockResolvedValue({ success: true, token: 'internal.jwt.token' });

    const { router } = await mountLogin('/login?oidc_exchange=one-time-code');

    expect(exchangeOidcCodeMock).toHaveBeenCalledWith('one-time-code', 'browser-client-1');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('internal.jwt.token');
    expect(router.currentRoute.value.path).toBe('/');
    expect(router.currentRoute.value.query.oidc_exchange).toBeUndefined();
  });

  it('cleans a failed exchange code without marking the session authenticated', async () => {
    mockAuthGet({ local: true, oidc: true, oidc_provider_name: 'Authentik' });
    exchangeOidcCodeMock.mockResolvedValue({
      success: false,
      error: 'OIDC sign-in expired. Try again.',
    });

    const { wrapper, router } = await mountLogin('/login?oidc_exchange=expired-code');

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(router.currentRoute.value.path).toBe('/login');
    expect(router.currentRoute.value.query.oidc_exchange).toBeUndefined();
    expect(wrapper.text()).toContain('OIDC sign-in expired. Try again.');
  });
});

describe('OIDC session metadata behavior', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    authClientMock.get.mockReset();
    authClientMock.post.mockReset();
    fetchAuthMethodsMock.mockReset();
    exchangeOidcCodeMock.mockReset();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('recognizes OIDC-authenticated internal JWTs from backend session metadata', async () => {
    const { isOidcAuthenticated } = await import('@/utils/auth');
    localStorage.setItem(
      TOKEN_KEY,
      makeJWT({
        sub: 'alice',
        client_id: 'browser-client-1',
        auth_source: 'oidc',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    );

    expect(isOidcAuthenticated()).toBe(true);
  });

  it('does not refresh an OIDC token after backend requires reauthentication', async () => {
    const nearExpiryOidcToken = makeJWT({
      sub: 'alice',
      client_id: 'browser-client-1',
      auth_source: 'oidc',
      exp: Math.floor(Date.now() / 1000) + 120,
    });
    localStorage.setItem(TOKEN_KEY, nearExpiryOidcToken);
    authClientMock.get.mockResolvedValue({ data: { success: true } });
    authClientMock.post.mockResolvedValue({
      data: { success: false, error: 'reauthentication_required' },
    });

    const { apiClient } = await import('@/utils/api');
    const { useAppRuntimeStore } = await import('@/stores/appRuntime');
    const store = useAppRuntimeStore();
    const spy = vi.spyOn(store, 'handleAuthFailure').mockResolvedValue(undefined);
    type RequestInterceptorHandler = {
      fulfilled: (config: { url: string; headers: Record<string, string> }) => Promise<unknown>;
    };
    const interceptorHandlers = apiClient.interceptors.request as unknown as {
      handlers: Array<RequestInterceptorHandler | null>;
    };
    const handler = interceptorHandlers.handlers.find(
      (h: unknown) => h !== null,
    ) as RequestInterceptorHandler;

    await expect(handler.fulfilled({ url: '/api/stats', headers: {} })).rejects.toThrow();

    expect(spy).toHaveBeenCalledWith('reauthentication');
  });

  it('clears the local token before logout navigation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ needs_setup: false }),
      }),
    );
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    localStorage.setItem(TOKEN_KEY, 'still-present');
    const { useAppRuntimeStore } = await import('@/stores/appRuntime');
    const store = useAppRuntimeStore();

    await store.stopSession('logout');

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});
