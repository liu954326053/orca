import { useCallback, useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { PetSubscriberInfo } from '../../../../shared/pet-events'
import { translate } from '@/i18n/i18n'

type PetIntegrationGuide = {
  metadataPath: string
  endpoint: string | null
  guideMarkdown: string
  agentPromptMarkdown: string
}

// Why: shown under Settings → Experimental → Pet event stream once the toggle
// is on. The subscriber list proves "who is listening", and the copy buttons
// hand the user a quick-start guide plus a self-contained agent prompt — no
// secrets ever leave the machine (the token is read from the metadata file
// at runtime by the integrating code).
export function PetEventStreamPanel(): React.JSX.Element {
  const [subscribers, setSubscribers] = useState<PetSubscriberInfo[]>([])
  const [guide, setGuide] = useState<PetIntegrationGuide | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.api.petEventStream.listSubscribers().then((list) => {
      if (!cancelled) {
        setSubscribers(list)
      }
    })
    void window.api.petEventStream.getIntegrationGuide().then((result) => {
      if (!cancelled) {
        setGuide(result)
      }
    })
    const unsubscribe = window.api.petEventStream.onSubscribersChanged(setSubscribers)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const copyText = useCallback(async (text: string, successMessage: string): Promise<void> => {
    try {
      await window.api.ui.writeClipboardText(text)
      toast.success(successMessage)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translate('auto.components.settings.PetEventStreamPanel.8bd97295a6', 'Failed to copy.')
      )
    }
  }, [])

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-foreground">
          {translate(
            'auto.components.settings.PetEventStreamPanel.f22f77a319',
            'Active subscribers'
          )}
        </p>
        {subscribers.length === 0 ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {translate(
              'auto.components.settings.PetEventStreamPanel.8d55c8fc08',
              'No apps are subscribed yet. Point your pet at the metadata file below to connect it.'
            )}
          </p>
        ) : (
          <ul className="space-y-1">
            {subscribers.map((subscriber) => (
              <li
                key={subscriber.subscriptionId}
                className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs text-foreground">
                    {subscriber.clientName ??
                      translate(
                        'auto.components.settings.PetEventStreamPanel.unnamedApp',
                        'Unnamed app'
                      )}
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {subscriber.subscriptionId}
                  </p>
                </div>
                <div className="shrink-0 text-right text-[11px] text-muted-foreground">
                  <p>{new Date(subscriber.connectedAt).toLocaleTimeString()}</p>
                  <p>
                    {subscriber.eventCount}{' '}
                    {translate('auto.components.settings.PetEventStreamPanel.70fea41430', 'events')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {guide ? (
        <div className="space-y-2.5 rounded-md border border-border/70 bg-editor-surface px-3 py-3 shadow-xs">
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">
              {translate(
                'auto.components.settings.PetEventStreamPanel.77ccf84ed0',
                'Connect your pet'
              )}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {translate(
                'auto.components.settings.PetEventStreamPanel.082267b568',
                'Your pet reads this runtime metadata file, connects over the local socket, and subscribes with its own clientName. Full protocol reference: docs/reference/pet-event-protocol.md.'
              )}
            </p>
            <p className="break-all font-mono text-[11px] leading-relaxed text-foreground">
              {guide.metadataPath}
            </p>
            {guide.endpoint ? (
              <p className="break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
                {guide.endpoint}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                void copyText(
                  guide.guideMarkdown,
                  translate(
                    'auto.components.settings.PetEventStreamPanel.copiedGuide',
                    'Copied integration guide.'
                  )
                )
              }
            >
              <Copy className="size-3.5" />
              {translate(
                'auto.components.settings.PetEventStreamPanel.cb8c69cfcf',
                'Copy integration guide'
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() =>
                void copyText(
                  guide.agentPromptMarkdown,
                  translate(
                    'auto.components.settings.PetEventStreamPanel.copiedPrompt',
                    'Copied agent integration prompt.'
                  )
                )
              }
            >
              <Copy className="size-3.5" />
              {translate(
                'auto.components.settings.PetEventStreamPanel.38a3d3ef11',
                'Copy agent prompt'
              )}
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {translate(
              'auto.components.settings.PetEventStreamPanel.7516bea4d8',
              'Paste the agent prompt into Cursor, Claude Code, or a similar agent with your pet project open — it implements the integration for you. No secrets are included: the auth token is read from the metadata file at runtime.'
            )}
          </p>
        </div>
      ) : null}
    </div>
  )
}
