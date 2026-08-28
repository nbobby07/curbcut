export const MAX_HTML_BYTES = 500_000
export const MAX_CSS_BYTES = 250_000
export const MAX_FRAME_MESSAGE_BYTES = 750_000
export const MAX_AXE_RULES = 40
export const MAX_AXE_NODES = 100

export type DocumentMeta = {
  lang?: string
  dir?: 'ltr' | 'rtl' | 'auto'
  htmlNodeId?: string
  bodyNodeId?: string
}

export type AxeNodePayload = {
  impact: 'critical' | 'serious' | 'moderate' | 'minor' | null
  target: string[]
  html: string
  nodeId?: string
}

export type AxeRulePayload = {
  id: string
  help: string
  helpUrl: string
  tags: string[]
  nodes: AxeNodePayload[]
}

export type ScanResultPayload = {
  violations: AxeRulePayload[]
  incomplete: AxeRulePayload[]
  coverage: {
    truncated: boolean
    totalRuleCount: number
    totalNodeCount: number
    returnedRuleCount: number
    returnedNodeCount: number
    maxRules: number
    maxNodes: number
  }
}

export type FrameMessage = {
  channel: string
  direction: 'frame-to-parent'
  type: 'READY' | 'RENDERED' | 'SCAN_RESULT' | 'HIGHLIGHTED' | 'ERROR'
  requestId: string
  sourceRevision: number
  payload: Record<string, unknown>
}

export type IsolationEvidence = { reportedOrigin: string; parentAccessBlocked: boolean }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const isBoundedString = (value: unknown, max: number) =>
  typeof value === 'string' && value.length <= max

function isAxeNode(value: unknown): value is AxeNodePayload {
  if (!isRecord(value)) return false
  return (
    (value.impact === null || ['critical', 'serious', 'moderate', 'minor'].includes(String(value.impact))) &&
    Array.isArray(value.target) &&
    value.target.length <= 12 &&
    value.target.every((part) => isBoundedString(part, 300)) &&
    isBoundedString(value.html, 1_000) &&
    (value.nodeId === undefined || isBoundedString(value.nodeId, 80))
  )
}

function isAxeRule(value: unknown): value is AxeRulePayload {
  if (!isRecord(value)) return false
  return (
    isBoundedString(value.id, 100) &&
    isBoundedString(value.help, 500) &&
    isBoundedString(value.helpUrl, 500) &&
    Array.isArray(value.tags) &&
    value.tags.length <= 50 &&
    value.tags.every((tag) => isBoundedString(tag, 100)) &&
    Array.isArray(value.nodes) &&
    value.nodes.length <= MAX_AXE_NODES &&
    value.nodes.every(isAxeNode)
  )
}

function isAxeScanPayload(payload: Record<string, unknown>) {
  if (!Array.isArray(payload.violations) || !Array.isArray(payload.incomplete)) return false
  if (!isRecord(payload.coverage)) return false
  const rules = [...payload.violations, ...payload.incomplete]
  if (rules.length > MAX_AXE_RULES) return false

  let nodeCount = 0
  for (const rule of rules) {
    if (!isRecord(rule) || !Array.isArray(rule.nodes)) return false
    nodeCount += rule.nodes.length
    if (nodeCount > MAX_AXE_NODES) return false
  }

  const coverage = payload.coverage
  return payload.violations.every(isAxeRule) && payload.incomplete.every(isAxeRule) &&
    typeof coverage.truncated === 'boolean' &&
    coverage.maxRules === MAX_AXE_RULES && coverage.maxNodes === MAX_AXE_NODES &&
    coverage.returnedRuleCount === rules.length && coverage.returnedNodeCount === nodeCount &&
    Number.isSafeInteger(coverage.totalRuleCount) && Number(coverage.totalRuleCount) >= rules.length &&
    Number.isSafeInteger(coverage.totalNodeCount) && Number(coverage.totalNodeCount) >= nodeCount &&
    coverage.truncated === (Number(coverage.totalRuleCount) > rules.length || Number(coverage.totalNodeCount) > nodeCount)
}

export function isFrameMessage(value: unknown): value is FrameMessage {
  if (!isRecord(value)) return false
  if (
    !isBoundedString(value.channel, 100) ||
    value.direction !== 'frame-to-parent' ||
    !['READY', 'RENDERED', 'SCAN_RESULT', 'HIGHLIGHTED', 'ERROR'].includes(String(value.type)) ||
    !isBoundedString(value.requestId, 100) ||
    !Number.isSafeInteger(value.sourceRevision) ||
    Number(value.sourceRevision) < -1 ||
    !isRecord(value.payload)
  ) return false

  if (value.type === 'SCAN_RESULT' && !isAxeScanPayload(value.payload)) return false
  if (JSON.stringify(value).length > MAX_FRAME_MESSAGE_BYTES) return false
  if (value.type === 'READY') {
    return isBoundedString(value.payload.reportedOrigin, 100) && typeof value.payload.parentAccessBlocked === 'boolean'
  }
  if (value.type === 'RENDERED') return true
  if (value.type === 'HIGHLIGHTED') {
    return value.payload.nodeId === null || isBoundedString(value.payload.nodeId, 80)
  }
  if (value.type === 'ERROR') {
    return isBoundedString(value.payload.code, 100) && isBoundedString(value.payload.message, 500)
  }
  return isAxeScanPayload(value.payload)
}

