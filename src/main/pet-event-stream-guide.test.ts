import { describe, expect, it } from 'vitest'
import { buildPetEventStreamGuide } from './pet-event-stream-guide'
import { buildPetAgentIntegrationPrompt } from './pet-agent-integration-prompt'

const INPUT = {
  metadataPath: '/Users/alice/Library/Application Support/orca/orca-runtime.json',
  endpoint: '/Users/alice/Library/Application Support/orca/o-123-ab12.sock'
}

describe('buildPetEventStreamGuide', () => {
  it('embeds the concrete metadata path and endpoint', () => {
    const guide = buildPetEventStreamGuide(INPUT)
    expect(guide).toContain(INPUT.metadataPath)
    expect(guide).toContain(INPUT.endpoint)
    expect(guide).toContain('pet.events.subscribe')
    expect(guide).toContain('clientName')
    expect(guide).toContain('docs/reference/pet-event-protocol.md')
  })

  it('tells the reader to start Orca when there is no live endpoint', () => {
    const guide = buildPetEventStreamGuide({ ...INPUT, endpoint: null })
    expect(guide).toContain('start the Orca app first')
    expect(guide).not.toContain(INPUT.endpoint)
  })
})

describe('buildPetAgentIntegrationPrompt', () => {
  it('covers the protocol points the integrating agent needs', () => {
    const prompt = buildPetAgentIntegrationPrompt(INPUT)
    expect(prompt).toContain(INPUT.metadataPath)
    expect(prompt).toContain(INPUT.endpoint)
    expect(prompt).toContain('pet.events.subscribe')
    expect(prompt).toContain('pet.events.unsubscribe')
    expect(prompt).toContain('clientName')
    expect(prompt).toContain('_keepalive')
    expect(prompt).toContain('pet_event_stream_disabled')
    for (const kind of ['reply', 'needs-input', 'completed', 'interrupted']) {
      expect(prompt).toContain(kind)
    }
    // The token must be read at runtime, never embedded.
    expect(prompt).toContain('at runtime')
  })

  it('never leaks secrets into copyable text', () => {
    // Why: these texts are pasted into third-party agent chats. Guard the
    // invariant twice — a concrete marker and the 48-hex token shape.
    const sneaky = { ...INPUT, authToken: 'SECRET-MARKER-12345' } as typeof INPUT
    const guide = buildPetEventStreamGuide(sneaky)
    const prompt = buildPetAgentIntegrationPrompt(sneaky)
    for (const text of [guide, prompt]) {
      expect(text).not.toContain('SECRET-MARKER-12345')
      expect(text).not.toMatch(/\b[0-9a-f]{48}\b/)
    }
  })
})
