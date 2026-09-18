import { z } from 'zod'

export const IPC = {
  command: 'viewportable:command',
  bounds: 'viewportable:bounds',
  state: 'viewportable:state',
} as const

export const BrowserCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('navigate'), url: z.string().min(1) }),
  z.object({ type: z.literal('back') }),
  z.object({ type: z.literal('forward') }),
  z.object({ type: z.literal('reload') }),
  z.object({ type: z.literal('sync-state') }),
])

export type BrowserCommand = z.infer<typeof BrowserCommandSchema>

export const ViewportBoundsSchema = z.object({
  viewportId: z.string().min(1),
  rect: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().nonnegative(),
    height: z.number().finite().nonnegative(),
  }),
})

export type ViewportBounds = z.infer<typeof ViewportBoundsSchema>

export const BrowserStateSchema = z.object({
  url: z.string(),
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
  isLoading: z.boolean(),
  error: z.string().nullable(),
})

export type BrowserState = z.infer<typeof BrowserStateSchema>
