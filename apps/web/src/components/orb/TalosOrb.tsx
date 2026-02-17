import { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from "react"
import { TalosOrbDisplay, type OrbConfig } from "./TalosOrbDisplay"
import { useOrbColorStore } from "@/stores/useOrbColorStore"
import { Shuffle, ChevronDown, ChevronUp, Moon, Circle, Zap } from "lucide-react"

// Color utilities
function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360
  s /= 100
  l /= 100
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

type HarmonyMode = 'complementary' | 'analogous'

interface ColorPalette {
  orbPrimary: string
  orbSecondary: string
  orbTertiary: string
  glow: string
  ringPrimary: string
  ringSecondary: string
  cometPrimary: string
  cometSecondary: string
}

function generateHarmoniousPalette(mode?: HarmonyMode): ColorPalette {
  const orbHue = Math.random() * 360
  const baseSat = 70 + Math.random() * 25
  const baseLit = 55 + Math.random() * 20

  const modes: HarmonyMode[] = ['complementary', 'analogous']
  const selectedMode = mode || modes[Math.floor(Math.random() * modes.length)]

  let ringHue = orbHue
  let cometHue = orbHue

  switch (selectedMode) {
    case 'complementary':
      ringHue = orbHue + 180
      cometHue = orbHue + 180
      break
    case 'analogous':
      ringHue = orbHue + 40
      cometHue = orbHue + 80
      break
  }

  return {
    orbPrimary: hslToHex(orbHue, baseSat, baseLit),
    orbSecondary: hslToHex(orbHue + 25, baseSat - 5, baseLit + 8),
    orbTertiary: hslToHex(orbHue - 25, baseSat - 10, baseLit - 5),
    glow: hslToHex(orbHue, Math.min(baseSat + 15, 100), Math.min(baseLit + 15, 85)),
    ringPrimary: hslToHex(ringHue, baseSat, baseLit + 5),
    ringSecondary: hslToHex(ringHue + 30, baseSat - 10, baseLit - 10),
    cometPrimary: hslToHex(cometHue, baseSat + 10, Math.min(baseLit + 20, 90)),
    cometSecondary: hslToHex(cometHue + 30, baseSat, baseLit),
  }
}

function randomConfig(): Partial<OrbConfig> {
  const palette = generateHarmoniousPalette()
  return {
    orbPrimaryColor: palette.orbPrimary,
    orbSecondaryColor: palette.orbSecondary,
    orbTertiaryColor: palette.orbTertiary,
    glowColor: palette.glow,
    ringPrimaryColor: palette.ringPrimary,
    ringSecondaryColor: palette.ringSecondary,
    cometPrimaryColor: palette.cometPrimary,
    cometSecondaryColor: palette.cometSecondary,
    glowPulseFrequency: 5 + Math.random() * 5,
    heartbeatFrequency: 6 + Math.random() * 4,
    animationScale: 0.5,
    blobiness: Math.random() * 0.2,
    blobinessSpeed: 0.4 + Math.random() * 1.2,
    ringCount: Math.floor(1 + Math.random() * 6),
    ringWobble: Math.random(),
    ringSpinUniformity: Math.random(),
    cometCount: Math.floor(1 + Math.random() * 5),
    cometTailLength: 0.4 + Math.random() * 0.6,
    sparkliness: 0.1 + Math.random() * 0.9,
    size: 350,
  }
}

// Orb state types
type OrbState = 'sleep' | 'idle' | 'turbo'

// Methods exposed via ref
export interface TalosOrbRef {
  sleep: () => void
  idle: () => void
  turbo: () => void
  randomize: () => void
  getState: () => OrbState
  getConfig: () => Partial<OrbConfig>
  setConfig: (config: Partial<OrbConfig>) => void
}

export interface TalosOrbProps {
  /** Initial config (optional) */
  initialConfig?: Partial<OrbConfig>
  /** Initial state - 'idle' (default, colorful) or 'sleep' (gray, slow) */
  initialState?: OrbState
  /** Show the control panel */
  showControls?: boolean
  /** Show the state buttons (sleep/idle/turbo) */
  showStateButtons?: boolean
  /** Custom class name */
  className?: string
  /** Callback when state changes */
  onStateChange?: (state: OrbState) => void
}

const SLEEP_VISUAL: Partial<OrbConfig> = {
  orbPrimaryColor: '#888888',
  orbSecondaryColor: '#888888',
  orbTertiaryColor: '#888888',
  glowColor: '#888888',
  ringPrimaryColor: '#888888',
  ringSecondaryColor: '#888888',
  cometPrimaryColor: '#888888',
  cometSecondaryColor: '#888888',
  animationScale: 0.03,
}

export const TalosOrb = forwardRef<TalosOrbRef | null, TalosOrbProps>(({
  initialConfig,
  initialState = 'idle',
  showControls = false,
  showStateButtons = false,
  className,
  onStateChange,
}, ref) => {
  // Generate full config once (random colors + user overrides) so both
  // the display config and the stored idle config share the same palette
  const [baseConfig] = useState(() => ({ ...randomConfig(), ...initialConfig }))

  const [config, setConfig] = useState<Partial<OrbConfig>>(() => {
    if (initialState === 'sleep') {
      return { ...baseConfig, ...SLEEP_VISUAL }
    }
    return baseConfig
  })
  const [showParams, setShowParams] = useState(true)
  const [orbState, setOrbState] = useState<OrbState>(initialState)

  const configRef = useRef(config)
  configRef.current = config

  // When starting in sleep, store the colorful config so idle() can restore it
  const idleConfigRef = useRef<Partial<OrbConfig> | null>(
    initialState === 'sleep' ? baseConfig : null
  )
  const animationRef = useRef<number | null>(null)

  // Constants
  const SLEEP_COLOR = '#888888'
  const SLEEP_SPEED = 0.03
  const TURBO_SPEED = 1
  const TURBO_SPARKLE = 1
  const TRANSITION_DURATION = 500

  const lerp = (start: number, end: number, t: number) => start + (end - start) * t

  const lerpColor = (startHex: string, endHex: string, t: number): string => {
    const start = {
      r: parseInt(startHex.slice(1, 3), 16),
      g: parseInt(startHex.slice(3, 5), 16),
      b: parseInt(startHex.slice(5, 7), 16),
    }
    const end = {
      r: parseInt(endHex.slice(1, 3), 16),
      g: parseInt(endHex.slice(3, 5), 16),
      b: parseInt(endHex.slice(5, 7), 16),
    }
    const r = Math.round(lerp(start.r, end.r, t))
    const g = Math.round(lerp(start.g, end.g, t))
    const b = Math.round(lerp(start.b, end.b, t))
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  }

  const animateTransition = useCallback((
    targetConfig: Partial<OrbConfig>,
    newState: OrbState,
    duration: number = TRANSITION_DURATION,
    onComplete?: () => void
  ) => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }

    const startConfig = { ...configRef.current }
    const startTime = performance.now()

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const t = Math.min(elapsed / duration, 1)
      const easeT = t * (2 - t)

      const newConfig: Partial<OrbConfig> = { ...startConfig }

      if (targetConfig.orbPrimaryColor) {
        newConfig.orbPrimaryColor = lerpColor(startConfig.orbPrimaryColor!, targetConfig.orbPrimaryColor, easeT)
      }
      if (targetConfig.orbSecondaryColor) {
        newConfig.orbSecondaryColor = lerpColor(startConfig.orbSecondaryColor!, targetConfig.orbSecondaryColor, easeT)
      }
      if (targetConfig.orbTertiaryColor) {
        newConfig.orbTertiaryColor = lerpColor(startConfig.orbTertiaryColor!, targetConfig.orbTertiaryColor, easeT)
      }
      if (targetConfig.glowColor) {
        newConfig.glowColor = lerpColor(startConfig.glowColor!, targetConfig.glowColor, easeT)
      }
      if (targetConfig.ringPrimaryColor) {
        newConfig.ringPrimaryColor = lerpColor(startConfig.ringPrimaryColor!, targetConfig.ringPrimaryColor, easeT)
      }
      if (targetConfig.ringSecondaryColor) {
        newConfig.ringSecondaryColor = lerpColor(startConfig.ringSecondaryColor!, targetConfig.ringSecondaryColor, easeT)
      }
      if (targetConfig.cometPrimaryColor) {
        newConfig.cometPrimaryColor = lerpColor(startConfig.cometPrimaryColor!, targetConfig.cometPrimaryColor, easeT)
      }
      if (targetConfig.cometSecondaryColor) {
        newConfig.cometSecondaryColor = lerpColor(startConfig.cometSecondaryColor!, targetConfig.cometSecondaryColor, easeT)
      }
      if (targetConfig.animationScale !== undefined) {
        newConfig.animationScale = lerp(startConfig.animationScale!, targetConfig.animationScale, easeT)
      }
      if (targetConfig.sparkliness !== undefined) {
        newConfig.sparkliness = lerp(startConfig.sparkliness!, targetConfig.sparkliness, easeT)
      }

      setConfig(newConfig)

      if (t < 1) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        onComplete?.()
      }
    }

    animationRef.current = requestAnimationFrame(animate)
    setOrbState(newState)
    onStateChange?.(newState)
  }, [onStateChange])

  const sleep = useCallback(() => {
    if (orbState === 'sleep') return

    if (orbState === 'idle') {
      idleConfigRef.current = { ...configRef.current }
    }

    animateTransition({
      orbPrimaryColor: SLEEP_COLOR,
      orbSecondaryColor: SLEEP_COLOR,
      orbTertiaryColor: SLEEP_COLOR,
      glowColor: SLEEP_COLOR,
      ringPrimaryColor: SLEEP_COLOR,
      ringSecondaryColor: SLEEP_COLOR,
      cometPrimaryColor: SLEEP_COLOR,
      cometSecondaryColor: SLEEP_COLOR,
      animationScale: SLEEP_SPEED,
    }, 'sleep')
  }, [orbState, animateTransition])

  const idle = useCallback(() => {
    if (orbState === 'idle' || !idleConfigRef.current) return

    animateTransition(idleConfigRef.current, 'idle', TRANSITION_DURATION, () => {
      idleConfigRef.current = null
    })
  }, [orbState, animateTransition])

  const turbo = useCallback(() => {
    if (orbState === 'turbo') return

    if (orbState === 'idle') {
      idleConfigRef.current = { ...configRef.current }
    }

    const turboConfig = {
      animationScale: TURBO_SPEED,
      sparkliness: TURBO_SPARKLE,
    }

    if (orbState === 'sleep' && idleConfigRef.current) {
      animateTransition(idleConfigRef.current, 'idle', 250, () => {
        animateTransition(turboConfig, 'turbo', 250)
      })
    } else {
      animateTransition(turboConfig, 'turbo')
    }
  }, [orbState, animateTransition])

  const randomize = useCallback(() => {
    const newConfig = randomConfig()
    // Preserve the current size
    newConfig.size = configRef.current.size
    setConfig(newConfig)
    idleConfigRef.current = null
    setOrbState('idle')
    onStateChange?.('idle')
  }, [onStateChange])

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    sleep,
    idle,
    turbo,
    randomize,
    getState: () => orbState,
    getConfig: () => configRef.current,
    setConfig: (newConfig: Partial<OrbConfig>) => {
      setConfig(prev => ({ ...prev, ...newConfig }))
    },
  }), [sleep, idle, turbo, randomize, orbState])

  // Seed glow colors on mount — derive a triadic set from the orb's primary hue
  // so all 3 glow colors are always visually distinct (120° apart), boosted in saturation.
   
  useEffect(() => {
    const hexToHsl = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16) / 255
      const g = parseInt(hex.slice(3, 5), 16) / 255
      const b = parseInt(hex.slice(5, 7), 16) / 255
      const max = Math.max(r, g, b), min = Math.min(r, g, b)
      const l = (max + min) / 2
      let h = 0, s = 0
      if (max !== min) {
        const d = max - min
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
        switch (max) {
          case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
          case g: h = ((b - r) / d + 2) / 6; break
          case b: h = ((r - g) / d + 4) / 6; break
        }
      }
      return { h, s, l }
    }

    const hslToHexLocal = (h: number, s: number, l: number): string => {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1; if (t > 1) t -= 1
        if (t < 1/6) return p + (q - p) * 6 * t
        if (t < 1/2) return q
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
        return p
      }
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s
      const p = 2 * l - q
      const r = Math.round(hue2rgb(p, q, h + 1/3) * 255)
      const g = Math.round(hue2rgb(p, q, h) * 255)
      const b = Math.round(hue2rgb(p, q, h - 1/3) * 255)
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
    }

    const orb = baseConfig.orbPrimaryColor
    if (!orb) return

    const { h, s, l } = hexToHsl(orb)
    const boostedSat = Math.min(s + 0.5, 1)

    useOrbColorStore.getState().setColors({
      primaryColor: hslToHexLocal(h, boostedSat, l),
      secondaryColor: hslToHexLocal(((h + 1/3) % 1), boostedSat, l),
      tertiaryColor: hslToHexLocal(((h + 2/3) % 1), boostedSat, l),
    })
  }, [])

  // Pause/resume glow animation based on orb state.
  // Colors are seeded on mount above — no need to update here,
  // which avoids overwriting with intermediate lerp values during wake transitions.
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--glow-play-state',
      orbState === 'sleep' ? 'paused' : 'running',
    )
  }, [orbState])

  const updateConfig = useCallback(<K extends keyof OrbConfig>(key: K, value: OrbConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }, [])

  return (
    <div className={className}>
      <div className="relative">
        <TalosOrbDisplay config={config} />

        {showControls && (
          <div className="absolute left-4 top-4 max-h-[calc(100vh-12rem)] w-72 overflow-y-auto scrollbar-thumb-only rounded-lg border border-zinc-700/50 bg-zinc-900/95 backdrop-blur-sm">
            <button
              onClick={() => setShowParams(!showParams)}
              className="sticky top-0 z-10 flex w-full items-center justify-between bg-zinc-900/95 px-3 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-100"
            >
              Parameters
              {showParams ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>
            {showParams && (
              <div className="space-y-4 border-t border-zinc-700/50 px-3 py-3">
                <div className="space-y-2">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Colors</div>
                  <ColorPicker label="Orb Primary" value={config.orbPrimaryColor!} onChange={(v) => updateConfig('orbPrimaryColor', v)} />
                  <ColorPicker label="Orb Secondary" value={config.orbSecondaryColor!} onChange={(v) => updateConfig('orbSecondaryColor', v)} />
                  <ColorPicker label="Orb Tertiary" value={config.orbTertiaryColor!} onChange={(v) => updateConfig('orbTertiaryColor', v)} />
                  <ColorPicker label="Glow" value={config.glowColor!} onChange={(v) => updateConfig('glowColor', v)} />
                  <ColorPicker label="Ring Primary" value={config.ringPrimaryColor!} onChange={(v) => updateConfig('ringPrimaryColor', v)} />
                  <ColorPicker label="Ring Secondary" value={config.ringSecondaryColor!} onChange={(v) => updateConfig('ringSecondaryColor', v)} />
                  <ColorPicker label="Comet Primary" value={config.cometPrimaryColor!} onChange={(v) => updateConfig('cometPrimaryColor', v)} />
                  <ColorPicker label="Comet Secondary" value={config.cometSecondaryColor!} onChange={(v) => updateConfig('cometSecondaryColor', v)} />
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Animation</div>
                  <Slider label="Glow Pulse" value={config.glowPulseFrequency!} min={5} max={10} onChange={(v) => updateConfig('glowPulseFrequency', v)} />
                  <Slider label="Heartbeat" value={config.heartbeatFrequency!} min={6} max={10} onChange={(v) => updateConfig('heartbeatFrequency', v)} />
                  <Slider label="Speed" value={config.animationScale!} min={0.01} max={1} onChange={(v) => updateConfig('animationScale', v)} />
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Blobiness</div>
                  <Slider label="Amount" value={config.blobiness!} min={0} max={0.2} onChange={(v) => updateConfig('blobiness', v)} />
                  <Slider label="Speed" value={config.blobinessSpeed!} min={0.1} max={3} onChange={(v) => updateConfig('blobinessSpeed', v)} />
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Rings</div>
                  <Slider label="Count" value={config.ringCount!} min={1} max={6} step={1} onChange={(v) => updateConfig('ringCount', v)} />
                  <Slider label="Wobble" value={config.ringWobble!} min={0} max={1} onChange={(v) => updateConfig('ringWobble', v)} />
                  <Slider label="Spin Uniform" value={config.ringSpinUniformity!} min={0} max={1} onChange={(v) => updateConfig('ringSpinUniformity', v)} />
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Comets</div>
                  <Slider label="Count" value={config.cometCount!} min={1} max={5} step={1} onChange={(v) => updateConfig('cometCount', v)} />
                  <Slider label="Tail Length" value={config.cometTailLength!} min={0.4} max={1} onChange={(v) => updateConfig('cometTailLength', v)} />
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Other</div>
                  <Slider label="Sparkliness" value={config.sparkliness!} min={0.1} max={1} onChange={(v) => updateConfig('sparkliness', v)} />
                  <Slider label="Size" value={config.size!} min={100} max={500} step={10} onChange={(v) => updateConfig('size', v)} />
                </div>
              </div>
            )}
          </div>
        )}

        {showStateButtons && (
          <div className="absolute bottom-6 right-6 flex gap-2">
            <button
              onClick={sleep}
              disabled={orbState === 'sleep'}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium backdrop-blur-sm transition-colors ${
                orbState === 'sleep'
                  ? 'bg-zinc-600/80 text-zinc-400'
                  : 'bg-zinc-800/80 text-zinc-100 hover:bg-zinc-700/80'
              }`}
            >
              <Moon className="size-4" />
              Sleep
            </button>
            <button
              onClick={idle}
              disabled={orbState === 'idle'}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium backdrop-blur-sm transition-colors ${
                orbState === 'idle'
                  ? 'bg-zinc-600/80 text-zinc-400'
                  : 'bg-zinc-800/80 text-zinc-100 hover:bg-zinc-700/80'
              }`}
            >
              <Circle className="size-4" />
              Idle
            </button>
            <button
              onClick={turbo}
              disabled={orbState === 'turbo'}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium backdrop-blur-sm transition-colors ${
                orbState === 'turbo'
                  ? 'bg-cyan-600/80 text-cyan-100'
                  : 'bg-zinc-800/80 text-zinc-100 hover:bg-zinc-700/80'
              }`}
            >
              <Zap className="size-4" />
              Turbo
            </button>
            <button
              onClick={randomize}
              className="flex items-center gap-2 rounded-full bg-zinc-800/80 px-4 py-2 text-sm font-medium text-zinc-100 backdrop-blur-sm transition-colors hover:bg-zinc-700/80"
            >
              <Shuffle className="size-4" />
              Randomize
            </button>
          </div>
        )}
      </div>
    </div>
  )
})

TalosOrb.displayName = 'TalosOrb'

// Helper components
function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-zinc-500">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-5 w-8 cursor-pointer rounded border border-zinc-600 bg-transparent"
        />
        <span className="w-14 font-mono text-[10px] text-zinc-400">{value}</span>
      </div>
    </div>
  )
}

function Slider({ label, value, min, max, step = 0.01, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 text-zinc-500">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-zinc-700 accent-cyan-500 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-500"
      />
      <span className="w-10 text-right font-mono text-zinc-400">
        {Number.isInteger(step) ? value : value.toFixed(2)}
      </span>
    </div>
  )
}

export default TalosOrb
