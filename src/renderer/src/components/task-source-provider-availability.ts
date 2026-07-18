import { translate } from '@/i18n/i18n'
import { parseExecutionHostId } from '../../../shared/execution-host'
import type { TaskProvider } from '../../../shared/types'
import type { PreflightStatus } from '../../../preload/api-types'
import type { TaskSourceContext } from '../../../shared/task-source-context'
import {
  getTaskSourceAvailabilityNotice,
  type TaskSourceAvailabilityNotice,
  type TaskSourceHostAvailability
} from './task-source-context-summary'

type ProviderToolStatus = {
  installed: boolean
  authenticated: boolean
}

type ProviderAvailabilityStatus = ProviderToolStatus | 'unsupported'

export type RuntimeProviderPreflightStatus = {
  checked: boolean
  status: PreflightStatus | null
}

function isDesktopOwnedHost(hostId: TaskSourceContext['hostId']): boolean {
  const parsed = parseExecutionHostId(hostId)
  return parsed?.kind !== 'runtime'
}

function getRepoBackedProviderToolStatus(
  provider: Extract<TaskProvider, 'github' | 'gitlab'>,
  preflightStatus: PreflightStatus | null
): ProviderAvailabilityStatus | null {
  if (!preflightStatus) {
    return null
  }
  if (provider === 'github') {
    return preflightStatus.gh
  }
  // Why: older remote servers can predate GitLab preflight entirely. That is a
  // host capability gap, not a user-fixable missing `glab` install.
  return Object.hasOwn(preflightStatus, 'glab')
    ? (preflightStatus.glab ?? { installed: false, authenticated: false })
    : 'unsupported'
}

function getProviderReason(
  status: ProviderAvailabilityStatus
): TaskSourceHostAvailability['reason'] | null {
  if (status === 'unsupported') {
    return 'unsupported-provider'
  }
  if (!status.installed) {
    return 'unavailable-source-tool'
  }
  if (!status.authenticated) {
    return 'missing-provider-auth'
  }
  return null
}

export function getRepoBackedProviderAvailability(args: {
  provider: Extract<TaskProvider, 'github' | 'gitlab'>
  contexts: readonly TaskSourceContext[]
  preflightStatus: PreflightStatus | null
  preflightReady: boolean
  runtimePreflightStatusByHostId?: ReadonlyMap<
    TaskSourceContext['hostId'],
    RuntimeProviderPreflightStatus
  >
}): TaskSourceHostAvailability[] {
  return args.contexts.flatMap((context) => {
    const hostPreflight = isDesktopOwnedHost(context.hostId)
      ? { checked: args.preflightReady, status: args.preflightStatus }
      : args.runtimePreflightStatusByHostId?.get(context.hostId)
    if (!hostPreflight?.checked) {
      return []
    }
    const status = getRepoBackedProviderToolStatus(args.provider, hostPreflight.status)
    const reason = status ? getProviderReason(status) : null
    return reason ? [{ hostId: context.hostId, reason }] : []
  })
}

/**
 * Gitee uses an API token (ORCA_GITEE_TOKEN) rather than a CLI tool.
 * Returns one availability entry per context whose host preflight has been
 * checked and whose gitee token is absent or unauthenticated.
 */
export function getGiteeProviderAvailability(args: {
  contexts: readonly TaskSourceContext[]
  preflightStatus: PreflightStatus | null
  preflightReady: boolean
  runtimePreflightStatusByHostId?: ReadonlyMap<
    TaskSourceContext['hostId'],
    RuntimeProviderPreflightStatus
  >
}): TaskSourceHostAvailability[] {
  return args.contexts.flatMap((context) => {
    const hostPreflight = isDesktopOwnedHost(context.hostId)
      ? { checked: args.preflightReady, status: args.preflightStatus }
      : args.runtimePreflightStatusByHostId?.get(context.hostId)
    if (!hostPreflight?.checked) {
      return []
    }
    const gitee = hostPreflight.status?.gitee
    // Why: if the preflight payload predates Gitee support the field is absent;
    // treat that as unconfigured rather than a hard blocker.
    if (!gitee?.tokenConfigured || !gitee.authenticated) {
      return [{ hostId: context.hostId, reason: 'missing-provider-auth' as const }]
    }
    return []
  })
}

export function getGiteeTaskSourceAvailabilityNotice(args: {
  providerLabel: string
  hostAvailability: readonly TaskSourceHostAvailability[]
  hostLabelById?: ReadonlyMap<string, string>
  sourceCount?: number
}): TaskSourceAvailabilityNotice | null {
  const notice = getTaskSourceAvailabilityNotice(args)
  if (
    !notice ||
    !args.hostAvailability.some((availability) => availability.reason === 'missing-provider-auth')
  ) {
    return notice
  }
  // Why: generic provider-auth copy does not tell users how to configure
  // Gitee's environment-token integration.
  return {
    ...notice,
    label: translate(
      'auto.components.taskSourceContextSummary.setGiteeToken',
      '{{value0}}. Set ORCA_GITEE_TOKEN.',
      { value0: notice.label }
    ),
    title: translate(
      'auto.components.taskSourceContextSummary.setGiteeTokenTitle',
      'Set ORCA_GITEE_TOKEN in the source environment, then reload Gitee.'
    )
  }
}
