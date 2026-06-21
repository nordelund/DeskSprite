import { useCallback, useEffect, useRef, useState } from 'react'
import { SpritePet } from './SpritePet'
import { ANIMATION_ROWS, fpsFor } from '../lib/codexPet'
import type { CodexPet, CodexPetState, MiniPetSourceState } from '../lib/codexPet'
import { usePetAnimPhase } from '../lib/usePetAnimPhase'

interface MiniPetMascotProps {
  pet: CodexPet
  // Raw agent source state. The component runs its own time-based state
  // machine (usePetAnimPhase) to derive the visual animation phase.
  sourceState: MiniPetSourceState
  // When provided, overrides the animation to `work` (running left/right).
  // Used while the user drags the mascot window.
  walkDir?: -1 | 0 | 1
  // Set to true for one render to trigger the fail animation immediately.
  failSignal?: boolean
  size: number
  // When true, the wrapper plays a one-shot done while hovered, then waits
  // before triggering the next animation.
  enableHoverJump?: boolean
  // External hover signal driven by a native cursor poll (used on macOS).
  // When `useExternalHover` is true this is the single source of truth and
  // webview-level mouseenter/leave is ignored, because macOS does not
  // deliver mouseenter to non-key floating windows reliably and would also
  // keep firing during a drag (sprite would stay frozen on `done`).
  externalHover?: boolean
  useExternalHover?: boolean
  // While true, hover is forced off so the wrapper never enters the
  // `done` cycle. Used during a drag (Windows uses the webview-level
  // `onMouseEnter`/`onMouseLeave`, which stay stuck on `enter` because the
  // pointer never crosses the mascot border while the user is dragging
  // it). Without this, walkDir → work is hidden by the
  // continuous animation.
  suppressHover?: boolean
  className?: string
  style?: React.CSSProperties
}

// How long the sprite holds the animation's final frame before replaying the
// next one-shot. While hovered, the cycle is: play animation → freeze on last
// frame for ANIM_REST_MS → replay animation → ...
const ANIM_REST_MS = 400

export function MiniPetMascot({
  pet,
  sourceState,
  walkDir = 0,
  failSignal = false,
  size,
  enableHoverJump = false,
  externalHover = false,
  useExternalHover = false,
  suppressHover = false,
  className,
  style,
}: MiniPetMascotProps) {
  const animPhase = usePetAnimPhase(sourceState, failSignal)
  // walkDir overrides animation to `work` (running) while the user drags.
  const baseState: CodexPetState = walkDir !== 0 ? 'work' : animPhase
  const [internalHover, setInternalHover] = useState(false)
  const [showAnim, setShowAnim] = useState(false)
  // Bumping this remounts SpritePet (via `key`) and replays the animation
  // from frame 0 without leaving the `done` state — that way
  // the rest period stays on the last frame instead of falling back
  // to baseState (idle/work/wait) between cycles.
  const [animKey, setAnimKey] = useState(0)
  const hoveringRef = useRef(false)
  const restTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onEnter = useCallback(() => {
    if (enableHoverJump && !useExternalHover) setInternalHover(true)
  }, [enableHoverJump, useExternalHover])

  const onLeave = useCallback(() => {
    if (enableHoverJump && !useExternalHover) setInternalHover(false)
  }, [enableHoverJump, useExternalHover])

  const hovering =
    enableHoverJump
    && !suppressHover
    && (useExternalHover ? externalHover : internalHover)
  hoveringRef.current = hovering

  useEffect(() => {
    if (!hovering) {
      if (restTimerRef.current) {
        clearTimeout(restTimerRef.current)
        restTimerRef.current = null
      }
      setShowAnim(false)
      return
    }
    setShowAnim(true)
    return () => {
      if (restTimerRef.current) {
        clearTimeout(restTimerRef.current)
        restTimerRef.current = null
      }
    }
  }, [hovering])

  const handleAnimEnd = useCallback(() => {
    // SpritePet's one-shot logic naturally holds the last frame here, so
    // we do NOT flip back to baseState. After the rest delay we just
    // bump animKey to remount SpritePet and let it play from frame 0.
    if (restTimerRef.current) clearTimeout(restTimerRef.current)
    restTimerRef.current = setTimeout(() => {
      restTimerRef.current = null
      if (hoveringRef.current) setAnimKey((k) => k + 1)
    }, ANIM_REST_MS)
  }, [])

  // Safety net: if SpritePet's onOneShotEnd somehow doesn't fire (e.g.
  // tab throttling), schedule the rest cycle by the animation's nominal
  // duration plus a small buffer.
  useEffect(() => {
    if (!showAnim) return
    const row = ANIMATION_ROWS['music']
    const fps = fpsFor('music')
    const expected = (row.frames / Math.max(fps, 1)) * 1000
    const fallback = setTimeout(() => {
      handleAnimEnd()
    }, expected + 200)
    return () => clearTimeout(fallback)
  }, [showAnim, animKey, handleAnimEnd])

  const renderState: CodexPetState = showAnim ? 'music' : baseState

  return (
    <div
      className={className}
      onMouseEnter={enableHoverJump && !useExternalHover ? onEnter : undefined}
      onMouseLeave={enableHoverJump && !useExternalHover ? onLeave : undefined}
      style={{ display: 'inline-block', lineHeight: 0, ...style }}
    >
      <SpritePet
        key={showAnim ? `anim-${animKey}` : `base-${renderState}`}
        pet={pet}
        state={renderState}
        size={size}
        onOneShotEnd={handleAnimEnd}
      />
    </div>
  )
}
