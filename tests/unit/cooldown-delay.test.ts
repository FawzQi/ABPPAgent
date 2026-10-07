import { describe, it, expect } from 'vitest'
import { computeCooldownDuration } from '../../src/main/services/agent/orchestrator'
import { DEFAULT_AGENT_DELAYS_CONFIG } from '../../src/shared/types'

describe('Cooldown Random Delay Calculation', () => {
  it('has default random delay ranges in DEFAULT_AGENT_DELAYS_CONFIG', () => {
    expect(DEFAULT_AGENT_DELAYS_CONFIG.cooldownRandomDelayMinMs).toBe(0)
    expect(DEFAULT_AGENT_DELAYS_CONFIG.cooldownRandomDelayMaxMs).toBe(1000)
    expect(DEFAULT_AGENT_DELAYS_CONFIG.sendRandomDelayMinMs).toBe(50)
    expect(DEFAULT_AGENT_DELAYS_CONFIG.sendRandomDelayMaxMs).toBe(150)
  })

  it('returns exact base cooldown when min and max random delays are 0', () => {
    const duration = computeCooldownDuration(3000, 0, 0)
    expect(duration).toBe(3000)
  })

  it('adds fixed delay when min equals max', () => {
    const duration = computeCooldownDuration(3000, 500, 500)
    expect(duration).toBe(3500)
  })

  it('generates values within the specified random delay range', () => {
    const base = 2000
    const min = 200
    const max = 800

    for (let i = 0; i < 50; i++) {
      const val = computeCooldownDuration(base, min, max)
      expect(val).toBeGreaterThanOrEqual(base + min)
      expect(val).toBeLessThanOrEqual(base + max)
    }
  })

  it('handles inverted min and max by clamping max to at least min', () => {
    // If min is 800 and max is 200, max is clamped to min (800)
    const val = computeCooldownDuration(2000, 800, 200)
    expect(val).toBe(2800)
  })

  it('handles negative inputs gracefully', () => {
    const val = computeCooldownDuration(2000, -100, -50)
    expect(val).toBe(2000)
  })
})
