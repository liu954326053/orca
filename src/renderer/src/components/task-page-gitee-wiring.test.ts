import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const taskPageSource = readFileSync(new URL('./TaskPage.tsx', import.meta.url), 'utf8')

function sourceBetween(startPattern: string, endPattern: string): string {
  const start = taskPageSource.indexOf(startPattern)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = taskPageSource.indexOf(endPattern, start + startPattern.length)
  expect(end).toBeGreaterThan(start)
  return taskPageSource.slice(start, end)
}

describe('TaskPage Gitee issue controls wiring', () => {
  it('owns the search query and passes q plus state to issue fetches', () => {
    const fetchSection = sourceBetween(
      '// Why: Gitee task rows execute',
      '// Why: GitLab task-source data fetch.'
    )

    expect(taskPageSource).toContain('const [giteeSearchQuery, setGiteeSearchQuery]')
    expect(fetchSection).toContain('getGiteeIssueRequestStates(giteeState)')
    expect(fetchSection).toContain('q: normalizeGiteeSearchQuery(giteeSearchQuery)')
    expect(fetchSection).toContain('giteeSearchQuery')
  })

  it('opens the create dialog and refreshes after createGiteeIssue succeeds', () => {
    const createSection = sourceBetween(
      'const handleCreateGiteeIssue',
      'const handleCreateNewIssue'
    )

    expect(taskPageSource).toContain('setNewGiteeIssueOpen(true)')
    expect(createSection).toContain("'gitee.createIssue'")
    expect(createSection).toContain('window.api.gitee.createIssue')
    expect(createSection).toContain('setGiteeRefreshNonce((current) => current + 1)')
    expect(taskPageSource).toContain('<TaskPageGiteeCreateIssueDialog')
  })
})
