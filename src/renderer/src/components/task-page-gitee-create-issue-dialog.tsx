import React, { useEffect, useId, useState } from 'react'
import { LoaderCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'

export type TaskPageGiteeCreateIssueValues = {
  title: string
  body: string
}

export type TaskPageGiteeCreateIssueDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Parent owns createGiteeIssue + list refresh. Reject with Error (or string
   * message) so the dialog can surface loading/error without calling IPC.
   */
  onSubmit: (values: TaskPageGiteeCreateIssueValues) => Promise<void>
  /** Optional filing target (e.g. owner/repo) shown under the title. */
  targetLabel?: string | null
}

type FormState = {
  title: string
  body: string
  submitting: boolean
  error: string | null
}

const emptyForm = (): FormState => ({
  title: '',
  body: '',
  submitting: false,
  error: null
})

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error
  }
  return translate(
    'auto.components.TaskPage.giteeCreateIssueFailed',
    '创建 Issue 失败。'
  )
}

/**
 * Gitee task-page "new issue" composer. Title required, body optional; parent
 * supplies onSubmit (createGiteeIssue + refresh). Loading/error stay local so
 * TaskPage only wires open state + the create callback.
 */
export function TaskPageGiteeCreateIssueDialog({
  open,
  onOpenChange,
  onSubmit,
  targetLabel
}: TaskPageGiteeCreateIssueDialogProps): React.JSX.Element {
  const titleId = useId()
  const bodyId = useId()
  const errorId = useId()
  const [form, setForm] = useState<FormState>(emptyForm)

  // Why: reseed when the dialog opens so a cancelled draft never reappears;
  // keep fields while open so typing is not wiped by parent re-renders.
  useEffect(() => {
    if (open) {
      setForm(emptyForm())
    }
  }, [open])

  const titleTrimmed = form.title.trim()
  const canSubmit = titleTrimmed.length > 0 && !form.submitting

  const handleOpenChange = (nextOpen: boolean): void => {
    // Why: block dismiss while create is in flight so the user cannot lose
    // in-progress work or double-fire via backdrop/Escape.
    if (form.submitting) {
      return
    }
    onOpenChange(nextOpen)
  }

  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit) {
      return
    }
    setForm((current) => ({ ...current, submitting: true, error: null }))
    try {
      await onSubmit({ title: titleTrimmed, body: form.body })
      // Why: clear local draft before close so a fast re-open never flashes
      // the previous title/body while the open-effect reseed runs.
      setForm(emptyForm())
      onOpenChange(false)
    } catch (error) {
      setForm((current) => ({
        ...current,
        submitting: false,
        error: errorMessage(error)
      }))
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && canSubmit) {
            event.preventDefault()
            void handleSubmit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.TaskPage.giteeCreateIssueTitle', '新建 Issue')}
          </DialogTitle>
          <DialogDescription>
            {targetLabel
              ? translate(
                  'auto.components.TaskPage.giteeCreateIssueFilingIn',
                  '将创建到 {{value0}}',
                  { value0: targetLabel }
                )
              : translate(
                  'auto.components.TaskPage.giteeCreateIssueDescription',
                  '填写标题与可选正文，创建后刷新列表。'
                )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={titleId} className="text-[11px] font-medium text-muted-foreground">
              {translate('auto.components.TaskPage.giteeCreateIssueTitleLabel', '标题')}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </Label>
            <Input
              id={titleId}
              autoFocus
              value={form.title}
              disabled={form.submitting}
              aria-invalid={form.error !== null && titleTrimmed.length === 0}
              aria-required="true"
              placeholder={translate(
                'auto.components.TaskPage.giteeCreateIssueTitlePlaceholder',
                '简短摘要'
              )}
              onChange={(event) => {
                const nextTitle = event.target.value
                setForm((current) => ({
                  ...current,
                  title: nextTitle,
                  error: current.error && nextTitle.trim().length > 0 ? null : current.error
                }))
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  void handleSubmit()
                }
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={bodyId} className="text-[11px] font-medium text-muted-foreground">
              {translate(
                'auto.components.TaskPage.giteeCreateIssueBodyLabel',
                '正文（可选）'
              )}
            </Label>
            <textarea
              id={bodyId}
              value={form.body}
              disabled={form.submitting}
              rows={6}
              placeholder={translate(
                'auto.components.TaskPage.giteeCreateIssueBodyPlaceholder',
                '详细说明（支持 Markdown）'
              )}
              className={cn(
                'min-h-32 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none',
                'placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                'disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30'
              )}
              onChange={(event) => {
                const nextBody = event.target.value
                setForm((current) => ({ ...current, body: nextBody }))
              }}
            />
          </div>

          {form.error ? (
            <p id={errorId} role="alert" className="text-xs text-destructive">
              {form.error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={form.submitting}
            onClick={() => handleOpenChange(false)}
          >
            {translate('auto.components.TaskPage.giteeCreateIssueCancel', '取消')}
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={() => void handleSubmit()}>
            {form.submitting ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                {translate('auto.components.TaskPage.giteeCreateIssueCreating', '创建中…')}
              </>
            ) : (
              translate('auto.components.TaskPage.giteeCreateIssueSubmit', '创建 Issue')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
