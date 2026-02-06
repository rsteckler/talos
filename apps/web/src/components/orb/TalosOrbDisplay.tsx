import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

export interface OrbConfig {
  // Orb colors
  orbPrimaryColor: string
  orbSecondaryColor: string
  orbTertiaryColor: string
  glowColor: string

  // Ring colors
  ringPrimaryColor: string
  ringSecondaryColor: string

  // Surface comet colors
  cometPrimaryColor: string
  cometSecondaryColor: string

  // Animation timing (in seconds)
  glowPulseFrequency: number
  heartbeatFrequency: number
  animationScale: number

  // Blobiness
  blobiness: number // 0-1 how much the shape deforms
  blobinessSpeed: number // speed of blob deformation

  // Ring parameters
  ringCount: number // number of rings (0-10)
  ringWobble: number // tilt oscillation amount (0-1)
  ringSpinUniformity: number // likelihood rings spin same direction (0-1, 1=all same, 0=alternating)

  // Surface comets
  cometCount: number // number of comets orbiting on surface (0-10)
  cometTailLength: number // length of comet tail (0-1)

  // Sparkles
  sparkliness: number // 0-1

  // Size
  size: number
}

const defaultConfig: OrbConfig = {
  orbPrimaryColor: "#00ffff",
  orbSecondaryColor: "#ff00ff",
  orbTertiaryColor: "#ffff00",
  glowColor: "#00ffff",
  ringPrimaryColor: "#ff00ff",
  ringSecondaryColor: "#00ff88",
  cometPrimaryColor: "#ffffff",
  cometSecondaryColor: "#00ffff",
  glowPulseFrequency: 2,
  heartbeatFrequency: 4,
  animationScale: 1,
  blobiness: 0.5,
  blobinessSpeed: 1,
  ringCount: 5,
  ringWobble: 0.3,
  ringSpinUniformity: 0.5,
  cometCount: 6,
  cometTailLength: 1.0,
  sparkliness: 0.7,
  size: 300,
}

interface Props {
  config?: Partial<OrbConfig>
  className?: string
}

// Simple noise function for organic movement
function noise(x: number, y: number, t: number): number {
  const n1 = Math.sin(x * 1.2 + t * 0.7) * Math.cos(y * 0.9 + t * 0.5)
  const n2 = Math.sin(x * 2.1 - t * 0.4) * Math.sin(y * 1.8 + t * 0.6)
  const n3 = Math.cos(x * 0.8 + y * 1.1 + t * 0.3)
  return (n1 + n2 + n3) / 3
}

type Comet = {
  orbitTilt: number
  orbitRotation: number
  startAngle: number
  speed: number
  size: number
}

type Sparkle = {
  theta: number
  phi: number
  twinkleOffset: number
  size: number
}

function generateComet(): Comet {
  return {
    orbitTilt: Math.random() * Math.PI,
    orbitRotation: Math.random() * Math.PI * 2,
    startAngle: Math.random() * Math.PI * 2,
    speed: (0.2 + Math.random() * 0.3) * (Math.random() > 0.5 ? 1 : -1),
    size: 6 + Math.random() * 10,
  }
}

function generateSparkle(): Sparkle {
  return {
    theta: Math.random() * Math.PI * 2,
    phi: Math.acos(2 * Math.random() - 1),
    twinkleOffset: Math.random() * Math.PI * 2,
    size: 0.5 + Math.random() * 2,
  }
}

