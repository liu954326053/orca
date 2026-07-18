import React from 'react'
import { ExternalLink, LoaderCircle, Plus, RefreshCw, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type {
  GiteeTaskPageItem,
  GiteeTaskPageMode,
  GiteeTaskPageState
} from './task-page-gitee-items'

export type { GiteeTaskPageItem } from './task-page-gitee-items'

type TaskPageGiteeToolbarProps = {
  loading: boolean
  mode: GiteeTaskPageMode
  onModeChange: (mode: GiteeTaskPageMode) => void
  onRefresh: () => void
  onStateChange: (state: GiteeTaskPageState) => void
  repoSelector: React.ReactNode
  state: GiteeTaskPageState
  // Why: search + create are optional so the TaskPage wiring can adopt them in
  // a later slice without breaking the existing PR/list rendering path.
  searchQuery?: string
  onSearchChange?: (query: string) => void
  onCreateIssue?: () => void
}

const modeOptions: readonly GiteeTaskPageMode[] = ['issues', 'prs']

// Why: 'progressing' only exists for Gitee issues; PRs never surface it, so the
// filter row drops it outside issues mode.
const issueStateOptions: readonly GiteeTaskPageState[] = ['all', 'open', 'progressing', 'closed']
const pullStateOptions: readonly GiteeTaskPageState[] = ['all', 'open', 'closed']

function modeLabel(mode: GiteeTaskPageMode): string {
  return mode === 'issues'
    ? translate('auto.components.TaskPage.giteeIssues', 'Issues')
    : translate('auto.components.TaskPage.giteePrs', 'PRs')
}

function filterStateLabel(state: GiteeTaskPageState): string {
  switch (state) {
    case 'open':
      return translate('auto.components.TaskPage.giteeOpen', 'Open')
    case 'progressing':
      return translate('auto.components.TaskPage.giteeProgressing', 'Progressing')
    case 'closed':
      return translate('auto.components.TaskPage.giteeClosed', 'Closed')
    case 'all':
      return translate('auto.components.TaskPage.giteeAll', 'All')
  }
}

export function TaskPageGiteeToolbar({
  loading,
  mode,
  onModeChange,
  onRefresh,
  onStateChange,
  repoSelector,
  state,
  searchQuery,
  onSearchChange,
  onCreateIssue
}: TaskPageGiteeToolbarProps): React.JSX.Element {
  const stateOptions = mode === 'issues' ? issueStateOptions : pullStateOptions
  const showCreateIssue = mode === 'issues' && onCreateIssue

  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <ButtonGroup aria-label={translate('auto.components.TaskPage.giteeView', 'Gitee view')}>
          {modeOptions.map((option) => (
            <Button
              key={option}
              type="button"
              size="xs"
              variant={mode === option ? 'default' : 'outline'}
              aria-pressed={mode === option}
              onClick={() => onModeChange(option)}
            >
              {modeLabel(option)}
            </Button>
          ))}
        </ButtonGroup>
        <div className="min-w-0 w-full sm:w-[220px]">{repoSelector}</div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-md rounded-b-none border border-border/50 bg-muted/50 px-3 py-2 shadow-sm">
        <ButtonGroup aria-label={translate('auto.components.TaskPage.giteeState', 'Gitee state')}>
          {stateOptions.map((option) => (
            <Button
              key={option}
              type="button"
              size="xs"
              variant={state === option ? 'default' : 'outline'}
              aria-pressed={state === option}
              onClick={() => onStateChange(option)}
            >
              {filterStateLabel(option)}
            </Button>
          ))}
        </ButtonGroup>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          {onSearchChange ? (
            <div className="relative min-w-0 flex-1 sm:max-w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={searchQuery ?? ''}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={translate(
                  'auto.components.TaskPage.giteeSearchPlaceholder',
                  'Search issues'
                )}
                aria-label={translate(
                  'auto.components.TaskPage.giteeSearchLabel',
                  'Search Gitee work items'
                )}
                className="h-8 pl-8 text-[12px]"
              />
            </div>
          ) : null}
          {showCreateIssue ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={onCreateIssue}
                  aria-label={translate('auto.components.TaskPage.giteeCreateIssue', 'New issue')}
                >
                  <Plus className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                {translate('auto.components.TaskPage.giteeCreateIssue', 'New issue')}
              </TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                disabled={loading}
                onClick={onRefresh}
                aria-label={translate(
                  'auto.components.TaskPage.giteeRefresh',
                  'Refresh Gitee work items'
                )}
              >
                {loading ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {translate('auto.components.TaskPage.giteeRefresh', 'Refresh Gitee work items')}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </>
  )
}

type TaskPageGiteeListProps = {
  error: string | null
  items: readonly GiteeTaskPageItem[]
  loading: boolean
  mode: GiteeTaskPageMode
  onOpenItem: (item: GiteeTaskPageItem) => void
  renderAction?: (item: GiteeTaskPageItem) => React.ReactNode
  repoNamesById: ReadonlyMap<string, string>
  selectedRepoCount: number
}

