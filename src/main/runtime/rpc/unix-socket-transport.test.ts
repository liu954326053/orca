import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Socket } from 'node:net'
import { UnixSocketTransport } from './unix-socket-transport'

class FakeSocket extends EventEmitter {
  destroyed = false
  writable = true
  readonly writes: string[] = []

  setEncoding(): void {}
  setNoDelay(): void {}
  setTimeout(): void {}

  write(data: string): boolean {
    this.writes.push(data)
    return true
  }

  destroy(): this {
    if (!this.destroyed) {
      this.destroyed = true
      this.writable = false
      this.emit('close')
    }
    return this
  }
}

type UnixSocketTransportInternals = {
  handleConnection(socket: Socket): void
}

describe('UnixSocketTransport', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('clears request keepalive timers when the socket closes before a reply', () => {
    const transport = new UnixSocketTransport({
      endpoint: '/tmp/orca-runtime-rpc-test.sock',
      kind: 'unix',
      keepaliveIntervalMs: 100
    })
    const socket = new FakeSocket()
    let aborted = false

    transport.onMessage((_msg, _reply, context) => {
      context?.signal?.addEventListener(
        'abort',
        () => {
          aborted = true
        },
        { once: true }
      )
      context?.startKeepalive()
    })

    ;(transport as unknown as UnixSocketTransportInternals).handleConnection(
      socket as unknown as Socket
    )
    socket.emit('data', '{"id":"pending","method":"wait"}\n')

    vi.advanceTimersByTime(100)
    expect(socket.writes).toHaveLength(1)

    socket.destroy()
    expect(aborted).toBe(true)

    vi.advanceTimersByTime(500)
    expect(socket.writes).toHaveLength(1)
  })

  it('replyStream writes multiple frames and endStream stops the keepalive', () => {
    const transport = new UnixSocketTransport({
      endpoint: '/tmp/orca-runtime-rpc-test.sock',
      kind: 'unix',
      keepaliveIntervalMs: 100
    })
    const socket = new FakeSocket()
    let streamContext:
      | { replyStream?: (response: string) => void; endStream?: () => void }
      | undefined

    transport.onMessage((_msg, _reply, context) => {
      context?.startKeepalive()
      streamContext = context
    })

    ;(transport as unknown as UnixSocketTransportInternals).handleConnection(
      socket as unknown as Socket
    )
    socket.emit('data', '{"id":"s","method":"pet.events.subscribe"}\n')

    streamContext?.replyStream?.('{"frame":1}')
    streamContext?.replyStream?.('{"frame":2}')
    expect(socket.writes).toEqual(['{"frame":1}\n', '{"frame":2}\n'])

    // The keepalive keeps running while the stream is open, defeating the
    // socket idle timeout for quiet subscriptions.
    vi.advanceTimersByTime(100)
    expect(socket.writes).toHaveLength(3)
    expect(socket.writes[2]).toBe('{"_keepalive":true}\n')

    streamContext?.endStream?.()
    vi.advanceTimersByTime(500)
    expect(socket.writes).toHaveLength(3)
  })

  it('replyStream drops frames after the socket closes and still aborts', () => {
    const transport = new UnixSocketTransport({
      endpoint: '/tmp/orca-runtime-rpc-test.sock',
      kind: 'unix',
      keepaliveIntervalMs: 100
    })
    const socket = new FakeSocket()
    let aborted = false
    let streamContext: { replyStream?: (response: string) => void } | undefined

    transport.onMessage((_msg, _reply, context) => {
      context?.signal?.addEventListener(
        'abort',
        () => {
          aborted = true
        },
        { once: true }
      )
      streamContext = context
    })

    ;(transport as unknown as UnixSocketTransportInternals).handleConnection(
      socket as unknown as Socket
    )
    socket.emit('data', '{"id":"s","method":"pet.events.subscribe"}\n')

    socket.destroy()
    expect(aborted).toBe(true)

    streamContext?.replyStream?.('{"frame":1}')
    expect(socket.writes).toEqual([])
  })
})