export function TalosOrbDisplay({ config: configOverrides, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const timeRef = useRef(0)
  const cometsRef = useRef<Comet[]>([])
  const sparklesRef = useRef<Sparkle[]>([])
  const prevCometCountRef = useRef(0)
  const prevSparklinessRef = useRef(0)

  const config = { ...defaultConfig, ...configOverrides }

  // Update comets only when count changes
  const cometCount = Math.floor(config.cometCount)
  if (cometCount !== prevCometCountRef.current) {
    const currentComets = cometsRef.current
    if (cometCount > currentComets.length) {
      // Add new comets
      for (let i = currentComets.length; i < cometCount; i++) {
        currentComets.push(generateComet())
      }
    } else if (cometCount < currentComets.length) {
      // Remove excess comets
      currentComets.length = cometCount
    }
    prevCometCountRef.current = cometCount
  }

  // Update sparkles only when sparkliness changes significantly
  const sparkleCount = Math.floor(config.sparkliness * 80)
  if (sparkleCount !== prevSparklinessRef.current) {
    const currentSparkles = sparklesRef.current
    if (sparkleCount > currentSparkles.length) {
      for (let i = currentSparkles.length; i < sparkleCount; i++) {
        currentSparkles.push(generateSparkle())
      }
    } else if (sparkleCount < currentSparkles.length) {
      currentSparkles.length = sparkleCount
    }
    prevSparklinessRef.current = sparkleCount
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const orbSize = config.size
    const canvasSize = orbSize * 2.5
    canvas.width = canvasSize * dpr
    canvas.height = canvasSize * dpr
    canvas.style.width = `${canvasSize}px`
    canvas.style.height = `${canvasSize}px`
    ctx.scale(dpr, dpr)

    const canvasCenter = canvasSize / 2

    let animationId: number

    const parseColor = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      return { r, g, b }
    }

    const orbPrimary = parseColor(config.orbPrimaryColor)
    const orbSecondary = parseColor(config.orbSecondaryColor)
    const orbTertiary = parseColor(config.orbTertiaryColor)
    const glowCol = parseColor(config.glowColor)
    const ringPrimary = parseColor(config.ringPrimaryColor)
    const ringSecondary = parseColor(config.ringSecondaryColor)
    const cometPrimary = parseColor(config.cometPrimaryColor)
    const cometSecondary = parseColor(config.cometSecondaryColor)

    const comets = cometsRef.current
    const sparkles = sparklesRef.current

    // Get blob radius at a given angle
    const getBlobRadius = (angle: number, baseRadius: number, t: number): number => {
      const blobT = t * config.blobinessSpeed
      const blobAmount = config.blobiness * 0.25
      const deform1 = Math.sin(angle * 3 + blobT * 0.8) * blobAmount
      const deform2 = Math.sin(angle * 5 - blobT * 0.5) * blobAmount * 0.5
      const deform3 = Math.sin(angle * 2 + blobT * 1.2) * blobAmount * 0.7
      const deform4 = noise(Math.cos(angle) * 2, Math.sin(angle) * 2, blobT * 0.5) * blobAmount * 0.4
      return baseRadius * (1 + deform1 + deform2 + deform3 + deform4)
    }

    // Draw soft blob shape
    const drawBlob = (
      cx: number,
      cy: number,
      baseRadius: number,
      t: number,
      fillStyle: CanvasGradient | string
    ) => {
      ctx.beginPath()
      const steps = 64
      for (let i = 0; i <= steps; i++) {
        const angle = (i / steps) * Math.PI * 2
        const r = getBlobRadius(angle, baseRadius, t)
        const x = cx + Math.cos(angle) * r
        const y = cy + Math.sin(angle) * r
        if (i === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      }
      ctx.closePath()
      ctx.fillStyle = fillStyle
      ctx.fill()
    }

    // Draw a surface comet with head and tail
    const drawComet = (
      centerX: number,
      centerY: number,
      baseRadius: number,
      comet: typeof comets[0],
      t: number
    ) => {
      // Calculate position on tilted orbit
      const orbitAngle = comet.startAngle + t * comet.speed

      // Start with position on equatorial circle
      let x3d = Math.cos(orbitAngle)
      let y3d = 0
      let z3d = Math.sin(orbitAngle)

      // Rotate by orbit tilt (around X axis)
      const tiltCos = Math.cos(comet.orbitTilt)
      const tiltSin = Math.sin(comet.orbitTilt)
      const y3dTilted = y3d * tiltCos - z3d * tiltSin
      const z3dTilted = y3d * tiltSin + z3d * tiltCos
      y3d = y3dTilted
      z3d = z3dTilted

      // Rotate by orbit rotation (around Y axis)
      const rotCos = Math.cos(comet.orbitRotation)
      const rotSin = Math.sin(comet.orbitRotation)
      const x3dRot = x3d * rotCos + z3d * rotSin
      const z3dRot = -x3d * rotSin + z3d * rotCos
      x3d = x3dRot
      z3d = z3dRot

      // Depth factor for head: visible on all sides since orb is transparent
      const headDepthFactor = 0.4 + (z3d * 0.5 + 0.5) * 0.6

      // Get surface position accounting for blob deformation
      const surfaceAngle = Math.atan2(y3d, x3d)
      const surfaceRadius = getBlobRadius(surfaceAngle, baseRadius, t) * 0.95

      const headX = centerX + x3d * surfaceRadius
      const headY = centerY + y3d * surfaceRadius

      // Draw tail (trail of fading segments)
      // tailLength of 1.0 = 2/3 circumference (about 4.2 radians)
      const tailLengthRadians = config.cometTailLength * Math.PI * (4 / 3)
      const tailSegments = Math.floor(60 * config.cometTailLength) + 10
      // Direction of tail is opposite to movement direction
      const tailDirection = comet.speed > 0 ? -1 : 1

      for (let i = tailSegments; i >= 0; i--) {
        const tailT = i / tailSegments
        const tailOrbitAngle = orbitAngle + tailDirection * tailLengthRadians * tailT

        // Calculate tail segment position using same orbital transforms
        let tailX3d = Math.cos(tailOrbitAngle)
        let tailY3d = 0
        let tailZ3d = Math.sin(tailOrbitAngle)

        // Apply orbit tilt
        const tailY3dTilted = tailY3d * tiltCos - tailZ3d * tiltSin
        const tailZ3dTilted = tailY3d * tiltSin + tailZ3d * tiltCos
        tailY3d = tailY3dTilted
        tailZ3d = tailZ3dTilted

        // Apply orbit rotation
        const tailX3dRot = tailX3d * rotCos + tailZ3d * rotSin
        const tailZ3dRot = -tailX3d * rotSin + tailZ3d * rotCos
        tailX3d = tailX3dRot
        tailZ3d = tailZ3dRot

        const tailSurfaceAngle = Math.atan2(tailY3d, tailX3d)
        const tailSurfaceRadius = getBlobRadius(tailSurfaceAngle, baseRadius, t) * 0.95

        const tailX = centerX + tailX3d * tailSurfaceRadius
        const tailY = centerY + tailY3d * tailSurfaceRadius

        // Depth factor: front (z=1) is bright, back (z=-1) is dimmer but still visible
        const depthFactor = 0.4 + (tailZ3d * 0.5 + 0.5) * 0.6

        // Fade out along tail length, modulated by depth
        const segmentAlpha = (1 - tailT) * 0.5 * depthFactor
        const segmentSize = comet.size * (1 - tailT * 0.6) * (0.7 + depthFactor * 0.3)

        // Interpolate color from primary to secondary along tail
        const r = Math.floor(cometPrimary.r + (cometSecondary.r - cometPrimary.r) * tailT)
        const g = Math.floor(cometPrimary.g + (cometSecondary.g - cometPrimary.g) * tailT)
        const b = Math.floor(cometPrimary.b + (cometSecondary.b - cometPrimary.b) * tailT)

        const gradient = ctx.createRadialGradient(tailX, tailY, 0, tailX, tailY, segmentSize)
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${segmentAlpha})`)
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)

        ctx.beginPath()
        ctx.fillStyle = gradient
        ctx.arc(tailX, tailY, segmentSize, 0, Math.PI * 2)
        ctx.fill()
      }

      // Draw bright head
      const headAlpha = 0.8 * headDepthFactor
      const headSize = comet.size * 1.2 * (0.7 + headDepthFactor * 0.3)

      // Outer glow
      const outerGlow = ctx.createRadialGradient(headX, headY, 0, headX, headY, headSize * 2)
      outerGlow.addColorStop(0, `rgba(${cometPrimary.r}, ${cometPrimary.g}, ${cometPrimary.b}, ${headAlpha * 0.5})`)
      outerGlow.addColorStop(0.5, `rgba(${cometSecondary.r}, ${cometSecondary.g}, ${cometSecondary.b}, ${headAlpha * 0.2})`)
      outerGlow.addColorStop(1, "rgba(0, 0, 0, 0)")

      ctx.beginPath()
      ctx.fillStyle = outerGlow
      ctx.arc(headX, headY, headSize * 2, 0, Math.PI * 2)
      ctx.fill()

      // Bright core
      const coreGlow = ctx.createRadialGradient(headX, headY, 0, headX, headY, headSize * 0.6)
      coreGlow.addColorStop(0, `rgba(255, 255, 255, ${headAlpha})`)
      coreGlow.addColorStop(0.5, `rgba(${cometPrimary.r}, ${cometPrimary.g}, ${cometPrimary.b}, ${headAlpha * 0.8})`)
      coreGlow.addColorStop(1, `rgba(${cometPrimary.r}, ${cometPrimary.g}, ${cometPrimary.b}, 0)`)

      ctx.beginPath()
      ctx.fillStyle = coreGlow
      ctx.arc(headX, headY, headSize * 0.6, 0, Math.PI * 2)
      ctx.fill()
    }

    // Draw soft ring arc - particles orbit along the ring path
    const drawRingArc = (
      ringRadius: number,
      tiltFactor: number,
      rotation: number,
      drawBack: boolean, // true = back half (behind orb), false = front half
      color: string,
      lineWidth: number,
      t: number
    ) => {
      ctx.save()
      ctx.translate(canvasCenter, canvasCenter)
      ctx.beginPath()
      ctx.strokeStyle = color
      ctx.lineWidth = lineWidth
      ctx.lineCap = "round"

      const steps = 64
      let started = false
      for (let s = 0; s <= steps; s++) {
        // Angle along the ring, offset by rotation to create orbiting motion
        const baseAngle = (s / steps) * Math.PI * 2
        const angle = baseAngle + rotation

        // Calculate 3D position - ring lies in XZ plane, viewed with tilt
        // X = cos(angle), Z = sin(angle), Y = 0 (ring is flat)
        // After perspective: px = X, py = Z * tiltFactor
        const wobbleOffset = noise(Math.cos(baseAngle) * 3, Math.sin(baseAngle) * 3, t * config.blobinessSpeed) * config.blobiness * 8
        const px = Math.cos(angle) * (ringRadius + wobbleOffset)
        const zPos = Math.sin(angle) // z position determines front/back
        const py = zPos * (ringRadius + wobbleOffset) * tiltFactor

        // Only draw if in correct half (back or front)
        const isBack = zPos < 0
        if (isBack !== drawBack) {
          started = false
          continue
        }

        if (!started) {
          ctx.moveTo(px, py)
          started = true
        } else {
          ctx.lineTo(px, py)
        }
      }
      ctx.stroke()
      ctx.restore()
    }

    // Draw ring particles - orbit along the ring path
    const drawRingParticles = (
      ringRadius: number,
      tiltFactor: number,
      rotation: number,
      drawBack: boolean,
      particleCount: number,
      ringIndex: number,
      t: number
    ) => {
      ctx.save()
      ctx.translate(canvasCenter, canvasCenter)

      for (let j = 0; j < particleCount; j++) {
        const baseAngle = (j / particleCount) * Math.PI * 2
        const angle = baseAngle + rotation

        const zPos = Math.sin(angle)
        const isBack = zPos < 0
        if (isBack !== drawBack) continue

        const wobbleOffset = noise(Math.cos(baseAngle) * 3, Math.sin(baseAngle) * 3, t * config.blobinessSpeed) * config.blobiness * 8
        const px = Math.cos(angle) * (ringRadius + wobbleOffset)
        const py = zPos * (ringRadius + wobbleOffset) * tiltFactor

        // Depth-based alpha - dimmer when further back
        const depthAlpha = 0.5 + zPos * 0.5
        const particleAlpha = (0.3 + 0.4 * Math.sin(t * 2.5 + j + ringIndex)) * depthAlpha

        const gradient = ctx.createRadialGradient(px, py, 0, px, py, 5)
        gradient.addColorStop(0, `rgba(${ringPrimary.r}, ${ringPrimary.g}, ${ringPrimary.b}, ${particleAlpha})`)
        gradient.addColorStop(1, `rgba(${ringPrimary.r}, ${ringPrimary.g}, ${ringPrimary.b}, 0)`)

        ctx.beginPath()
        ctx.fillStyle = gradient
        ctx.arc(px, py, 5, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }

    const render = () => {
      timeRef.current += 0.016 * config.animationScale
      const time = timeRef.current

      const centerX = canvasCenter
      const centerY = canvasCenter
      const radius = orbSize * 0.32

      ctx.clearRect(0, 0, canvasSize, canvasSize)

      // Heartbeat scale
      const heartbeat = 1 + 0.05 * Math.sin(time * Math.PI * 2 / config.heartbeatFrequency)
      const effectiveRadius = radius * heartbeat

      // Glow pulse
      const glowIntensity = 0.5 + 0.5 * Math.sin(time * Math.PI * 2 / config.glowPulseFrequency)

      // === OUTER GLOW LAYERS ===
      for (let layer = 4; layer >= 0; layer--) {
        const layerRadius = effectiveRadius * (1.8 + layer * 0.4)
        const layerAlpha = 0.03 * glowIntensity * (1 - layer * 0.15)
        const glowGradient = ctx.createRadialGradient(
          centerX, centerY, effectiveRadius * 0.3,
          centerX, centerY, layerRadius
        )
        glowGradient.addColorStop(0, `rgba(${glowCol.r}, ${glowCol.g}, ${glowCol.b}, ${layerAlpha * 2})`)
        glowGradient.addColorStop(0.5, `rgba(${glowCol.r}, ${glowCol.g}, ${glowCol.b}, ${layerAlpha})`)
        glowGradient.addColorStop(1, "rgba(0, 0, 0, 0)")

        drawBlob(centerX, centerY, layerRadius, time + layer * 0.5, glowGradient)
      }

      // === BACK HALF OF RINGS ===
      const ringTotal = Math.floor(config.ringCount)
      const getRingDirection = (index: number): number => {
        if (config.ringSpinUniformity >= 1) return 1
        if (config.ringSpinUniformity <= 0) return index % 2 === 0 ? 1 : -1
        const pseudoRandom = Math.sin(index * 12.9898) * 0.5 + 0.5
        return pseudoRandom < config.ringSpinUniformity ? 1 : -1
      }

      for (let i = 0; i < ringTotal; i++) {
        const ringRadius = effectiveRadius * (1.5 + i * 0.2)
        const wobble = Math.sin(time * 0.4 + i) * config.ringWobble * 0.15
        const tiltFactor = 0.35 + wobble
        const spinDirection = getRingDirection(i)
        const rotation = time * 0.5 * spinDirection // faster rotation for visible orbiting

        // Draw back half of ring (behind orb)
        drawRingArc(ringRadius, tiltFactor, rotation, true,
          `rgba(${ringSecondary.r}, ${ringSecondary.g}, ${ringSecondary.b}, ${0.08 + 0.04 * Math.sin(time + i)})`, 12, time)
        drawRingArc(ringRadius, tiltFactor, rotation, true,
          `rgba(${ringPrimary.r}, ${ringPrimary.g}, ${ringPrimary.b}, ${0.15 + 0.1 * Math.sin(time * 2 + i)})`, 3, time)
        drawRingParticles(ringRadius, tiltFactor, rotation, true, 25 + i * 6, i, time)
      }

      // === MAIN BLOB BODY ===
      const outerGlow = ctx.createRadialGradient(
        centerX, centerY, effectiveRadius * 0.5,
        centerX, centerY, effectiveRadius * 1.3
      )
      outerGlow.addColorStop(0, `rgba(${orbPrimary.r}, ${orbPrimary.g}, ${orbPrimary.b}, 0.15)`)
      outerGlow.addColorStop(0.6, `rgba(${orbSecondary.r}, ${orbSecondary.g}, ${orbSecondary.b}, 0.08)`)
      outerGlow.addColorStop(1, "rgba(0, 0, 0, 0)")
      drawBlob(centerX, centerY, effectiveRadius * 1.2, time, outerGlow)

      const midGlow = ctx.createRadialGradient(
        centerX - effectiveRadius * 0.2, centerY - effectiveRadius * 0.2, 0,
        centerX, centerY, effectiveRadius
      )
      midGlow.addColorStop(0, `rgba(${orbPrimary.r}, ${orbPrimary.g}, ${orbPrimary.b}, 0.2)`)
      midGlow.addColorStop(0.4, `rgba(${orbSecondary.r}, ${orbSecondary.g}, ${orbSecondary.b}, 0.12)`)
      midGlow.addColorStop(0.7, `rgba(${orbTertiary.r}, ${orbTertiary.g}, ${orbTertiary.b}, 0.15)`)
      midGlow.addColorStop(1, `rgba(${orbPrimary.r}, ${orbPrimary.g}, ${orbPrimary.b}, 0.08)`)
      drawBlob(centerX, centerY, effectiveRadius, time, midGlow)

      // Inner bright core
      const coreGlow = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, effectiveRadius * 0.6
      )
      const coreIntensity = 0.4 + 0.25 * Math.sin(time * Math.PI * 2 / config.heartbeatFrequency)
      coreGlow.addColorStop(0, `rgba(255, 255, 255, ${coreIntensity})`)
      coreGlow.addColorStop(0.3, `rgba(${orbPrimary.r}, ${orbPrimary.g}, ${orbPrimary.b}, ${coreIntensity * 0.6})`)
      coreGlow.addColorStop(0.6, `rgba(${orbSecondary.r}, ${orbSecondary.g}, ${orbSecondary.b}, ${coreIntensity * 0.3})`)
      coreGlow.addColorStop(1, "rgba(0, 0, 0, 0)")
      drawBlob(centerX, centerY, effectiveRadius * 0.5, time * 1.3, coreGlow)

      // === SURFACE COMETS ===
      comets.forEach((comet) => {
        drawComet(centerX, centerY, effectiveRadius, comet, time)
      })

      // Floating internal wisps
      for (let w = 0; w < 5; w++) {
        const wispAngle = time * 0.3 + w * Math.PI * 0.4
        const wispDist = effectiveRadius * (0.2 + 0.3 * Math.sin(time * 0.5 + w))
        const wispX = centerX + Math.cos(wispAngle) * wispDist
        const wispY = centerY + Math.sin(wispAngle) * wispDist
        const wispRadius = effectiveRadius * (0.15 + 0.1 * Math.sin(time + w))
        const wispAlpha = 0.1 + 0.1 * Math.sin(time * 2 + w)

        const wispGrad = ctx.createRadialGradient(wispX, wispY, 0, wispX, wispY, wispRadius)
        const col = w % 3 === 0 ? orbPrimary : w % 3 === 1 ? orbSecondary : orbTertiary
        wispGrad.addColorStop(0, `rgba(${col.r}, ${col.g}, ${col.b}, ${wispAlpha})`)
        wispGrad.addColorStop(1, "rgba(0, 0, 0, 0)")

        ctx.beginPath()
        ctx.arc(wispX, wispY, wispRadius, 0, Math.PI * 2)
        ctx.fillStyle = wispGrad
        ctx.fill()
      }

      // Sparkles
      sparkles.forEach((sparkle) => {
        const twinkle = Math.sin(time * 4 + sparkle.twinkleOffset)
        if (twinkle > 0.1) {
          const x3d = Math.sin(sparkle.phi) * Math.cos(sparkle.theta + time * 0.2)
          const y3d = Math.cos(sparkle.phi)
          const z3d = Math.sin(sparkle.phi) * Math.sin(sparkle.theta + time * 0.2)

          if (z3d > 0) {
            const surfaceAngle = Math.atan2(y3d, x3d)
            const surfaceRadius = getBlobRadius(surfaceAngle, effectiveRadius * 0.9, time)
            const x = centerX + x3d * surfaceRadius
            const y = centerY + y3d * surfaceRadius
            const alpha = twinkle * z3d * config.sparkliness * 0.6

            const gradient = ctx.createRadialGradient(x, y, 0, x, y, sparkle.size * 5)
            gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`)
            gradient.addColorStop(0.4, `rgba(${glowCol.r}, ${glowCol.g}, ${glowCol.b}, ${alpha * 0.4})`)
            gradient.addColorStop(1, "rgba(255, 255, 255, 0)")

            ctx.beginPath()
            ctx.fillStyle = gradient
            ctx.arc(x, y, sparkle.size * 5, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      })

      // Soft edge highlight
      ctx.beginPath()
      ctx.strokeStyle = `rgba(${orbPrimary.r}, ${orbPrimary.g}, ${orbPrimary.b}, ${0.12 + 0.08 * glowIntensity})`
      ctx.lineWidth = 4
      ctx.shadowColor = `rgba(${orbPrimary.r}, ${orbPrimary.g}, ${orbPrimary.b}, 0.4)`
      ctx.shadowBlur = 20
      const steps = 64
      for (let i = 0; i <= steps; i++) {
        const angle = (i / steps) * Math.PI * 2
        const r = getBlobRadius(angle, effectiveRadius, time)
        const x = centerX + Math.cos(angle) * r
        const y = centerY + Math.sin(angle) * r
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.stroke()
      ctx.shadowBlur = 0

      // === FRONT HALF OF RINGS ===
      for (let i = 0; i < ringTotal; i++) {
        const ringRadius = effectiveRadius * (1.5 + i * 0.2)
        const wobble = Math.sin(time * 0.4 + i) * config.ringWobble * 0.15
        const tiltFactor = 0.35 + wobble
        const spinDirection = getRingDirection(i)
        const rotation = time * 0.5 * spinDirection

        // Draw front half of ring (in front of orb)
        drawRingArc(ringRadius, tiltFactor, rotation, false,
          `rgba(${ringSecondary.r}, ${ringSecondary.g}, ${ringSecondary.b}, ${0.1 + 0.05 * Math.sin(time + i)})`, 12, time)
        drawRingArc(ringRadius, tiltFactor, rotation, false,
          `rgba(${ringPrimary.r}, ${ringPrimary.g}, ${ringPrimary.b}, ${0.2 + 0.12 * Math.sin(time * 2 + i)})`, 3, time)
        drawRingParticles(ringRadius, tiltFactor, rotation, false, 25 + i * 6, i, time)
      }

      animationId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationId)
    }
  }, [config])

  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      <canvas
        ref={canvasRef}
        style={{
          filter: `blur(0.5px) drop-shadow(0 0 40px ${config.glowColor}40) drop-shadow(0 0 80px ${config.glowColor}25)`,
        }}
      />
    </div>
  )
}
