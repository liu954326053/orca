import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Store } from '../persistence'
import type { Repo } from '../../shared/types'
import { toSshExecutionHostId } from '../../shared/execution-host'

const {
  ipcHandlers,
  getGiteeAuthStatusMock,
  getGiteeRepoSlugMock,
  listGiteeIssuesMock,
  getGiteeIssueWithCommentsMock,
  listGiteePullsMock,
  createGiteeIssueMock,
  updateGiteeIssueMock,
  addGiteeIssueCommentMock
} = vi.hoisted(() => ({
  ipcHandlers: new Map<string, (...args: unknown[]) => unknown>(),
  getGiteeAuthStatusMock: vi.fn(),
  getGiteeRepoSlugMock: vi.fn(),
  listGiteeIssuesMock: vi.fn(),
  getGiteeIssueWithCommentsMock: vi.fn(),
  listGiteePullsMock: vi.fn(),
  createGiteeIssueMock: vi.fn(),
  updateGiteeIssueMock: vi.fn(),
  addGiteeIssueCommentMock: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler)
    })
  }
}))

vi.mock('../gitee/client', () => ({
  getGiteeAuthStatus: getGiteeAuthStatusMock,
  getGiteeRepoSlug: getGiteeRepoSlugMock,
  listGiteeIssues: listGiteeIssuesMock,
  getGiteeIssueWithComments: getGiteeIssueWithCommentsMock,
  listGiteePulls: listGiteePullsMock,
  createGiteeIssue: createGiteeIssueMock,
  updateGiteeIssue: updateGiteeIssueMock,
  addGiteeIssueComment: addGiteeIssueCommentMock
}))

import { registerGiteeHandlers } from './gitee'

function repo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 'repo-local',
    path: '/local/orca',
    displayName: 'Orca',
    badgeColor: '#737373',
    addedAt: 1,
    ...overrides
  }
}

function storeWithRepos(repos: Repo[]): Pick<Store, 'getRepos' | 'getRepo' | 'getSettings'> {
  return {
    getRepos: () => repos,
    getRepo: (id: string) => repos.find((candidate) => candidate.id === id),
    getSettings: () =>
      ({
        localWindowsRuntimeDefault: { kind: 'windows-host' }
      }) as ReturnType<Store['getSettings']>
  }
}

