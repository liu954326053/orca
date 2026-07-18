// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import type { GlobalSettings } from '../../../../shared/types'
import { i18n } from '@/i18n/i18n'
import { TasksPane } from './TasksPane'

const { settingsSearchQuery } = vi.hoisted(() => ({ settingsSearchQuery: { current: '' } }))

vi.mock('../../store', () => ({
  useAppStore: (selector: (state: { settingsSearchQuery: string }) => unknown) =>
    selector({ settingsSearchQuery: settingsSearchQuery.current })
}))

beforeEach(async () => {
  settingsSearchQuery.current = ''
  await i18n.changeLanguage('en')
})

afterEach(() => cleanup())

describe('TasksPane', () => {
  it('lets users enable Gitee from task provider settings', async () => {
    const updateSettings = vi.fn()
    const settings: GlobalSettings = {
      ...getDefaultSettings('/tmp'),
      visibleTaskProviders: ['github'],
      defaultTaskSource: 'github'
    }
    const user = userEvent.setup()

    render(<TasksPane settings={settings} updateSettings={updateSettings} />)

    const giteeOption = screen.getByRole('checkbox', { name: /Gitee/ })
    expect(giteeOption).not.toBeChecked()
    await user.click(giteeOption)

    expect(updateSettings).toHaveBeenCalledWith({
      visibleTaskProviders: ['github', 'gitee'],
      defaultTaskSource: 'github'
    })
  })

  it('keeps the Gitee option discoverable through settings search', () => {
    settingsSearchQuery.current = 'gitee'

    render(<TasksPane settings={getDefaultSettings('/tmp')} updateSettings={vi.fn()} />)

    expect(screen.getByRole('checkbox', { name: /Gitee/ })).toBeVisible()
  })
})
