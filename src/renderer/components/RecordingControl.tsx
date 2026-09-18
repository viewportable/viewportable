import { useEffect, useRef, useState } from 'react'

type RecordingStatus = 'idle' | 'starting' | 'recording' | 'saving' | 'error'

type RecordingFormat = {
  mimeType: string
  extension: 'webm' | 'mp4'
}

export function RecordingControl() {
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef<number | null>(null)
  const [status, setStatus] = useState<RecordingStatus>('idle')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status !== 'recording') return

    const updateElapsed = () => {
      const startedAt = startedAtRef.current
      if (startedAt !== null) setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))
    }

    updateElapsed()
    const timer = window.setInterval(updateElapsed, 500)
    return () => window.clearInterval(timer)
  }, [status])

  useEffect(
    () => () => {
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') recorder.stop()
      stopStream(streamRef.current)
    },
    [],
  )

  async function startRecording() {
    if (status !== 'idle' && status !== 'error') return

    setStatus('starting')
    setError(null)
    setElapsedSeconds(0)

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 30, max: 60 },
        },
        audio: false,
      })

      const format = pickRecordingFormat()
      const recorder = new MediaRecorder(stream, {
        ...(format.mimeType ? { mimeType: format.mimeType } : {}),
        videoBitsPerSecond: 12_000_000,
      })

      chunksRef.current = []
      streamRef.current = stream
      recorderRef.current = recorder
      startedAtRef.current = Date.now()

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }

      recorder.onerror = () => {
        setError('Recording failed')
        setStatus('error')
        stopStream(stream)
      }

      recorder.onstop = () => {
        void finishRecording(recorder, format)
      }

      stream.getVideoTracks()[0]?.addEventListener(
        'ended',
        () => {
          if (recorder.state !== 'inactive') recorder.stop()
        },
        { once: true },
      )

      recorder.start(1000)
      setStatus('recording')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to start recording'
      setError(message)
      setStatus('error')
      stopStream(streamRef.current)
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return

    setStatus('saving')
    recorder.stop()
  }

  async function finishRecording(recorder: MediaRecorder, fallbackFormat: RecordingFormat) {
    try {
      const mimeType = recorder.mimeType || fallbackFormat.mimeType || 'video/webm'
      const extension: RecordingFormat['extension'] = mimeType.includes('mp4') ? 'mp4' : 'webm'
      const blob = new Blob(chunksRef.current, { type: mimeType })
      const bytes = new Uint8Array(await blob.arrayBuffer())

      await window.viewportable.saveRecording({
        bytes,
        mimeType,
        extension,
      })

      setStatus('idle')
      setElapsedSeconds(0)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to save recording'
      setError(message)
      setStatus('error')
    } finally {
      startedAtRef.current = null
      chunksRef.current = []
      recorderRef.current = null
      stopStream(streamRef.current)
      streamRef.current = null
    }
  }

  const recording = status === 'recording'
  const label =
    status === 'starting'
      ? 'Starting…'
      : status === 'saving'
        ? 'Saving…'
        : recording
          ? formatElapsed(elapsedSeconds)
          : 'Record'

  return (
    <button
      type="button"
      className={recording ? 'record-button recording' : 'record-button'}
      aria-label={recording ? 'Stop recording' : 'Record Viewportable window'}
      aria-pressed={recording}
      disabled={status === 'starting' || status === 'saving'}
      title={error ?? 'Record the Viewportable window'}
      onClick={recording ? stopRecording : startRecording}
    >
      <span className="record-dot" aria-hidden="true" />
      <span>{label}</span>
    </button>
  )
}

function pickRecordingFormat(): RecordingFormat {
  const candidates: RecordingFormat[] = [
    { mimeType: 'video/mp4;codecs=avc1.42E01E', extension: 'mp4' },
    { mimeType: 'video/mp4', extension: 'mp4' },
    { mimeType: 'video/webm;codecs=vp9', extension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8', extension: 'webm' },
    { mimeType: 'video/webm', extension: 'webm' },
  ]

  return (
    candidates.find(({ mimeType }) => MediaRecorder.isTypeSupported(mimeType)) ?? {
      mimeType: '',
      extension: 'webm',
    }
  )
}

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop())
}
