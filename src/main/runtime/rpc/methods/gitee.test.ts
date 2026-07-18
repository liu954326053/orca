import { describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { RpcRequest } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'

const giteeClientMocks = vi.hoisted(() => ({
  createGiteeIssue: vi.fn(),
  getGiteeAuthStatus: vi.fn(),
  getGiteeIssueWithComments: vi.fn(),
  listGiteeIssues: vi.fn(),
  listGiteePulls: vi.fn()
}))

vi.mock('../../../gitee/client', () => giteeClientMocks)

import { GITEE_METHODS } from './gitee'

function makeRequest(method: string, params?: unknown): RpcRequest {
  return { id: 'req-1', authToken: 'tok', method, params }
}

function makeRuntime(): OrcaRuntimeService {
  return {
    getRuntimeId: () => 'test-runtime',
    showRepo: vi.fn().mockResolvedValue({
      id: 'repo-1',
      path: '/repos/orca',
      connectionId: 'ssh-1'
    })
  } as unknown as OrcaRuntimeService
}

describe('Gitee RPC methods', () => {
  it('lists issues on the runtime host for the resolved repository', async () => {
    giteeClientMocks.listGiteeIssues.mockResolvedValue([{ number: 7, title: 'Bug' }])
    const runtime = makeRuntime()
    const dispatcher = new RpcDispatcher({ runtime, methods: GITEE_METHODS })

    const response = await dispatcher.dispatch(
      makeRequest('gitee.listIssues', {
        repo: 'id:repo-1',
        state: 'closed',
        q: 'runtime rpc',
        creator: 'magic',
        assignee: 'octocat',
        labels: ['feature', 'runtime'],
        page: 2,
        limit: 25
      })
    )

    expect(runtime.showRepo).toHaveBeenCalledWith('id:repo-1')
    expect(giteeClientMocks.listGiteeIssues).toHaveBeenCalledWith(
      '/repos/orca',
      {
        state: 'closed',
        q: 'runtime rpc',
        creator: 'magic',
        assignee: 'octocat',
        labels: ['feature', 'runtime'],
        page: 2,
        perPage: 25
      },
      'ssh-1'
    )
    expect(response).toMatchObject({
      ok: true,
      result: { items: [{ number: 7, title: 'Bug' }] }
    })
  })

  it('creates an issue on the runtime host with optional body and labels', async () => {
    giteeClientMocks.createGiteeIssue.mockResolvedValue({
      number: 'IK1X2N',
      title: 'Runtime RPC',
      url: 'https://gitee.com/team/orca/issues/IK1X2N'
    })
    const runtime = makeRuntime()
    const dispatcher = new RpcDispatcher({ runtime, methods: GITEE_METHODS })

    const response = await dispatcher.dispatch(
      makeRequest('gitee.createIssue', {
        repo: 'id:repo-1',
        title: 'Runtime RPC',
        body: 'Expose issue creation over RPC.',
        labels: ['feature', 'runtime']
      })
    )

    expect(runtime.showRepo).toHaveBeenCalledWith('id:repo-1')
    expect(giteeClientMocks.createGiteeIssue).toHaveBeenCalledWith(
      '/repos/orca',
      {
        title: 'Runtime RPC',
        body: 'Expose issue creation over RPC.',
        labels: ['feature', 'runtime']
      },
      'ssh-1'
    )
    expect(response).toMatchObject({
      ok: true,
      result: {
        number: 'IK1X2N',
        title: 'Runtime RPC',
        url: 'https://gitee.com/team/orca/issues/IK1X2N'
      }
    })
  })

  it('gets issue details with comments on the runtime host', async () => {
    giteeClientMocks.getGiteeIssueWithComments.mockResolvedValue({
      number: 7,
      body: 'Details',
      comments: [{ id: 1, body: 'Confirmed' }]
    })
    const runtime = makeRuntime()
    const dispatcher = new RpcDispatcher({ runtime, methods: GITEE_METHODS })

    const response = await dispatcher.dispatch(
      makeRequest('gitee.getIssue', { repo: 'id:repo-1', number: 7 })
    )

    expect(giteeClientMocks.getGiteeIssueWithComments).toHaveBeenCalledWith(
      '/repos/orca',
      7,
      'ssh-1'
    )
    expect(response).toMatchObject({
      ok: true,
      result: {
        number: 7,
        body: 'Details',
        comments: [{ id: 1, body: 'Confirmed' }]
      }
    })
  })

  it('lists pull requests on the runtime host for the resolved repository', async () => {
    giteeClientMocks.listGiteePulls.mockResolvedValue({ items: [{ number: 12 }] })
    const runtime = makeRuntime()
    const dispatcher = new RpcDispatcher({ runtime, methods: GITEE_METHODS })

    const response = await dispatcher.dispatch(
      makeRequest('gitee.listPulls', {
        repo: 'id:repo-1',
        state: 'all',
        page: 3,
        perPage: 40
      })
    )

    expect(giteeClientMocks.listGiteePulls).toHaveBeenCalledWith('/repos/orca', {
      state: 'all',
      page: 3,
      perPage: 40,
      connectionId: 'ssh-1'
    })
    expect(response).toMatchObject({ ok: true, result: { items: [{ number: 12 }] } })
  })

  it('reports Gitee authentication from the runtime host', async () => {
    giteeClientMocks.getGiteeAuthStatus.mockResolvedValue({
      configured: true,
      authenticated: true,
      account: 'magic',
      baseUrl: 'https://gitee.com/api/v5',
      tokenConfigured: true
    })
    const runtime = makeRuntime()
    const dispatcher = new RpcDispatcher({ runtime, methods: GITEE_METHODS })

    const response = await dispatcher.dispatch(makeRequest('gitee.authStatus'))

    expect(giteeClientMocks.getGiteeAuthStatus).toHaveBeenCalledOnce()
    expect(runtime.showRepo).not.toHaveBeenCalled()
    expect(response).toMatchObject({
      ok: true,
      result: { authenticated: true, account: 'magic' }
    })
  })

  it.each([
    ['gitee.listIssues', { repo: 'id:repo-1', state: 'merged' }],
    ['gitee.listIssues', { repo: 'id:repo-1', page: 0 }],
    ['gitee.listIssues', { repo: 'id:repo-1', q: 42 }],
    ['gitee.listIssues', { repo: 'id:repo-1', labels: ['ok', 42] }],
    ['gitee.listPulls', { repo: 'id:repo-1', perPage: 0 }],
    ['gitee.getIssue', { repo: 'id:repo-1', number: -1 }],
    ['gitee.createIssue', { repo: 'id:repo-1', title: '' }],
    ['gitee.createIssue', { repo: 'id:repo-1', title: 'Issue', labels: ['ok', 42] }]
  ])('rejects invalid %s parameters', async (method, params) => {
    const dispatcher = new RpcDispatcher({ runtime: makeRuntime(), methods: GITEE_METHODS })

    const response = await dispatcher.dispatch(makeRequest(method, params))

    expect(response).toMatchObject({ ok: false, error: { code: 'invalid_argument' } })
  })
})
