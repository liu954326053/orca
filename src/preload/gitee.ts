/* Gitee preload bindings — split like `./gitlab` so task-page channels can
   grow without merge conflicts on the central preload file. Composed into
   `api.gitee` from `index.ts`. */
import { ipcRenderer } from 'electron'
import type { TaskSourceContext } from '../shared/task-source-context'

type GiteeRepoSelectorArgs = {
  repoPath: string
  repoId?: string | null
  sourceContext?: TaskSourceContext | null
}

export const giteeApi = {
  authStatus: (): Promise<unknown> => ipcRenderer.invoke('gitee:authStatus'),

  repoSlug: (args: GiteeRepoSelectorArgs): Promise<unknown> =>
    ipcRenderer.invoke('gitee:repoSlug', args),

  listIssues: (
    args: GiteeRepoSelectorArgs & {
      state?: 'open' | 'closed' | 'progressing' | 'rejected' | 'all'
      page?: number
      perPage?: number
      limit?: number
      q?: string
      creator?: string
      assignee?: string
      labels?: string[]
    }
  ): Promise<{ items: unknown[]; error?: unknown }> =>
    ipcRenderer.invoke('gitee:listIssues', args),

  getIssue: (args: GiteeRepoSelectorArgs & { number: string | number }): Promise<unknown> =>
    ipcRenderer.invoke('gitee:getIssue', args),

  listPulls: (
    args: GiteeRepoSelectorArgs & {
      state?: 'open' | 'closed' | 'all'
      page?: number
      perPage?: number
    }
  ): Promise<{ items: unknown[]; error?: unknown }> =>
    ipcRenderer.invoke('gitee:listPulls', args),

  createIssue: (
    args: GiteeRepoSelectorArgs & {
      title: string
      body?: string
      labels?: string[]
    }
  ): Promise<{ ok: true; number: string | number; url: string } | { ok: false; error: string }> =>
    ipcRenderer.invoke('gitee:createIssue', args),

  updateIssue: (
    args: GiteeRepoSelectorArgs & {
      number: string | number
      updates: {
        title?: string
        body?: string
        state?: 'open' | 'closed'
      }
    }
  ): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('gitee:updateIssue', args),

  addIssueComment: (
    args: GiteeRepoSelectorArgs & { number: string | number; body: string }
  ): Promise<unknown> => ipcRenderer.invoke('gitee:addIssueComment', args)
}
