import axeSource from 'axe-core/axe.min.js?raw'
import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react'
import {
  buildTrustedSrcdoc,
  createFrameSecrets,
  isFrameMessage,
  type DocumentMeta,
  type IsolationEvidence,
  type ScanResultPayload,
} from './previewProtocol'

type PendingRequest = {
  expectedType: 'RENDERED' | 'SCAN_RESULT' | 'HIGHLIGHTED'
  sourceRevision: number
  resolve: (payload: Record<string, unknown>) => void
  reject: (error: Error) => void
  timer: number
  cleanup: () => void
}

export type PreviewBridge = {
  render(sourceRevision: number, html: string, css: string, documentMeta: DocumentMeta, signal?: AbortSignal): Promise<void>
  scan(sourceRevision: number, signal?: AbortSignal): Promise<ScanResultPayload>
  highlight(sourceRevision: number, nodeId: string, signal?: AbortSignal): Promise<void>
  clearHighlight(sourceRevision: number, signal?: AbortSignal): Promise<void>
}

type Props = { title?: string; onIsolationEvidence?: (evidence: IsolationEvidence) => void }

export const Preview = forwardRef<PreviewBridge, Props>(function Preview(
  { title = 'Rendered source preview', onIsolationEvidence },
  ref,
) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const pending = useRef(new Map<string, PendingRequest>())
  const ready = useRef<{ promise: Promise<void>; resolve: () => void } | null>(null)
  if (!ready.current) {
    let resolve: () => void = () => {}
    const promise = new Promise<void>((done) => { resolve = done })
    ready.current = { promise, resolve }
  }

  const secrets = useMemo(createFrameSecrets, [])
  const srcDoc = useMemo(
    () => buildTrustedSrcdoc(axeSource, secrets.nonce, secrets.channel),
    [secrets],
  )

  useLayoutEffect(() => {
    function receive(event: MessageEvent) {
      if (event.source !== frameRef.current?.contentWindow || !isFrameMessage(event.data)) return
      const message = event.data
      if (message.channel !== secrets.channel || message.direction !== 'frame-to-parent') return

      if (message.type === 'READY' && message.requestId === 'boot' && message.sourceRevision === -1) {
        onIsolationEvidence?.(message.payload as IsolationEvidence)
        ready.current?.resolve()
        return
      }

      const request = pending.current.get(message.requestId)
      if (!request || request.sourceRevision !== message.sourceRevision) return
      if (message.type === 'ERROR') {
        clearTimeout(request.timer)
        pending.current.delete(message.requestId)
        request.cleanup()
        request.reject(new Error(String(message.payload.message)))
        return
      }
      if (message.type !== request.expectedType) return

      clearTimeout(request.timer)
      pending.current.delete(message.requestId)
      request.cleanup()
      request.resolve(message.payload)
    }

    window.addEventListener('message', receive)
    return () => {
      window.removeEventListener('message', receive)
      for (const request of pending.current.values()) {
        clearTimeout(request.timer)
        request.cleanup()
        request.reject(new Error('Preview bridge closed'))
      }
      pending.current.clear()
    }
  }, [onIsolationEvidence, secrets.channel])

  async function send(
    type: 'RENDER' | 'SCAN' | 'HIGHLIGHT' | 'CLEAR_HIGHLIGHT',
    expectedType: PendingRequest['expectedType'],
    sourceRevision: number,
    payload: Record<string, unknown>,
    signal?: AbortSignal,
  ) {
    if (signal?.aborted) throw new DOMException('WebMCP execution cancelled', 'AbortError')
    await Promise.race([
      ready.current!.promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Preview did not become ready')), 8_000)),
    ])
    if (signal?.aborted) throw new DOMException('WebMCP execution cancelled', 'AbortError')
    const target = frameRef.current?.contentWindow
    if (!target) throw new Error('Preview frame is unavailable')

    const requestId = crypto.randomUUID()
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const cleanup = () => signal?.removeEventListener('abort', cancel)
      const cancel = () => {
        const request = pending.current.get(requestId)
        if (!request) return
        clearTimeout(request.timer)
        pending.current.delete(requestId)
        cleanup()
        reject(new DOMException('WebMCP execution cancelled', 'AbortError'))
      }
      const timer = window.setTimeout(() => {
        pending.current.delete(requestId)
        cleanup()
        reject(new Error(`Preview ${type.toLowerCase()} timed out`))
      }, 20_000)
      pending.current.set(requestId, { expectedType, sourceRevision, resolve, reject, timer, cleanup })
      signal?.addEventListener('abort', cancel, { once: true })
      target.postMessage({
        channel: secrets.channel,
        direction: 'parent-to-frame',
        type,
        requestId,
        sourceRevision,
        payload,
      }, '*')
    })
  }

  useImperativeHandle(ref, () => ({
    async render(sourceRevision, html, css, documentMeta, signal) {
      await send('RENDER', 'RENDERED', sourceRevision, { html, css, documentMeta }, signal)
    },
    async scan(sourceRevision, signal) {
      return await send('SCAN', 'SCAN_RESULT', sourceRevision, {}, signal) as ScanResultPayload
    },
    async highlight(sourceRevision, nodeId, signal) {
      await send('HIGHLIGHT', 'HIGHLIGHTED', sourceRevision, { nodeId }, signal)
    },
    async clearHighlight(sourceRevision, signal) {
      await send('CLEAR_HIGHLIGHT', 'HIGHLIGHTED', sourceRevision, {}, signal)
    },
  }))

  return (
    <iframe
      ref={frameRef}
      className="preview-frame"
      data-testid="secure-preview"
      title={title}
      sandbox="allow-scripts"
      srcDoc={srcDoc}
    />
  )
})
