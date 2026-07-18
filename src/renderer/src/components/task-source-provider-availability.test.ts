import { describe, expect, it } from 'vitest'
import type { PreflightStatus } from '../../../preload/api-types'
import type { TaskSourceContext } from '../../../shared/task-source-context'
import {
  getGiteeProviderAvailability,
  getGiteeTaskSourceAvailabilityNotice,
  getRepoBackedProviderAvailability
} from './task-source-provider-availability'

const readyPreflight: PreflightStatus = {
  git: { installed: true },
  gh: { installed: true, authenticated: true },
  glab: { installed: true, authenticated: true }
}

function source(hostId: TaskSourceContext['hostId']): TaskSourceContext {
  return {
    kind: 'task-source',
    provider: 'github',
    projectId: 'github:stablyai/orca',
    hostId,
    repoId: `repo-${hostId}`
  }
}

describe('task source provider availability', () => {
  it('marks desktop-owned GitHub sources unavailable when gh auth is missing', () => {
    expect(
      getRepoBackedProviderAvailability({
        provider: 'github',
        contexts: [source('local'), source('ssh:builder')],
        preflightReady: true,
        preflightStatus: {
          ...readyPreflight,
          gh: { installed: true, authenticated: false }
        }
      })
    ).toEqual([
      { hostId: 'local', reason: 'missing-provider-auth' },
      { hostId: 'ssh:builder', reason: 'missing-provider-auth' }
    ])
  })

  it('marks desktop-owned GitLab sources unavailable when glab is missing', () => {
    expect(
      getRepoBackedProviderAvailability({
        provider: 'gitlab',
        contexts: [source('local')],
        preflightReady: true,
        preflightStatus: {
          ...readyPreflight,
          glab: { installed: false, authenticated: false }
        }
      })
    ).toEqual([{ hostId: 'local', reason: 'unavailable-source-tool' }])
  })

  it('marks GitLab unsupported when a host preflight payload predates GitLab support', () => {
    const { glab: _glab, ...preGitLabPreflight } = readyPreflight

    expect(
      getRepoBackedProviderAvailability({
        provider: 'gitlab',
        contexts: [source('local')],
        preflightReady: true,
        preflightStatus: preGitLabPreflight
      })
    ).toEqual([{ hostId: 'local', reason: 'unsupported-provider' }])
  })

  it('does not apply desktop preflight to runtime-owned sources', () => {
    expect(
      getRepoBackedProviderAvailability({
        provider: 'github',
        contexts: [source('runtime:server')],
        preflightReady: true,
        preflightStatus: {
          ...readyPreflight,
          gh: { installed: false, authenticated: false }
        }
      })
    ).toEqual([])
  })

  it('marks runtime-owned GitHub sources unavailable from their own preflight', () => {
    expect(
      getRepoBackedProviderAvailability({
        provider: 'github',
        contexts: [source('runtime:server')],
        preflightReady: true,
        preflightStatus: readyPreflight,
        runtimePreflightStatusByHostId: new Map([
          [
            'runtime:server',
            {
              checked: true,
              status: {
                ...readyPreflight,
                gh: { installed: true, authenticated: false }
              }
            }
          ]
        ])
      })
    ).toEqual([{ hostId: 'runtime:server', reason: 'missing-provider-auth' }])
  })

  it('waits for runtime preflight before reporting runtime provider availability', () => {
    expect(
      getRepoBackedProviderAvailability({
        provider: 'github',
        contexts: [source('runtime:server')],
        preflightReady: true,
        preflightStatus: readyPreflight,
        runtimePreflightStatusByHostId: new Map([
          [
            'runtime:server',
            {
              checked: false,
              status: null
            }
          ]
        ])
      })
    ).toEqual([])
  })

  it('marks runtime-owned GitLab sources unsupported when runtime preflight lacks GitLab', () => {
    const { glab: _glab, ...preGitLabPreflight } = readyPreflight

    expect(
      getRepoBackedProviderAvailability({
        provider: 'gitlab',
        contexts: [source('runtime:server')],
        preflightReady: true,
        preflightStatus: readyPreflight,
        runtimePreflightStatusByHostId: new Map([
          [
            'runtime:server',
            {
              checked: true,
              status: preGitLabPreflight
            }
          ]
        ])
      })
    ).toEqual([{ hostId: 'runtime:server', reason: 'unsupported-provider' }])
  })

  it('waits for preflight before reporting provider availability', () => {
    expect(
      getRepoBackedProviderAvailability({
        provider: 'github',
        contexts: [source('local')],
        preflightReady: false,
        preflightStatus: {
          ...readyPreflight,
          gh: { installed: false, authenticated: false }
        }
      })
    ).toEqual([])
  })
})

