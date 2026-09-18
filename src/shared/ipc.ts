import { z } from 'zod'
import { IPC } from './ipc-channels'
import { ACTIVE_SCALE_MODES } from './scale'

export { IPC }

const DeviceIdsSchema = z
  .array(z.string().min(1))
  .min(1)
  .max(6)
  .refine((ids) => new Set(ids).size === ids.length, 'Device ids must be unique')

export const BrowserCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('navigate'), url: z.string().min(1) }),
  z.object({ type: z.literal('back') }),
  z.object({ type: z.literal('forward') }),
  z.object({ type: z.literal('reload') }),
  z.object({ type: z.literal('sync-state') }),
  z.object({ type: z.literal('set-scale-mode'), mode: z.enum(ACTIVE_SCALE_MODES) }),
  z.object({ type: z.literal('set-devices'), deviceIds: DeviceIdsSchema }),
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
  scaleMode: z.enum(ACTIVE_SCALE_MODES),
  viewportScales: z.record(z.string(), z.number().finite().nonnegative()),
  activeDeviceIds: DeviceIdsSchema,
})

export type BrowserState = z.infer<typeof BrowserStateSchema>
