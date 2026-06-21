// Time-based animation phase state machine.
//
// Drives the visual CodexPetState from the raw agent source state, implementing:
//   Idle:    idle (1min) → music (1min) → [cycle, total 10min] → rest (2-5min random)
//            → doze or sleep (random pick, 30min total) → idle
//   Working: work → [1min] → wait (stays until task ends)
//   Waiting: wait directly (agent awaiting user permission)
//   Done:    done (1min) → idle  [auto-triggered on working→idle transition]
//   Fail:    fail (1min) → idle  [triggered via failSignal prop]
//
// All timers are wall-clock based and cleared on source state change so an
// incoming task always interrupts the idle cycle immediately.

import { useEffect, useRef, useState } from 'react'
import type { CodexPetState, MiniPetSourceState } from './codexPet'

type AnimPhase =
  | 'idle'
  | 'music'
  | 'rest'
  | 'doze'
  | 'sleep'
  | 'work'
  | 'wait'
  | 'done'
  | 'fail'

const MIN = 60_000
// How long to stay in rest before dropping into doze/sleep (randomised per cycle)
const REST_MIN_MS = 2 * MIN
const REST_MAX_MS = 5 * MIN
// Total time to spend in doze/sleep before returning to idle
const SLEEP_TOTAL_MS = 30 * MIN
// How long idle must accumulate before transitioning to rest
const IDLE_TO_REST_MS = 10 * MIN
// How long a single idle or music phase lasts before flipping to the other
const IDLE_PHASE_MS = 1 * MIN

// Map AnimPhase → CodexPetState (names are identical; the cast makes the
// return type explicit and catches future mismatches at compile time).
function phaseToState(p: AnimPhase): CodexPetState {
  return p as CodexPetState
}

export function usePetAnimPhase(
  source: MiniPetSourceState,
  // When true for one render, immediately enters the `fail` phase regardless
  // of source state. The caller is responsible for toggling this back to false.
  failSignal: boolean = false,
): CodexPetState {
  const [phase, setPhase] = useState<AnimPhase>(() => {
    if (source === 'waiting') return 'wait'
    if (source === 'working' || source === 'compacting') return 'work'
    return 'idle'
  })

  // Refs so timer callbacks can read latest values without stale closures.
  const sourceRef = useRef(source)
  sourceRef.current = source
  const prevSourceRef = useRef(source)

  // Accumulated idle time across idle/music sub-cycles. Resets to 0 each
  // time we re-enter the idle path from a non-idle source.
  const idleAccMs = useRef(0)
  // Wall-clock start of the current idle or music sub-phase.
  const subPhaseStartRef = useRef(0)

  // All scheduled timers for the current phase; cleared on every source change.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  const after = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, Math.max(0, ms))
    timers.current.push(t)
  }

  // --- Idle cycle ---
  // `accMs`: total idle ms already accumulated when this sub-cycle starts.
  const startIdleCycle = (accMs: number) => {
    const remainingToRest = IDLE_TO_REST_MS - accMs
    if (remainingToRest <= 0) {
      enterRest()
      return
    }

    idleAccMs.current = accMs
    subPhaseStartRef.current = performance.now()
    setPhase('idle')

    // idle → music after IDLE_PHASE_MS (capped so we don't overshoot rest threshold)
    const idleDur = Math.min(IDLE_PHASE_MS, remainingToRest)
    after(() => {
      if (sourceRef.current !== 'idle') return
      const elapsed = performance.now() - subPhaseStartRef.current
      const newAcc = idleAccMs.current + elapsed
      if (newAcc >= IDLE_TO_REST_MS) { enterRest(); return }

      subPhaseStartRef.current = performance.now()
      setPhase('music')

      // music → idle after IDLE_PHASE_MS
      const musicRemaining = IDLE_TO_REST_MS - newAcc
      const musicDur = Math.min(IDLE_PHASE_MS, musicRemaining)
      after(() => {
        if (sourceRef.current !== 'idle') return
        const elapsed2 = performance.now() - subPhaseStartRef.current
        startIdleCycle(newAcc + elapsed2)
      }, musicDur)
    }, idleDur)
  }

  const enterRest = () => {
    setPhase('rest')
    const restDur = REST_MIN_MS + Math.random() * (REST_MAX_MS - REST_MIN_MS)
    after(() => {
      if (sourceRef.current !== 'idle') return
      // Randomly pick doze or sleep, stay for SLEEP_TOTAL_MS, then restart idle cycle.
      const sleepPhase: AnimPhase = Math.random() < 0.5 ? 'doze' : 'sleep'
      setPhase(sleepPhase)
      after(() => {
        if (sourceRef.current !== 'idle') return
        startIdleCycle(0)
      }, SLEEP_TOTAL_MS)
    }, restDur)
  }

  // --- Source state changes ---
  useEffect(() => {
    const prev = prevSourceRef.current
    prevSourceRef.current = source

    clearTimers()

    if (source === 'idle') {
      const wasWorking = prev === 'working' || prev === 'compacting' || prev === 'waiting'
      if (wasWorking) {
        // Task just finished → show done for 1 minute then start idle cycle.
        setPhase('done')
        after(() => startIdleCycle(0), MIN)
      } else {
        // Initial load or returning from done/fail.
        startIdleCycle(0)
      }
    } else if (source === 'working' || source === 'compacting') {
      setPhase('work')
      // Long-running task: escalate to wait after 1 minute.
      after(() => {
        if (sourceRef.current === 'working' || sourceRef.current === 'compacting') {
          setPhase('wait')
        }
      }, MIN)
    } else if (source === 'waiting') {
      // Agent awaiting user permission → wait immediately.
      setPhase('wait')
    }

    return clearTimers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source])

  // --- External fail signal ---
  useEffect(() => {
    if (!failSignal) return
    clearTimers()
    setPhase('fail')
    after(() => startIdleCycle(0), MIN)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failSignal])

  return phaseToState(phase)
}
