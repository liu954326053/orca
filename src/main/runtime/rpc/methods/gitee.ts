import { z } from 'zod'
import {
  createGiteeIssue,
  getGiteeAuthStatus,
  getGiteeIssueWithComments,
  listGiteeIssues,
  listGiteePulls
} from '../../../gitee/client'
import { defineMethod, type RpcMethod } from '../core'
import { requiredString } from '../schemas'

const RepoSelector = z.object({
  repo: requiredString('Missing repo selector')
})

const Page = z.number().int().positive().max(10_000).optional()
const IssuePageSize = z.number().int().positive().max(100).optional()
const PullPageSize = z.number().int().positive().max(50).optional()
const IssueState = z.enum(['open', 'closed', 'progressing', 'rejected', 'all']).optional()
const PullState = z.enum(['open', 'closed', 'all']).optional()

const IssuesList = RepoSelector.extend({
  state: IssueState,
  q: z.string().optional(),
  creator: z.string().optional(),
  assignee: z.string().optional(),
  labels: z.array(z.string()).optional(),
  page: Page,
  perPage: IssuePageSize,
  limit: IssuePageSize
})

const CreateIssue = RepoSelector.extend({
  title: requiredString('Missing title'),
  body: z.string().optional(),
  labels: z.array(z.string()).optional()
})

const Issue = RepoSelector.extend({
  // Why: Gitee issue public numbers may be alphanumeric (IK1X2N) or numeric.
  number: z.union([z.number().int().positive(), z.string().trim().min(1)])
})

const PullsList = RepoSelector.extend({
  state: PullState,
  page: Page,
  perPage: PullPageSize
})

export const GITEE_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'gitee.listIssues',
    params: IssuesList,
    handler: async (params, { runtime }) => {
      // Why: RPC callers send stable repo selectors; resolving on the runtime
      // host preserves SSH paths and connection ownership for the Gitee client.
      const repo = await runtime.showRepo(params.repo)
      const filters = {
        state: params.state,
        q: params.q,
        creator: params.creator,
        assignee: params.assignee,
        labels: params.labels,
        page: params.page,
        perPage: params.perPage ?? params.limit
      }
      const items = await listGiteeIssues(repo.path, filters, repo.connectionId ?? null)
      return { items }
    }
  }),
  defineMethod({
    name: 'gitee.createIssue',
    params: CreateIssue,
    handler: async (params, { runtime }) => {
      const repo = await runtime.showRepo(params.repo)
      return createGiteeIssue(
        repo.path,
        { title: params.title, body: params.body, labels: params.labels },
        repo.connectionId ?? null
      )
    }
  }),
  defineMethod({
    name: 'gitee.getIssue',
    params: Issue,
    handler: async (params, { runtime }) => {
      const repo = await runtime.showRepo(params.repo)
      return getGiteeIssueWithComments(repo.path, params.number, repo.connectionId ?? null)
    }
  }),
  defineMethod({
    name: 'gitee.listPulls',
    params: PullsList,
    handler: async (params, { runtime }) => {
      const repo = await runtime.showRepo(params.repo)
      return listGiteePulls(repo.path, {
        state: params.state,
        page: params.page,
        perPage: params.perPage,
        connectionId: repo.connectionId ?? null
      })
    }
  }),
  defineMethod({
    name: 'gitee.authStatus',
    params: null,
    handler: async () => getGiteeAuthStatus()
  })
]
