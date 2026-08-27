import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const url = process.argv[2] || 'http://127.0.0.1:5173'
const transport = new StdioClientTransport({
  command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
  args: [
    'chrome-devtools-mcp',
    '--headless',
    '--isolated',
    '--no-page-id-routing',
    '--categoryExperimentalWebmcp=true',
    '--chromeArg=--enable-features=WebMCP',
    '--no-performance-crux',
    '--no-usage-statistics',
  ],
})
const client = new Client({ name: 'webmcp-spike-smoke', version: '1.0.0' })

function text(result) {
  return result.content?.filter((item) => item.type === 'text').map((item) => item.text).join('\n') || ''
}

try {
  await client.connect(transport)
  const available = await client.listTools()
  for (const required of [
    'new_page',
    'navigate_page',
    'list_console_messages',
    'list_webmcp_tools',
    'execute_webmcp_tool',
  ]) {
    if (!available.tools.some((tool) => tool.name === required)) {
      throw new Error(`Chrome DevTools MCP did not expose ${required}`)
    }
  }

  await client.callTool({ name: 'new_page', arguments: { url } })
  const discovered = text(await client.callTool({ name: 'list_webmcp_tools', arguments: {} }))
  if (!discovered.includes('get_demo_state') || !discovered.includes('highlight_element')) {
    throw new Error(`Expected WebMCP tools were not discovered:\n${discovered}`)
  }

  const readResult = text(await client.callTool({
    name: 'execute_webmcp_tool',
    arguments: { toolName: 'get_demo_state', input: '{}' },
  }))
  const highlightResult = text(await client.callTool({
    name: 'execute_webmcp_tool',
    arguments: {
      toolName: 'highlight_element',
      input: JSON.stringify({ elementId: 'checkout-button' }),
    },
  }))
  const visibleState = text(await client.callTool({
    name: 'evaluate_script',
    arguments: {
      function: `() => ({
        highlighted: document.querySelector('#checkout-button')?.classList.contains('highlighted'),
        diagnostics: document.querySelector('.diagnostics')?.innerText,
      })`,
    },
  }))

  if (!visibleState.includes('"highlighted":true') || !visibleState.includes('highlight_element')) {
    throw new Error(`Tool did not update visible React state and diagnostics:\n${visibleState}`)
  }

  await client.callTool({ name: 'navigate_page', arguments: { type: 'reload' } })
  const reloadDiscovery = text(await client.callTool({ name: 'list_webmcp_tools', arguments: {} }))
  if (!reloadDiscovery.includes('get_demo_state') || !reloadDiscovery.includes('highlight_element')) {
    throw new Error(`WebMCP tools were not functional after reload:\n${reloadDiscovery}`)
  }
  const consoleMessages = text(await client.callTool({
    name: 'list_console_messages',
    arguments: { types: ['error'] },
  }))

  console.log(JSON.stringify({
    url,
    discovered,
    readResult,
    highlightResult,
    visibleState,
    reloadDiscovery,
    consoleErrors: consoleMessages,
  }, null, 2))
} finally {
  await client.close()
}
