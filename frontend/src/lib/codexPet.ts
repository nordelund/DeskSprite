// Codex-compatible pet asset model.
// Each pet is a single 8-column x 9-row atlas of 192x208 cells (1536x1872),
// matching the openai/skills hatch-pet output format. Row layout is by
// convention; pet.json itself does not declare it.

export type CodexPetState =
  | 'idle'
  | 'work'
  | 'wait'
  | 'done'
  | 'fail'
  | 'sleep'
  | 'doze'
  | 'rest'
  | 'rest-loop'
  | 'music'

export interface CodexPet {
  id: string
  displayName: string
  description: string
  // Resolved absolute URL ready to use as a CSS background-image source.
  spritesheetUrl: string
  // Per-character scale multiplier applied on top of MINI_SPRITE_DISPLAY_MULTIPLIER.
  // Defaults to 1 if not set in pet.json.
  displayScale: number
}

export const ATLAS = {
  cellW: 192,
  cellH: 208,
  cols: 26,
  rows: 9,
} as const

export interface AnimationRow {
  row: number
  frames: number
  startFrame?: number
}

// Row layout matching the fox-pink spritesheet.
export const ANIMATION_ROWS: Record<CodexPetState, AnimationRow> = {
  'idle':      { row: 0, frames: 21 },
  'work':      { row: 1, frames: 26 },
  'wait':      { row: 2, frames: 26 },
  'done':      { row: 3, frames: 21 },
  'fail':      { row: 4, frames: 26 },
  'sleep':     { row: 5, frames: 26 },
  'doze':      { row: 6, frames: 21 },
  'rest':      { row: 7, frames: 26 },
  'rest-loop': { row: 7, frames: 8, startFrame: 18 },
  'music':     { row: 8, frames: 21 },
}

export const SPRITE_FPS = 12

// Per-state fps overrides. States not listed fall back to SPRITE_FPS.
export const STATE_FPS: Partial<Record<CodexPetState, number>> = {
  idle: 2,
  work: 6,
  wait: 6,
  sleep: 2,
  doze: 6,
  music: 6,
}

export function fpsFor(state: CodexPetState): number {
  return STATE_FPS[state] ?? SPRITE_FPS
}

// Inter-cycle rest (ms) for looping sprite states. After completing a
// cycle, SpritePet holds the last frame for this duration before
// restarting from frame 0. Lets passive states like `wait` read as
// repeated bursts with stillness in between (matching the jump cadence)
// instead of a continuous animation that feels too busy.
export const STATE_LOOP_REST_MS: Partial<Record<CodexPetState, number>> = {
  wait: 600,
}

export function loopRestMsFor(state: CodexPetState): number {
  return STATE_LOOP_REST_MS[state] ?? 0
}

export const DEFAULT_PET_ID = 'phoebe'

// Default agent rotation queue used when the user hasn't customised one.
// Phoebe leads (matches the onboarding hero) and the rest follow the
// manifest order, capped at 10 entries.
export const DEFAULT_PET_QUEUE_IDS: string[] = [
  'phoebe',
  'doro',
  'elaina',
  'homie',
  'linnea',
  'mambo',
  'naruto',
  'nezuko',
  'skirk',
  'taffy',
]

// Maps Mini.tsx's `PetState` (idle/working/compacting/waiting) to a codex
// sprite state. Walking direction and hover are layered on top of this by
// the wrapper component, not by this function.
export type MiniPetSourceState = 'idle' | 'working' | 'compacting' | 'waiting'

export function petStateToCodexState(state: MiniPetSourceState): CodexPetState {
  switch (state) {
    case 'idle':
      return 'idle'
    case 'working':
    case 'compacting':
      return 'work'
    case 'waiting':
      return 'wait'
    default:
      return 'idle'
  }
}

const BUILTIN_BASE = '/assets/builtin'
const MANIFEST_URL = `${BUILTIN_BASE}/pets-manifest.json`

interface RawPetMeta {
  id: string
  displayName: string
  description: string
  spritesheetPath: string
  displayScale?: number
}

interface PetsManifest {
  pets: string[]
}

let cachedPets: Promise<CodexPet[]> | null = null

export function loadCodexPets(): Promise<CodexPet[]> {
  if (!cachedPets) {
    cachedPets = (async () => {
      const manifestRes = await fetch(MANIFEST_URL)
      if (!manifestRes.ok) {
        throw new Error(`pets-manifest.json fetch failed: ${manifestRes.status}`)
      }
      const manifest = (await manifestRes.json()) as PetsManifest
      const ids = Array.isArray(manifest.pets) ? manifest.pets : []

      const results = await Promise.all(
        ids.map(async (id): Promise<CodexPet | null> => {
          try {
            const res = await fetch(`${BUILTIN_BASE}/${id}/pet.json`)
            if (!res.ok) return null
            const meta = (await res.json()) as RawPetMeta
            return {
              id: meta.id || id,
              displayName: meta.displayName || id,
              description: meta.description || '',
              spritesheetUrl: `${BUILTIN_BASE}/${id}/${meta.spritesheetPath}`,
              displayScale: meta.displayScale ?? 1,
            }
          } catch {
            return null
          }
        }),
      )
      return results.filter((p): p is CodexPet => p !== null)
    })()
  }
  return cachedPets
}

export async function loadCodexPetById(id: string): Promise<CodexPet | null> {
  const builtins = await loadCodexPets()
  const hit = builtins.find((p) => p.id === id)
  if (hit) return hit
  const customs = await loadCustomCodexPets()
  return customs.find((p) => p.id === id) ?? null
}

export async function loadDefaultCodexPet(): Promise<CodexPet | null> {
  const pets = await loadCodexPets()
  if (pets.length === 0) return null
  return pets.find((p) => p.id === DEFAULT_PET_ID) ?? pets[0]
}

// Reset the manifest cache so the next call rescans `pets-manifest.json`.
// Used by the picker's refresh button after the user drops in new assets.
export function clearCodexPetCache(): void {
  cachedPets = null
}

// Pets dropped into `~/.codex/pets/` by the user. Loaded via the Rust
// `list_custom_codex_pets` command which serves them through the asset
// protocol so they render outside the bundled `public/` tree.
export async function loadCustomCodexPets(): Promise<CodexPet[]> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const raw = (await invoke('list_custom_codex_pets')) as Array<{
      id: string
      displayName: string
      description: string
      spritesheetUrl: string
    }>
    return raw.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      description: m.description,
      spritesheetUrl: m.spritesheetUrl,
      displayScale: 1,
    }))
  } catch (e) {
    console.warn('[codexPet] loadCustomCodexPets failed:', e)
    return []
  }
}
