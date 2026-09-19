import { z } from 'zod'
import { MAX_ACTIVE_DEVICES } from '../core/board'
import { IPC } from './ipc-channels'
import { ACTIVE_SCALE_MODES } from './scale'

export { IPC }

const DeviceIdsSchema = z
  .array(z.string().min(1))
  .min(1)
  .max(MAX_ACTIVE_DEVICES)
  .refine((ids) => new Set(ids).size === ids.length, 'Device ids must be unique')

export const BrowserCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('navigate'), url: z.string().min(1) }),
  z.object({ type: z.literal('back') }),
  z.object({ type: z.literal('forward') }),
  z.object({ type: z.literal('reload') }),
  z.object({ type: z.literal('sync-state') }),
  z.object({ type: z.literal('set-scale-mode'), mode: z.enum(ACTIVE_SCALE_MODES) }),
  z.object({ type: z.literal('set-sync-scroll'), enabled: z.boolean() }),
  z.object({
    type: z.literal('scroll-all-viewports'),
    deltaY: z.number().finite(),
  }),
  z.object({ type: z.literal('set-devices'), deviceIds: DeviceIdsSchema }),
])

export type BrowserCommand = z.infer<typeof BrowserCommandSchema>

const LayoutRectSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
})

export const ViewportBoundsSchema = z.object({
  viewportId: z.string().min(1),
  rect: LayoutRectSchema,
})

export type ViewportBounds = z.infer<typeof ViewportBoundsSchema>

export const BoardLayoutSnapshotSchema = z.object({
  revision: z.number().int().nonnegative(),
  viewports: z
    .array(
      z.object({
        viewportId: z.string().min(1),
        rect: LayoutRectSchema,
      }),
    )
    .min(1)
    .max(MAX_ACTIVE_DEVICES)
    .refine(
      (viewports) => new Set(viewports.map(({ viewportId }) => viewportId)).size === viewports.length,
      'Viewport ids must be unique',
    ),
})

export type BoardLayoutSnapshot = z.infer<typeof BoardLayoutSnapshotSchema>

export const BrowserStateSchema = z.object({
  url: z.string(),
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
  isLoading: z.boolean(),
  error: z.string().nullable(),
  scaleMode: z.enum(ACTIVE_SCALE_MODES),
  syncScrollEnabled: z.boolean(),
  viewportScales: z.record(z.string(), z.number().finite().nonnegative()),
  activeDeviceIds: DeviceIdsSchema,
})

export type BrowserState = z.infer<typeof BrowserStateSchema>

export const SaveRecordingRequestSchema = z.object({
  bytes: z.instanceof(Uint8Array),
  mimeType: z.string().min(1),
  extension: z.enum(['webm', 'mp4']),
})

export type SaveRecordingRequest = z.infer<typeof SaveRecordingRequestSchema>

export type SaveRecordingResult = {
  status: 'saved' | 'cancelled'
}


export const BoardScrollDeltaSchema = z.object({
  deltaX: z.number().finite(),
})

export type BoardScrollDelta = z.infer<typeof BoardScrollDeltaSchema>