describe('Gitee provider availability', () => {
  function giteeSource(hostId: TaskSourceContext['hostId']): TaskSourceContext {
    return {
      kind: 'task-source',
      provider: 'gitee',
      projectId: 'gitee:owner/repo',
      hostId,
      repoId: `repo-${hostId}`
    }
  }

  it('marks a source unavailable when ORCA_GITEE_TOKEN is not configured', () => {
    expect(
      getGiteeProviderAvailability({
        contexts: [giteeSource('local')],
        preflightReady: true,
        preflightStatus: {
          ...readyPreflight,
          gitee: {
            configured: false,
            authenticated: false,
            account: null,
            baseUrl: null,
            tokenConfigured: false
          }
        }
      })
    ).toEqual([{ hostId: 'local', reason: 'missing-provider-auth' }])
  })

  it('reports no unavailability when the token is configured', () => {
    expect(
      getGiteeProviderAvailability({
        contexts: [giteeSource('local')],
        preflightReady: true,
        preflightStatus: {
          ...readyPreflight,
          gitee: {
            configured: true,
            authenticated: true,
            account: 'alice',
            baseUrl: 'https://gitee.com/api/v5',
            tokenConfigured: true
          }
        }
      })
    ).toEqual([])
  })

  it('marks a source unavailable when the configured token fails authentication', () => {
    expect(
      getGiteeProviderAvailability({
        contexts: [giteeSource('local')],
        preflightReady: true,
        preflightStatus: {
          ...readyPreflight,
          gitee: {
            configured: true,
            authenticated: false,
            account: null,
            baseUrl: 'https://gitee.com/api/v5',
            tokenConfigured: true
          }
        }
      })
    ).toEqual([{ hostId: 'local', reason: 'missing-provider-auth' }])
  })

  it('names the token required to restore an authenticated source', () => {
    expect(
      getGiteeTaskSourceAvailabilityNotice({
        providerLabel: 'Gitee',
        hostAvailability: [{ hostId: 'local', reason: 'missing-provider-auth' }]
      })
    ).toEqual({
      label: 'Gitee source unavailable: Local Mac provider auth needed. Set ORCA_GITEE_TOKEN.',
      title: 'Set ORCA_GITEE_TOKEN in the source environment, then reload Gitee.',
      blocking: true
    })
  })

  it('marks unavailable when preflight payload predates Gitee support', () => {
    expect(
      getGiteeProviderAvailability({
        contexts: [giteeSource('local')],
        preflightReady: true,
        preflightStatus: readyPreflight
      })
    ).toEqual([{ hostId: 'local', reason: 'missing-provider-auth' }])
  })

  it('waits for preflight before reporting Gitee availability', () => {
    expect(
      getGiteeProviderAvailability({
        contexts: [giteeSource('local')],
        preflightReady: false,
        preflightStatus: {
          ...readyPreflight,
          gitee: {
            configured: false,
            authenticated: false,
            account: null,
            baseUrl: null,
            tokenConfigured: false
          }
        }
      })
    ).toEqual([])
  })
})