const CONTROLLER_SOURCE = String.raw`(() => {
  'use strict';
  const CHANNEL = __CURBCUT_CHANNEL__;
  const MAX_HTML = 500000;
  const MAX_CSS = 250000;
  const MAX_AXE_RULES = __CURBCUT_MAX_AXE_RULES__;
  const MAX_AXE_NODES = __CURBCUT_MAX_AXE_NODES__;
  const root = document.getElementById('curbcut-preview-root');
  const userStyle = document.getElementById('curbcut-user-style');
  let currentRevision = -1;

  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const safeString = (value, max) => typeof value === 'string' && value.length <= max;
  const safeId = value => safeString(value, 80) && /^cc-[0-9]+-[0-9]+$/.test(value);
  const send = (type, requestId, sourceRevision, payload = {}) => parent.postMessage({
    channel: CHANNEL,
    direction: 'frame-to-parent',
    type,
    requestId,
    sourceRevision,
    payload,
  }, '*');
  const fail = (requestId, sourceRevision, code, error) => send('ERROR', requestId, sourceRevision, {
    code,
    message: String(error instanceof Error ? error.message : error).slice(0, 500),
  });
  const clearHighlight = () => {
    document.querySelectorAll('[data-curbcut-highlight]').forEach(element => element.removeAttribute('data-curbcut-highlight'));
  };
  const findMappedNode = target => {
    if (!Array.isArray(target) || !target.every(part => typeof part === 'string')) return undefined;
    try {
      const element = document.querySelector(target.join(' '));
      return element && (element.closest('[data-curbcut-node]') || element).getAttribute('data-curbcut-node') || undefined;
    } catch {
      return undefined;
    }
  };
  const serializeScan = (violations, incomplete) => {
    const violationRules = Array.isArray(violations) ? violations : [];
    const incompleteRules = Array.isArray(incomplete) ? incomplete : [];
    const totalRuleCount = violationRules.length + incompleteRules.length;
    const totalNodeCount = [...violationRules, ...incompleteRules]
      .reduce((count, rule) => count + (Array.isArray(rule.nodes) ? rule.nodes.length : 0), 0);
    let remainingRules = MAX_AXE_RULES;
    let remainingNodes = MAX_AXE_NODES;
    const serializeRules = rules => {
      const output = [];
      if (!Array.isArray(rules)) return output;
      for (const rule of rules) {
        if (remainingRules === 0 || remainingNodes === 0) break;
        const rawNodes = Array.isArray(rule.nodes) ? rule.nodes : [];
        const nodes = rawNodes.slice(0, remainingNodes).map(node => {
          const target = Array.isArray(node.target) ? node.target.slice(0, 12).map(part => String(part).slice(0, 300)) : [];
          const nodeId = findMappedNode(target);
          return {
            impact: ['critical', 'serious', 'moderate', 'minor'].includes(node.impact) ? node.impact : null,
            target,
            html: String(node.html || '').slice(0, 1000),
            ...(nodeId ? { nodeId } : {}),
          };
        });
        remainingRules -= 1;
        remainingNodes -= nodes.length;
        output.push({
          id: String(rule.id || '').slice(0, 100),
          help: String(rule.help || '').slice(0, 500),
          helpUrl: String(rule.helpUrl || '').slice(0, 500),
          tags: Array.isArray(rule.tags) ? rule.tags.slice(0, 50).map(tag => String(tag).slice(0, 100)) : [],
          nodes,
        });
      }
      return output;
    };
    const serializedViolations = serializeRules(violationRules);
    const serializedIncomplete = serializeRules(incompleteRules);
    const returnedRules = [...serializedViolations, ...serializedIncomplete];
    const returnedNodeCount = returnedRules.reduce((count, rule) => count + rule.nodes.length, 0);
    return {
      violations: serializedViolations,
      incomplete: serializedIncomplete,
      coverage: {
        truncated: totalRuleCount > returnedRules.length || totalNodeCount > returnedNodeCount,
        totalRuleCount,
        totalNodeCount,
        returnedRuleCount: returnedRules.length,
        returnedNodeCount,
        maxRules: MAX_AXE_RULES,
        maxNodes: MAX_AXE_NODES,
      },
    };
  };

  addEventListener('submit', event => event.preventDefault(), true);
  addEventListener('click', event => {
    const link = event.target instanceof Element && event.target.closest('a');
    if (link) event.preventDefault();
  }, true);

  addEventListener('message', async event => {
    const message = event.data;
    if (event.source !== parent || !record(message) || message.channel !== CHANNEL || message.direction !== 'parent-to-frame') return;
    if (!['RENDER', 'SCAN', 'HIGHLIGHT', 'CLEAR_HIGHLIGHT'].includes(message.type)) return;
    if (!safeString(message.requestId, 100) || !Number.isSafeInteger(message.sourceRevision) || message.sourceRevision < 0 || !record(message.payload)) return;

    try {
      if (message.type === 'RENDER') {
        const { html, css, documentMeta } = message.payload;
        if (!safeString(html, MAX_HTML) || !safeString(css, MAX_CSS) || !record(documentMeta)) throw new Error('Invalid render payload');
        if (message.sourceRevision < currentRevision) throw new Error('Stale source revision');
        clearHighlight();
        root.replaceChildren();
        root.innerHTML = html;
        userStyle.textContent = css;
        document.documentElement.removeAttribute('lang');
        document.documentElement.removeAttribute('dir');
        document.documentElement.removeAttribute('data-curbcut-node');
        document.body.removeAttribute('data-curbcut-node');
        if (safeString(documentMeta.lang, 35) && /^[A-Za-z0-9-]+$/.test(documentMeta.lang)) document.documentElement.lang = documentMeta.lang;
        if (['ltr', 'rtl', 'auto'].includes(documentMeta.dir)) document.documentElement.dir = documentMeta.dir;
        if (safeId(documentMeta.htmlNodeId)) document.documentElement.setAttribute('data-curbcut-node', documentMeta.htmlNodeId);
        if (safeId(documentMeta.bodyNodeId)) document.body.setAttribute('data-curbcut-node', documentMeta.bodyNodeId);
        currentRevision = message.sourceRevision;
        send('RENDERED', message.requestId, currentRevision, {});
        return;
      }

      if (message.sourceRevision !== currentRevision) throw new Error('Stale source revision');

      if (message.type === 'SCAN') {
        if (!window.axe || typeof window.axe.run !== 'function') throw new Error('axe-core is unavailable');
        if (message.sourceRevision !== currentRevision) throw new Error('Stale source revision');
        const result = await window.axe.run(document, { rules: { tabindex: { enabled: true } } });
        if (message.sourceRevision !== currentRevision) return;
        send('SCAN_RESULT', message.requestId, currentRevision, serializeScan(result.violations, result.incomplete));
        return;
      }

      if (message.type === 'CLEAR_HIGHLIGHT') {
        clearHighlight();
        send('HIGHLIGHTED', message.requestId, currentRevision, { nodeId: null });
        return;
      }

      if (!safeId(message.payload.nodeId)) throw new Error('Invalid node ID');
      clearHighlight();
      const target = document.querySelector('[data-curbcut-node="' + message.payload.nodeId + '"]');
      if (!target) throw new Error('Mapped preview node was not found');
      target.setAttribute('data-curbcut-highlight', 'true');
      target.scrollIntoView({ block: 'center', inline: 'nearest' });
      send('HIGHLIGHTED', message.requestId, currentRevision, { nodeId: message.payload.nodeId });
    } catch (error) {
      fail(message.requestId, message.sourceRevision, 'FRAME_REQUEST_FAILED', error);
    }
  });

  let parentAccessBlocked = false;
  try { void parent.document.body; } catch { parentAccessBlocked = true; }
  send('READY', 'boot', -1, { reportedOrigin: String(self.origin), parentAccessBlocked });
})();`

const escapeScript = (source: string) => source.replace(/<\/script/gi, '<\\/script')

export function createFrameSecrets() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  const value = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '')
  return { nonce: value, channel: `curbcut-${value}` }
}

export function buildTrustedSrcdoc(axeSource: string, nonce: string, channel: string) {
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    'img-src data: blob:',
    "font-src 'none'",
    "connect-src 'none'",
    "media-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')
  const controller = CONTROLLER_SOURCE
    .replace('__CURBCUT_CHANNEL__', JSON.stringify(channel))
    .replace('__CURBCUT_MAX_AXE_RULES__', String(MAX_AXE_RULES))
    .replace('__CURBCUT_MAX_AXE_NODES__', String(MAX_AXE_NODES))

  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>Curbcut preview</title><style nonce="${nonce}" id="curbcut-user-style"></style><style nonce="${nonce}">[data-curbcut-highlight]{outline:4px solid #f0b429!important;outline-offset:3px!important}</style><script nonce="${nonce}">${escapeScript(axeSource)}</script></head><body><div id="curbcut-preview-root"></div><script nonce="${nonce}">${escapeScript(controller)}</script></body></html>`
}
