import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type EvalTool = { name: string; description: string; inputSchema: Record<string, unknown> }
const evalTools = (JSON.parse(readFileSync(resolve('evals/tools.json'), 'utf8')) as { tools: EvalTool[] }).tools

test('M7 eval schema snapshot exactly matches the ten live registered definitions', async ({ page }) => {
  await page.addInitScript(() => {
    const tools = new Map<string, WebMCP.ModelContextTool>()
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        registerTool: async (tool: WebMCP.ModelContextTool, options?: WebMCP.ModelContextRegisterToolOptions) => {
          if (!options?.signal?.aborted) tools.set(tool.name, tool)
          options?.signal?.addEventListener('abort', () => tools.delete(tool.name), { once: true })
        },
        getTools: async () => [...tools.values()].map(({ execute: _execute, ...tool }) => tool),
      },
    })
  })

  await page.goto('/')
  await expect.poll(async () => page.evaluate(() => document.modelContext!.getTools().then((tools) => tools.length))).toBe(10)
  const liveTools = await page.evaluate(async () => (await document.modelContext!.getTools()).map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })))

  expect(liveTools).toEqual(evalTools)
})
