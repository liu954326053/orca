import { describe, expect, it } from 'vitest'

import en from './locales/en.json'
import zh from './locales/zh.json'

/** Keys the Gitee Tasks toolbar, filters, search, and create-issue dialog need. */
const GITEE_TASK_PAGE_KEYS = [
  'giteeIssues',
  'giteePrs',
  'giteeOpen',
  'giteeClosed',
  'giteeAll',
  'giteeProgressing',
  'giteeRejected',
  'giteeView',
  'giteeState',
  'giteeRefresh',
  'giteeMerged',
  'giteeDraft',
  'giteeUnknownAuthor',
  'giteeOpenItem',
  'giteeIssuesLower',
  'giteePullRequestsLower',
  'giteeLoading',
  'giteeEmpty',
  'giteeSelectProject',
  'giteeChangeFilter',
  'giteeCreateIssue',
  'giteeSearchPlaceholder',
  'giteeIssueTitlePlaceholder',
  'giteeIssueBodyPlaceholder',
  'giteeCreateIssueSubmit',
  'giteeCreateIssueCancel',
  'giteeCreateIssueSelectProject',
  'giteeCreateIssueFailed',
  'giteeCreateIssueTitle',
  'giteeCreateIssueFilingIn',
  'giteeCreateIssueDescription',
  'giteeCreateIssueTitleLabel',
  'giteeCreateIssueTitlePlaceholder',
  'giteeCreateIssueBodyLabel',
  'giteeCreateIssueBodyPlaceholder',
  'giteeCreateIssueCreating',
  'giteeResumeWorkspace',
  'giteeStartWorkspace',
  'gitee_label'
] as const

describe('Gitee task page zh i18n', () => {
  const enTp = en.auto.components.TaskPage as Record<string, string>
  const zhTp = zh.auto.components.TaskPage as Record<string, string>

  it('keeps required toolbar, filter, search, and create-issue keys in en and zh', () => {
    for (const key of GITEE_TASK_PAGE_KEYS) {
      expect(enTp[key]?.trim(), `en.${key}`).toBeTruthy()
      expect(zhTp[key]?.trim(), `zh.${key}`).toBeTruthy()
    }
  })

  it('uses product Chinese for Open/progressing filters, create issue, and search', () => {
    // Why: Gitee web uses 开启/进行中/已关闭; Open must not stay English.
    expect(zhTp.giteeOpen).toBe('开启')
    expect(zhTp.giteeProgressing).toBe('进行中')
    expect(zhTp.giteeClosed).toBe('已关闭')
    expect(zhTp.giteeRejected).toBe('已拒绝')
    expect(zhTp.giteeAll).toBe('全部')
    expect(zhTp.giteeCreateIssue).toBe('新建 Issue')
    expect(zhTp.giteeSearchPlaceholder).toBe('搜索议题')
    expect(zhTp.giteeIssues).toBe('议题')
  })

  it('localizes gitee TaskPage strings away from English (except brand label)', () => {
    for (const key of GITEE_TASK_PAGE_KEYS) {
      if (key === 'gitee_label') {
        expect(zhTp[key]).toBe('Gitee')
        continue
      }
      expect(zhTp[key], key).not.toBe(enTp[key])
    }
  })

  it('localizes sidebar open action and TasksPane Gitee description', () => {
    const zhSidebar = zh.auto.components.sidebar.SidebarNav as Record<string, string>
    const enSidebar = en.auto.components.sidebar.SidebarNav as Record<string, string>
    expect(zhSidebar.gitee_open.trim()).toBeTruthy()
    expect(zhSidebar.gitee_open).not.toBe(enSidebar.gitee_open)

    const zhPane = zh.auto.components.settings.TasksPane as Record<string, string>
    const enPane = en.auto.components.settings.TasksPane as Record<string, string>
    expect(zhPane.gitee_description.trim()).toBeTruthy()
    expect(zhPane.gitee_description).not.toBe(enPane.gitee_description)
  })
})
