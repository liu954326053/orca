// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { TooltipProvider } from '@/components/ui/tooltip'
import {
  TaskPageGiteeList,
  TaskPageGiteeToolbar,
  type GiteeTaskPageItem
} from './task-page-gitee-list'

afterEach(cleanup)

const issue: GiteeTaskPageItem = {
  id: 'gitee-issue-repo-a-12',
  repoId: 'repo-a',
  type: 'issue',
  number: 12,
  title: 'A Gitee issue',
  state: 'open',
  url: 'https://gitee.com/acme/orca/issues/I12',
  labels: ['bug'],
  updatedAt: '2026-07-18T09:00:00Z',
  author: 'magic'
}

describe('TaskPage Gitee UI', () => {
  it('shows only Issues and PRs with state filters and refresh', async () => {
    const user = userEvent.setup()
    const onModeChange = vi.fn()
    const onStateChange = vi.fn()
    const onRefresh = vi.fn()

    render(
      <TooltipProvider>
        <TaskPageGiteeToolbar
          loading={false}
          mode="issues"
          onModeChange={onModeChange}
          onRefresh={onRefresh}
          onStateChange={onStateChange}
          repoSelector={<button type="button">All projects</button>}
          state="open"
        />
      </TooltipProvider>
    )

    expect(screen.getByRole('button', { name: 'Issues' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'PRs' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Projects' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All projects' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'PRs' }))
    await user.click(screen.getByRole('button', { name: 'Closed' }))
    await user.click(screen.getByRole('button', { name: 'Refresh Gitee work items' }))

    expect(onModeChange).toHaveBeenCalledWith('prs')
    expect(onStateChange).toHaveBeenCalledWith('closed')
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('offers the four issue states in order and reports the In progress filter', async () => {
    const user = userEvent.setup()
    const onStateChange = vi.fn()

    render(
      <TooltipProvider>
        <TaskPageGiteeToolbar
          loading={false}
          mode="issues"
          onModeChange={vi.fn()}
          onRefresh={vi.fn()}
          onStateChange={onStateChange}
          repoSelector={<button type="button">All projects</button>}
          state="all"
        />
      </TooltipProvider>
    )

    const group = screen.getByRole('group', { name: 'Gitee state' })
    const stateButtons = within(group).getAllByRole('button')
    expect(stateButtons.map((button) => button.textContent)).toEqual([
      'All',
      'Open',
      'Progressing',
      'Closed'
    ])
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Progressing' }))
    expect(onStateChange).toHaveBeenCalledWith('progressing')
  })

  it('hides the In progress state and the New issue button for pull requests', () => {
    render(
      <TooltipProvider>
        <TaskPageGiteeToolbar
          loading={false}
          mode="prs"
          onModeChange={vi.fn()}
          onRefresh={vi.fn()}
          onStateChange={vi.fn()}
          onCreateIssue={vi.fn()}
          repoSelector={<button type="button">All projects</button>}
          state="open"
        />
      </TooltipProvider>
    )

    const group = screen.getByRole('group', { name: 'Gitee state' })
    const stateButtons = within(group).getAllByRole('button')
    expect(stateButtons.map((button) => button.textContent)).toEqual(['All', 'Open', 'Closed'])
    expect(screen.queryByRole('button', { name: 'In progress' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New issue' })).not.toBeInTheDocument()
  })

  it('searches by keyword and creates an issue from the issues toolbar', async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn()
    const onCreateIssue = vi.fn()

    render(
      <TooltipProvider>
        <TaskPageGiteeToolbar
          loading={false}
          mode="issues"
          onModeChange={vi.fn()}
          onRefresh={vi.fn()}
          onStateChange={vi.fn()}
          onSearchChange={onSearchChange}
          searchQuery=""
          onCreateIssue={onCreateIssue}
          repoSelector={<button type="button">All projects</button>}
          state="open"
        />
      </TooltipProvider>
    )

    const search = screen.getByRole('searchbox', { name: 'Search Gitee work items' })
    await user.type(search, 'bug')
    expect(onSearchChange).toHaveBeenCalledWith('b')
    expect(onSearchChange).toHaveBeenLastCalledWith('g')

    await user.click(screen.getByRole('button', { name: 'New issue' }))
    expect(onCreateIssue).toHaveBeenCalledTimes(1)
  })

  it('omits the search box and New issue button when their handlers are absent', () => {
    render(
      <TooltipProvider>
        <TaskPageGiteeToolbar
          loading={false}
          mode="issues"
          onModeChange={vi.fn()}
          onRefresh={vi.fn()}
          onStateChange={vi.fn()}
          repoSelector={<button type="button">All projects</button>}
          state="open"
        />
      </TooltipProvider>
    )

    expect(
      screen.queryByRole('searchbox', { name: 'Search Gitee work items' })
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New issue' })).not.toBeInTheDocument()
  })

  it('renders rows and opens their html URL through the owner callback', async () => {
    const user = userEvent.setup()
    const onOpenItem = vi.fn()

    render(
      <TooltipProvider>
        <TaskPageGiteeList
          error={null}
          items={[issue]}
          loading={false}
          mode="issues"
          onOpenItem={onOpenItem}
          repoNamesById={new Map([['repo-a', 'Orca']])}
          selectedRepoCount={2}
        />
      </TooltipProvider>
    )

    expect(screen.getByText('A Gitee issue')).toBeInTheDocument()
    expect(screen.getByText('Orca')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open Gitee issue #12' }))
    expect(onOpenItem).toHaveBeenCalledWith(issue)
  })

  it('renders loading, error, and empty states without stale rows', () => {
    const { rerender } = render(
      <TooltipProvider>
        <TaskPageGiteeList
          error={null}
          items={[]}
          loading
          mode="prs"
          onOpenItem={vi.fn()}
          repoNamesById={new Map()}
          selectedRepoCount={1}
        />
      </TooltipProvider>
    )
    expect(screen.getByRole('status', { name: 'Loading Gitee pull requests' })).toBeInTheDocument()

    rerender(
      <TooltipProvider>
        <TaskPageGiteeList
          error="Set ORCA_GITEE_TOKEN"
          items={[]}
          loading={false}
          mode="prs"
          onOpenItem={vi.fn()}
          repoNamesById={new Map()}
          selectedRepoCount={1}
        />
      </TooltipProvider>
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Set ORCA_GITEE_TOKEN')

    rerender(
      <TooltipProvider>
        <TaskPageGiteeList
          error={null}
          items={[]}
          loading={false}
          mode="issues"
          onOpenItem={vi.fn()}
          repoNamesById={new Map()}
          selectedRepoCount={1}
        />
      </TooltipProvider>
    )
    expect(screen.getByText('No Gitee issues')).toBeInTheDocument()
  })
})
