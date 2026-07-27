import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { defineComponent } from 'vue'

// Mock authClient so onMounted's site_info call does not make real HTTP requests.
vi.mock('@/utils/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/api')>()
  return {
    ...actual,
    authClient: {
      get: vi.fn().mockResolvedValue({ data: { success: true, site_name: 'Test' } }),
      post: vi.fn().mockResolvedValue({ data: {} }),
    },
    fetchAuthMethods: vi.fn().mockResolvedValue({
      success: true,
      local: true,
      oidc: false,
    }),
  }
})

describe('Login form — iOS autofill contract', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      addListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('form has action="/" so non-Safari iOS browsers recognise it as a login form', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/login', component: defineComponent({ template: '<div/>' }) },
        { path: '/', component: defineComponent({ template: '<div/>' }) },
      ],
    })
    router.push('/login')
    await router.isReady()

    const { default: Login } = await import('@/views/Login.vue')
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
    })
    await flushPromises()

    expect(wrapper.find('form').attributes('action')).toBe('/')
  })

  it('username input has autocomplete="username"', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/login', component: defineComponent({ template: '<div/>' }) }],
    })
    router.push('/login')
    await router.isReady()

    const { default: Login } = await import('@/views/Login.vue')
    const wrapper = mount(Login, {
      global: {
        plugins: [router],
        stubs: { ChangePasswordModal: true, ThemeToggle: true, GitHubIcon: true, CoffeeIcon: true, Spinner: true },
      },
    })
    await flushPromises()

    const usernameInput = wrapper.find('input[name="username"]')
    expect(usernameInput.attributes('autocomplete')).toBe('username')
  })

  it('password input has autocomplete="current-password"', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/login', component: defineComponent({ template: '<div/>' }) }],
    })
    router.push('/login')
    await router.isReady()

    const { default: Login } = await import('@/views/Login.vue')
    const wrapper = mount(Login, {
      global: {
        plugins: [router],
        stubs: { ChangePasswordModal: true, ThemeToggle: true, GitHubIcon: true, CoffeeIcon: true, Spinner: true },
      },
    })
    await flushPromises()

    const passwordInput = wrapper.find('input[name="password"]')
    expect(passwordInput.attributes('autocomplete')).toBe('current-password')
  })

  it('GitHub button links to the openHop Repeater repository', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/login', component: defineComponent({ template: '<div/>' }) }],
    })
    router.push('/login')
    await router.isReady()

    const { default: Login } = await import('@/views/Login.vue')
    const wrapper = mount(Login, {
      global: {
        plugins: [router],
        stubs: { ChangePasswordModal: true, ThemeToggle: true, GitHubIcon: true, CoffeeIcon: true, Spinner: true },
      },
    })
    await flushPromises()

    expect(wrapper.find('a[title="GitHub"]').attributes('href')).toBe(
      'https://github.com/openhop-dev/openhop_repeater',
    )
  })

  it('shows the same four community links as the authenticated sidebar', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/login', component: defineComponent({ template: '<div/>' }) }],
    })
    router.push('/login')
    await router.isReady()

    const { default: Login } = await import('@/views/Login.vue')
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
    })
    await flushPromises()

    const expectedLinks = [
      ['Discord', 'https://discord.gg/6dYjGpPSK'],
      ['openHop Website', 'https://openhop.dev'],
      ['GitHub', 'https://github.com/openhop-dev/openhop_repeater'],
      ['Buy Me a Coffee', 'https://buymeacoffee.com/rightup'],
    ]

    expect(wrapper.findAll('[data-testid="community-links"] a')).toHaveLength(4)
    expect(
      wrapper.find('a[title="openHop Website"] [data-testid="openhop-website-icon"]').exists(),
    ).toBe(true)
    expect(
      wrapper
        .get('a[title="openHop Website"] [data-testid="openhop-website-icon"]')
        .attributes('data-logo-source'),
    ).toBe('official-openhop-mark')
    const websiteIcon = wrapper.get(
      'a[title="openHop Website"] [data-testid="openhop-website-icon"]',
    )
    expect(websiteIcon.attributes('data-icon-treatment')).toBe('bold-official-mark')
    expect(websiteIcon.classes()).toContain('sm:w-7')
    expect(websiteIcon.classes()).not.toContain('group-hover:text-primary-300')
    for (const [title, href] of expectedLinks) {
      const link = wrapper.get(`a[title="${title}"]`)
      expect(link.attributes('href')).toBe(href)
      expect(link.attributes('target')).toBe('_blank')
      expect(link.attributes('rel')).toBe('noopener noreferrer')
    }
  })
})
