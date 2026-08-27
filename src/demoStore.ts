import { useSyncExternalStore } from 'react'

export const DEMO_ELEMENT_IDS = ['email-field', 'checkout-button'] as const
export type DemoElementId = (typeof DEMO_ELEMENT_IDS)[number]

export type Invocation = {
  tool: string
  arguments: Record<string, unknown>
  timestamp: string
}

type DemoState = {
  selectedElement: DemoElementId | null
  registeredTools: string[]
  registrationError: string | null
  lastInvocation: Invocation | null
}

let state: DemoState = {
  selectedElement: null,
  registeredTools: [],
  registrationError: null,
  lastInvocation: null,
}

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())
const update = (patch: Partial<DemoState>) => {
  state = { ...state, ...patch }
  emit()
}

export const demoStore = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot: () => state,
  getDemoState() {
    return {
      selectedElement: state.selectedElement,
      currentVisibleState: state.selectedElement
        ? `${state.selectedElement} is highlighted`
        : 'No demo element is highlighted',
      availableDemoElementIds: [...DEMO_ELEMENT_IDS],
    }
  },
  recordInvocation(tool: string, args: Record<string, unknown>) {
    update({
      lastInvocation: {
        tool,
        arguments: args,
        timestamp: new Date().toISOString(),
      },
    })
  },
  highlightElement(elementId: string) {
    if (!DEMO_ELEMENT_IDS.includes(elementId as DemoElementId)) {
      throw new Error(`Unknown elementId: ${elementId}`)
    }
    update({ selectedElement: elementId as DemoElementId })
  },
  setRegistration(registeredTools: string[], registrationError: string | null = null) {
    update({ registeredTools, registrationError })
  },
}

export function useDemoState() {
  return useSyncExternalStore(
    demoStore.subscribe,
    demoStore.getSnapshot,
    demoStore.getSnapshot,
  )
}
