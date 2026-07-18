import type { HostedReviewProvider } from '../../../../shared/hosted-review'

export function isHostedReviewMutationProvider(
  provider: HostedReviewProvider
): provider is 'github' | 'gitlab' {
  return provider === 'github' || provider === 'gitlab'
}