describe('Gitee IPC handlers', () => {
  beforeEach(() => {
    ipcHandlers.clear()
    for (const mock of [
      getGiteeAuthStatusMock,
      getGiteeRepoSlugMock,
      listGiteeIssuesMock,
      getGiteeIssueWithCommentsMock,
      listGiteePullsMock,
      createGiteeIssueMock,
      updateGiteeIssueMock,
      addGiteeIssueCommentMock
    ]) {
      mock.mockReset()
    }
  })

  it('registers task-page channels and returns auth status without secrets', async () => {
    getGiteeAuthStatusMock.mockResolvedValueOnce({
      configured: true,
      authenticated: true,
      account: 'alice',
      baseUrl: 'https://gitee.com/api/v5',
      tokenConfigured: true
    })
    registerGiteeHandlers(storeWithRepos([repo()]) as Store)

    expect([...ipcHandlers.keys()].sort()).toEqual(
      [
        'gitee:addIssueComment',
        'gitee:authStatus',
        'gitee:createIssue',
        'gitee:getIssue',
        'gitee:listIssues',
        'gitee:listPulls',
        'gitee:repoSlug',
        'gitee:updateIssue'
      ].sort()
    )

    const status = await ipcHandlers.get('gitee:authStatus')?.(null)
    expect(status).toEqual({
      configured: true,
      authenticated: true,
      account: 'alice',
      baseUrl: 'https://gitee.com/api/v5',
      tokenConfigured: true
    })
    expect(JSON.stringify(status)).not.toMatch(/gitee-token|ORCA_GITEE_TOKEN|Authorization/i)
  })

  it('forwards listIssues/getIssue/listPulls through the registered repo', async () => {
    listGiteeIssuesMock.mockResolvedValueOnce([])
    getGiteeIssueWithCommentsMock.mockResolvedValueOnce(null)
    listGiteePullsMock.mockResolvedValueOnce({ items: [] })
    registerGiteeHandlers(storeWithRepos([repo()]) as Store)

    await expect(
      ipcHandlers.get('gitee:listIssues')?.(null, {
        repoPath: '/local/orca',
        state: 'open',
        limit: 20
      })
    ).resolves.toEqual({ items: [] })

    await ipcHandlers.get('gitee:getIssue')?.(null, {
      repoPath: '/local/orca',
      number: 7
    })
    await ipcHandlers.get('gitee:listPulls')?.(null, {
      repoPath: '/local/orca',
      state: 'all',
      page: 2,
      perPage: 40
    })

    expect(listGiteeIssuesMock).toHaveBeenCalledWith(
      '/local/orca',
      { state: 'open', page: 1, perPage: 20 },
      null,
      {}
    )
    expect(getGiteeIssueWithCommentsMock).toHaveBeenCalledWith('/local/orca', '7', null, {})
    expect(listGiteePullsMock).toHaveBeenCalledWith('/local/orca', {
      state: 'all',
      page: 2,
      perPage: 40,
      connectionId: null
    })
  })

  it('forwards q/creator/assignee/labels filters and progressing/all states', async () => {
    listGiteeIssuesMock.mockResolvedValue([])
    registerGiteeHandlers(storeWithRepos([repo()]) as Store)

    await ipcHandlers.get('gitee:listIssues')?.(null, {
      repoPath: '/local/orca',
      state: 'progressing',
      q: '  crash on start  ',
      creator: ' alice ',
      assignee: ' bob ',
      labels: ['bug', '  ', 'p1', 42],
      limit: 20
    })

    expect(listGiteeIssuesMock).toHaveBeenLastCalledWith(
      '/local/orca',
      {
        state: 'progressing',
        page: 1,
        perPage: 20,
        q: 'crash on start',
        creator: 'alice',
        assignee: 'bob',
        labels: ['bug', 'p1']
      },
      null,
      {}
    )

    await ipcHandlers.get('gitee:listIssues')?.(null, {
      repoPath: '/local/orca',
      state: 'all'
    })
    expect(listGiteeIssuesMock).toHaveBeenLastCalledWith(
      '/local/orca',
      { state: 'all', page: 1, perPage: 20 },
      null,
      {}
    )
  })

  it('accepts alphanumeric string issue numbers for getIssue', async () => {
    getGiteeIssueWithCommentsMock.mockResolvedValue(null)
    registerGiteeHandlers(storeWithRepos([repo()]) as Store)

    await ipcHandlers.get('gitee:getIssue')?.(null, {
      repoPath: '/local/orca',
      number: 'IK1X2N'
    })

    expect(getGiteeIssueWithCommentsMock).toHaveBeenCalledWith('/local/orca', 'IK1X2N', null, {})
  })

  it('returns the created issue number or an error when creation fails', async () => {
    createGiteeIssueMock.mockResolvedValueOnce({
      number: 'IK1X2N',
      title: 'New',
      state: 'open',
      body: 'body',
      url: 'https://gitee.com/team/repo/issues/IK1X2N',
      updatedAt: '',
      author: 'alice',
      labels: []
    })
    createGiteeIssueMock.mockResolvedValueOnce(null)
    registerGiteeHandlers(storeWithRepos([repo()]) as Store)

    await expect(
      ipcHandlers.get('gitee:createIssue')?.(null, {
        repoPath: '/local/orca',
        title: 'New'
      })
    ).resolves.toEqual({
      ok: true,
      number: 'IK1X2N',
      url: 'https://gitee.com/team/repo/issues/IK1X2N'
    })

    await expect(
      ipcHandlers.get('gitee:createIssue')?.(null, {
        repoPath: '/local/orca',
        title: 'New'
      })
    ).resolves.toMatchObject({ ok: false })
  })

  it('resolves repoId + source host before listing pulls', async () => {
    const remoteRepo = repo({
      id: 'repo-ssh',
      path: '/ssh/orca',
      connectionId: 'builder',
      executionHostId: toSshExecutionHostId('builder')
    })
    listGiteePullsMock.mockResolvedValueOnce({ items: [] })
    registerGiteeHandlers(storeWithRepos([repo(), remoteRepo]) as Store)

    await expect(
      ipcHandlers.get('gitee:listPulls')?.(null, {
        repoPath: '/does/not/matter',
        repoId: 'repo-ssh',
        sourceContext: {
          kind: 'task-source',
          provider: 'gitee',
          projectId: 'gitee:team/orca',
          hostId: toSshExecutionHostId('builder'),
          repoId: 'repo-ssh'
        } as never,
        state: 'open'
      })
    ).resolves.toEqual({ items: [] })

    expect(listGiteePullsMock).toHaveBeenCalledWith('/ssh/orca', {
      state: 'open',
      page: 1,
      perPage: 30,
      connectionId: 'builder'
    })
  })

  it('rejects unknown repo paths and host mismatches', async () => {
    registerGiteeHandlers(storeWithRepos([repo()]) as Store)

    await expect(
      ipcHandlers.get('gitee:listIssues')?.(null, { repoPath: '/unknown' })
    ).rejects.toThrow('Access denied: unknown repository path')

    await expect(
      ipcHandlers.get('gitee:listIssues')?.(null, {
        repoPath: '/local/orca',
        sourceContext: {
          kind: 'task-source',
          provider: 'gitee',
          projectId: 'gitee:team/orca',
          hostId: toSshExecutionHostId('other'),
          repoId: 'repo-local'
        } as never
      })
    ).rejects.toThrow('Access denied: Gitee source host does not match repository host')
  })

  it('normalizes invalid issue numbers and optional mutations', async () => {
    createGiteeIssueMock.mockResolvedValueOnce({
      number: 3,
      title: 'New',
      state: 'open',
      body: 'body',
      url: 'https://gitee.com/team/repo/issues/3',
      updatedAt: '',
      author: 'alice',
      labels: []
    })
    updateGiteeIssueMock.mockResolvedValueOnce({
      number: 3,
      title: 'New',
      state: 'closed',
      body: 'body',
      url: 'https://gitee.com/team/repo/issues/3',
      updatedAt: '',
      author: 'alice',
      labels: []
    })
    addGiteeIssueCommentMock.mockResolvedValueOnce({
      id: 1,
      body: 'hi',
      author: 'alice',
      createdAt: '',
      updatedAt: ''
    })
    registerGiteeHandlers(storeWithRepos([repo()]) as Store)

    await expect(
      ipcHandlers.get('gitee:getIssue')?.(null, { repoPath: '/local/orca', number: 0 })
    ).resolves.toBeNull()
    expect(getGiteeIssueWithCommentsMock).not.toHaveBeenCalled()

    await expect(
      ipcHandlers.get('gitee:createIssue')?.(null, {
        repoPath: '/local/orca',
        title: 'New',
        body: 'body'
      })
    ).resolves.toMatchObject({ ok: true, number: 3 })

    await expect(
      ipcHandlers.get('gitee:updateIssue')?.(null, {
        repoPath: '/local/orca',
        number: 3,
        updates: { state: 'closed' }
      })
    ).resolves.toEqual({ ok: true })

    await expect(
      ipcHandlers.get('gitee:addIssueComment')?.(null, {
        repoPath: '/local/orca',
        number: 3,
        body: 'hi'
      })
    ).resolves.toMatchObject({ ok: true })
  })
})