function formatUpdatedAt(value: string): string {
  if (!value) {
    return '-'
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
}

function stateLabel(state: GiteeTaskPageItem['state']): string {
  switch (state) {
    case 'open':
      return translate('auto.components.TaskPage.giteeOpen', 'Open')
    case 'closed':
      return translate('auto.components.TaskPage.giteeClosed', 'Closed')
    case 'merged':
      return translate('auto.components.TaskPage.giteeMerged', 'Merged')
    case 'draft':
      return translate('auto.components.TaskPage.giteeDraft', 'Draft')
  }
}

function TaskPageGiteeRow({
  item,
  onOpenItem,
  renderAction,
  repoName,
  showRepo
}: {
  item: GiteeTaskPageItem
  onOpenItem: (item: GiteeTaskPageItem) => void
  renderAction?: (item: GiteeTaskPageItem) => React.ReactNode
  repoName: string | null
  showRepo: boolean
}): React.JSX.Element {
  return (
    // Why: rows contain action buttons, so keyboard semantics live on a div
    // instead of creating invalid nested native buttons.
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenItem(item)}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          onOpenItem(item)
        }
      }}
      className="group/row grid min-h-12 cursor-pointer grid-cols-[80px_minmax(0,1fr)_96px_96px_auto] items-center gap-3 px-3 py-2 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <span className="font-mono text-xs text-muted-foreground">
        {item.type === 'pr' ? '!' : '#'}
        {item.number}
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{item.title}</span>
          {showRepo && repoName ? (
            <span className="shrink-0 truncate rounded-full border border-border/50 bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {repoName}
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">
            {item.author ??
              translate('auto.components.TaskPage.giteeUnknownAuthor', 'Unknown author')}
          </span>
          {item.labels.slice(0, 2).map((label) => (
            <span
              key={label}
              className="max-w-[120px] truncate rounded-full border border-border/50 px-1.5 py-0.5 text-[10px]"
            >
              {label}
            </span>
          ))}
        </div>
      </div>
      <span
        className={cn(
          'inline-flex w-fit rounded-full border px-2 py-0.5 text-[11px] font-medium',
          item.state === 'open' || item.state === 'draft'
            ? 'border-border/50 bg-background text-foreground'
            : 'border-border/50 bg-muted text-muted-foreground'
        )}
      >
        {stateLabel(item.state)}
      </span>
      <span className="text-xs text-muted-foreground">{formatUpdatedAt(item.updatedAt)}</span>
      <div className="flex items-center justify-end gap-1">
        {renderAction?.(item)}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={(event) => {
                event.stopPropagation()
                onOpenItem(item)
              }}
              aria-label={translate(
                'auto.components.TaskPage.giteeOpenItem',
                'Open Gitee {{value0}} #{{value1}}',
                { value0: item.type === 'pr' ? 'PR' : 'issue', value1: item.number }
              )}
            >
              <ExternalLink className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {translate('auto.components.TaskPage.c1d1600362', 'Open in browser')}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

export function TaskPageGiteeList({
  error,
  items,
  loading,
  mode,
  onOpenItem,
  renderAction,
  repoNamesById,
  selectedRepoCount
}: TaskPageGiteeListProps): React.JSX.Element {
  const noun =
    mode === 'issues'
      ? translate('auto.components.TaskPage.giteeIssuesLower', 'issues')
      : translate('auto.components.TaskPage.giteePullRequestsLower', 'pull requests')

  return (
    <div className="flex min-h-0 max-h-full flex-col overflow-hidden rounded-md rounded-t-none border border-t-0 border-border/50 bg-background shadow-sm">
      <div className="grid grid-cols-[80px_minmax(0,1fr)_96px_96px_auto] gap-3 border-b border-border/50 bg-muted/35 px-3 py-2 text-[10px] font-medium uppercase text-muted-foreground">
        <span>{translate('auto.components.TaskPage.eb10c32872', 'ID')}</span>
        <span>{translate('auto.components.TaskPage.16cba35bee', 'Title')}</span>
        <span>{translate('auto.components.TaskPage.154b0fa623', 'Status')}</span>
        <span>{translate('auto.components.TaskPage.f362667d55', 'Updated')}</span>
        <span />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek">
        {error ? (
          <div role="alert" className="border-b border-border px-4 py-4 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {loading && items.length === 0 ? (
          <div
            role="status"
            aria-label={translate(
              'auto.components.TaskPage.giteeLoading',
              'Loading Gitee {{value0}}',
              { value0: noun }
            )}
            className="divide-y divide-border/50"
          >
            {Array.from({ length: 10 }).map((_, index) => (
              <div
                key={index}
                className="grid min-h-12 grid-cols-[80px_minmax(0,1fr)_96px_96px_auto] items-center gap-3 px-3 py-2"
              >
                <div className="h-3 w-10 animate-pulse rounded bg-muted" />
                <div className="h-4 w-3/5 animate-pulse rounded bg-muted" />
                <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
                <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                <div className="size-7 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : null}
        {!loading && !error && items.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-medium text-foreground">
              {translate('auto.components.TaskPage.giteeEmpty', 'No Gitee {{value0}}', {
                value0: noun
              })}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {selectedRepoCount === 0
                ? translate(
                    'auto.components.TaskPage.giteeSelectProject',
                    'Select at least one project source.'
                  )
                : translate(
                    'auto.components.TaskPage.giteeChangeFilter',
                    'No items match the selected state.'
                  )}
            </p>
          </div>
        ) : null}
        <div className="divide-y divide-border/50">
          {items.map((item) => (
            <TaskPageGiteeRow
              key={item.id}
              item={item}
              onOpenItem={onOpenItem}
              renderAction={renderAction}
              repoName={repoNamesById.get(item.repoId) ?? null}
              showRepo={selectedRepoCount > 1}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
