// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import type { ComponentProps, KeyboardEvent, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { i18n } from '@/i18n/i18n'
import { TaskPageGiteeCreateIssueDialog } from './task-page-gitee-create-issue-dialog'

// Why: Radix Dialog portal/focus-scope is Electron QA territory; unit tests
// only need open/closed content + form wiring.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children?: ReactNode }) =>
    open ? <div data-testid="gitee-create-issue-dialog">{children}</div> : null,
  DialogContent: ({
    children,
    ...props
  }: {
    children?: ReactNode
    onKeyDown?: (event: KeyboardEvent) => void
  }) => (
    <div data-testid="gitee-create-issue-dialog-content" {...props}>
      {children}
    </div>
  ),
  DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children?: ReactNode }) => <footer>{children}</footer>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>
}))

beforeEach(async () => {
  // Why: this suite asserts the Chinese product copy; the shared i18n singleton
  // boots in English and must be switched explicitly before rendering.
  await i18n.changeLanguage('zh')
})

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await i18n.changeLanguage('en')
})

function renderDialog(
  overrides: Partial<ComponentProps<typeof TaskPageGiteeCreateIssueDialog>> = {}
): {
  onOpenChange: ReturnType<typeof vi.fn>
  onSubmit: ReturnType<typeof vi.fn>
} {
  const onOpenChange = vi.fn()
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(
    <TaskPageGiteeCreateIssueDialog
      open
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      {...overrides}
    />
  )
  return { onOpenChange, onSubmit }
}

describe('TaskPageGiteeCreateIssueDialog', () => {
  it('renders Chinese labels for title, optional body, cancel, and submit', () => {
    renderDialog({ targetLabel: 'acme/orca' })

    expect(screen.getByRole('heading', { name: '新建 Issue' })).toBeInTheDocument()
    expect(screen.getByText('将创建到 acme/orca')).toBeInTheDocument()
    expect(screen.getByLabelText(/标题/)).toBeInTheDocument()
    expect(screen.getByLabelText('正文（可选）')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '创建' })).toBeInTheDocument()
  })

  it('keeps submit disabled until the title has non-whitespace content', async () => {
    const user = userEvent.setup()
    renderDialog()

    const submit = screen.getByRole('button', { name: '创建' })
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText(/标题/), '   ')
    expect(submit).toBeDisabled()

    await user.clear(screen.getByLabelText(/标题/))
    await user.type(screen.getByLabelText(/标题/), '修复登录')
    expect(submit).toBeEnabled()
  })

  it('cancels without submitting when cancel is clicked', async () => {
    const user = userEvent.setup()
    const { onOpenChange, onSubmit } = renderDialog()

    await user.click(screen.getByRole('button', { name: '取消' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits trimmed title and optional body, then closes on success', async () => {
    const user = userEvent.setup()
    const { onOpenChange, onSubmit } = renderDialog()

    await user.type(screen.getByLabelText(/标题/), '  崩溃复现  ')
    await user.type(screen.getByLabelText('正文（可选）'), '步骤 1')
    await user.click(screen.getByRole('button', { name: '创建' }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ title: '崩溃复现', body: '步骤 1' })
    })
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  it('allows submitting with an empty body', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog()

    await user.type(screen.getByLabelText(/标题/), '仅标题')
    await user.click(screen.getByRole('button', { name: '创建' }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ title: '仅标题', body: '' })
    })
  })

  it('shows loading, disables fields, and blocks cancel while submitting', async () => {
    const user = userEvent.setup()
    let resolveSubmit: (() => void) | undefined
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve
        })
    )
    const onOpenChange = vi.fn()

    render(
      <TaskPageGiteeCreateIssueDialog open onOpenChange={onOpenChange} onSubmit={onSubmit} />
    )

    await user.type(screen.getByLabelText(/标题/), '进行中')
    await user.click(screen.getByRole('button', { name: '创建' }))

    expect(await screen.findByRole('button', { name: /创建中/ })).toBeDisabled()
    expect(screen.getByLabelText(/标题/)).toBeDisabled()
    expect(screen.getByLabelText('正文（可选）')).toBeDisabled()
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(onOpenChange).not.toHaveBeenCalled()

    resolveSubmit?.()
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  it('surfaces submit errors and keeps the dialog open for retry', async () => {
    const user = userEvent.setup()
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(new Error('Set ORCA_GITEE_TOKEN'))
      .mockResolvedValueOnce(undefined)
    const onOpenChange = vi.fn()

    render(
      <TaskPageGiteeCreateIssueDialog open onOpenChange={onOpenChange} onSubmit={onSubmit} />
    )

    await user.type(screen.getByLabelText(/标题/), '需要重试')
    await user.click(screen.getByRole('button', { name: '创建' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Set ORCA_GITEE_TOKEN')
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '创建' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '创建' }))
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
    expect(onSubmit).toHaveBeenCalledTimes(2)
  })

  it('does not render when closed', () => {
    render(
      <TaskPageGiteeCreateIssueDialog
        open={false}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    )

    expect(screen.queryByTestId('gitee-create-issue-dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '新建 Issue' })).not.toBeInTheDocument()
  })
})
