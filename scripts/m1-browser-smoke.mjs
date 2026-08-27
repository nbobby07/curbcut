import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const url = process.argv[2] || 'http://127.0.0.1:4173'
const source = '<main><input type="email"><div id="same"></div><button id="same">Continue</button></main>'
const transport = new StdioClientTransport({
  command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
  args: [
    'chrome-devtools-mcp',
    '--headless',
    '--isolated',
    '--no-page-id-routing',
    '--no-performance-crux',
    '--no-usage-statistics',
  ],
})
const client = new Client({ name: 'curbcut-m1-browser-smoke', version: '1.0.0' })

function text(result) {
  return result.content?.filter((item) => item.type === 'text').map((item) => item.text).join('\n') || ''
}

try {
  await client.connect(transport)
  await client.callTool({ name: 'new_page', arguments: { url } })
  const evidence = text(await client.callTool({
    name: 'evaluate_script',
    arguments: {
      function: `async () => {
        const source = ${JSON.stringify(source)};
        [...document.querySelectorAll('nav button')].find((button) => button.textContent?.includes('Spike B'))?.click();
        await new Promise((resolve) => setTimeout(resolve, 100));
        const textarea = document.querySelector('textarea');
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        if (!textarea || !setter) throw new Error('Repair source editor did not load');
        setter.call(textarea, source);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 150));
        const frame = document.querySelector('iframe[title="Working source preview"]');
        const rendered = [...(frame?.contentDocument?.querySelectorAll('[data-curbcut-node]') || [])];
        const ids = rendered.map((element) => element.getAttribute('data-curbcut-node'));
        return {
          sourcePreserved: textarea.value === source,
          canonicalContainsMapping: textarea.value.includes('data-curbcut-node'),
          mappingCount: ids.length,
          uniqueMappingCount: new Set(ids).size,
          mappedTags: rendered.map((element) => element.tagName.toLowerCase()),
          userIds: rendered.map((element) => element.id || null),
        };
      }`,
    },
  }))
  const consoleErrors = text(await client.callTool({
    name: 'list_console_messages',
    arguments: { types: ['error'], includeStackTraces: true },
  }))

  for (const expected of [
    '"sourcePreserved":true',
    '"canonicalContainsMapping":false',
    '"mappingCount":4',
    '"uniqueMappingCount":4',
    '"mappedTags":["main","input","div","button"]',
    '"userIds":[null,null,"same","same"]',
  ]) {
    if (!evidence.includes(expected)) throw new Error(`Missing ${expected} in browser evidence:\n${evidence}`)
  }

  console.log(JSON.stringify({ url, evidence, consoleErrors }, null, 2))
} finally {
  await client.close()
}
