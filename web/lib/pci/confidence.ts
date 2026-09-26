// Confidence calibration (§4.7). Categorical labels only; never a number.
import { CONFIDENCE_LEVELS, type Confidence } from './canon.ts'

/**
 * @param support  independent supporting observations
 * @param counter  independent disconfirming observations
 */
export function calibrate(support: number, counter = 0): Confidence {
  if (support <= 0) return 'Insufficient Evidence'
  if (counter > 0 && counter >= support) return 'Undetermined'
  if (support >= 5 && counter === 0) return 'High Support'
  if (support >= 3) return 'Moderate Support'
  return 'Limited Support'
}

/** Step confidence down one level (used by the integrity audit). */
export function downgrade(c: Confidence): Confidence {
  const order: Confidence[] = ['High Support', 'Moderate Support', 'Limited Support', 'Insufficient Evidence']
  const i = order.indexOf(c)
  if (i === -1) return c
  return order[Math.min(i + 1, order.length - 1)]
}

export function isConfidence(x: string): x is Confidence {
  return (CONFIDENCE_LEVELS as readonly string[]).includes(x)
}
