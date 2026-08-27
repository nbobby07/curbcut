import DOMPurify from 'dompurify'
import { createSourceMapping, type SourceMapping } from './sourceMap'
import type { DocumentMeta } from './previewProtocol'

const ALLOWED_TAGS = [
  'a', 'address', 'article', 'aside', 'b', 'blockquote', 'br', 'button', 'caption', 'code',
  'col', 'colgroup', 'dd', 'details', 'div', 'dl', 'dt', 'em', 'fieldset', 'figcaption',
  'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i',
  'img', 'input', 'label', 'legend', 'li', 'main', 'meter', 'nav', 'ol', 'optgroup',
  'option', 'p', 'picture', 'pre', 'progress', 'section', 'select', 'small', 'span', 'strong',
  'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'textarea', 'tfoot', 'th', 'thead', 'time',
  'tr', 'u', 'ul',
]

const ALLOWED_ATTR = [
  'accept', 'alt', 'autocomplete', 'autofocus', 'checked', 'class', 'cols', 'colspan',
  'disabled', 'dir', 'for', 'headers', 'height', 'hidden', 'id', 'inputmode', 'label', 'lang',
  'max', 'maxlength', 'min', 'minlength', 'multiple', 'name', 'open', 'pattern', 'placeholder',
  'readonly', 'required', 'role', 'rows', 'rowspan', 'scope', 'selected', 'size', 'span', 'src',
  'step', 'tabindex', 'title', 'type', 'value', 'width', 'wrap',
]

const FORBID_TAGS = [
  'script', 'style', 'link', 'base', 'meta', 'iframe', 'frame', 'frameset', 'object', 'embed',
  'template', 'noscript', 'svg', 'math', 'audio', 'video', 'source', 'track', 'portal',
]

const FORBID_ATTR = [
  'style', 'srcdoc', 'href', 'action', 'formaction', 'target', 'download', 'ping', 'poster',
  'srcset', 'integrity', 'nonce', 'http-equiv', 'content', 'background', 'cite', 'usemap',
  'autofocus',
]

export type PreparedPreview = {
  mapping: SourceMapping
  html: string
  documentMeta: DocumentMeta
}

export function preparePreview(htmlSource: string, sourceRevision: number): PreparedPreview {
  const mapping = createSourceMapping(htmlSource, sourceRevision)
  const htmlNode = mapping.nodes.find(({ tagName }) => tagName === 'html')
  const bodyNode = mapping.nodes.find(({ tagName }) => tagName === 'body')
  const lang = htmlNode?.attributes.lang
  const dir = htmlNode?.attributes.dir

  const keepMappingAttribute = (_node: Element, data: { attrName: string; forceKeepAttr?: boolean }) => {
    if (data.attrName === 'data-curbcut-node') data.forceKeepAttr = true
  }
  const restoreStaticTabindex = (node: Element) => {
    const sourceNode = mapping.nodesById.get(node.getAttribute('data-curbcut-node') ?? '')
    const tabindex = sourceNode?.attributes.tabindex
    if (tabindex && /^[+-]?[0-9]+$/u.test(tabindex)) node.setAttribute('tabindex', tabindex)
  }
  DOMPurify.addHook('uponSanitizeAttribute', keepMappingAttribute)
  DOMPurify.addHook('afterSanitizeAttributes', restoreStaticTabindex)
  let html: string
  try {
    html = DOMPurify.sanitize(mapping.previewSource, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOW_ARIA_ATTR: true,
      ALLOW_DATA_ATTR: false,
      ALLOW_UNKNOWN_PROTOCOLS: false,
      ALLOWED_URI_REGEXP: /^data:image\/(?:png|gif|jpeg|webp);base64,[a-z0-9+/=]+$/i,
      FORBID_TAGS,
      FORBID_ATTR,
      FORBID_CONTENTS: ['script', 'style', 'title', 'iframe', 'object', 'embed', 'svg', 'math'],
      CUSTOM_ELEMENT_HANDLING: {
        tagNameCheck: null,
        attributeNameCheck: null,
        allowCustomizedBuiltInElements: false,
      },
    }) as string
  } finally {
    DOMPurify.removeHook('uponSanitizeAttribute', keepMappingAttribute)
    DOMPurify.removeHook('afterSanitizeAttributes', restoreStaticTabindex)
  }

  return {
    mapping,
    html,
    documentMeta: {
      ...(lang && /^[A-Za-z0-9-]{1,35}$/.test(lang) ? { lang } : {}),
      ...(dir === 'ltr' || dir === 'rtl' || dir === 'auto' ? { dir } : {}),
      ...(htmlNode ? { htmlNodeId: htmlNode.nodeId } : {}),
      ...(bodyNode ? { bodyNodeId: bodyNode.nodeId } : {}),
    },
  }
}
