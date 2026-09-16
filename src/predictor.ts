export interface PredictorInput {
  occupants: number
  temperatureC: number
  currentStock: number
  baseRatePerPerson: number
  blizzard: boolean
  criticalThreshold: number
}

export interface PredictionPoint {
  day: number
  stock: number
}

export function calculatePrediction(input: PredictorInput) {
  const baseDailyBurn = input.baseRatePerPerson * input.occupants
  const temperatureFactor = 1 + Math.max(0, -20 - input.temperatureC) * 0.015
  const blizzardFactor = input.blizzard ? 1.25 : 1
  const effectiveDailyBurn = baseDailyBurn * temperatureFactor * blizzardFactor
  const daysRemaining = effectiveDailyBurn > 0 ? input.currentStock / effectiveDailyBurn : Infinity

  const horizon = Math.min(180, Math.max(1, Math.ceil(daysRemaining)))
  const trajectory: PredictionPoint[] = []
  for (let day = 0; day <= horizon; day += Math.max(1, Math.ceil(horizon / 30))) {
    trajectory.push({
      day,
      stock: Math.max(0, input.currentStock - effectiveDailyBurn * day)
    })
  }
  if (trajectory.at(-1)?.day !== horizon) {
    trajectory.push({ day: horizon, stock: Math.max(0, input.currentStock - effectiveDailyBurn * horizon) })
  }

  return {
    baseDailyBurn,
    temperatureFactor,
    blizzardFactor,
    effectiveDailyBurn,
    daysRemaining,
    status:
      daysRemaining < 15 ? 'CRITICAL' : daysRemaining < 45 ? 'WARNING' : 'NORMAL',
    trajectory,
    criticalLine: trajectory.map((point) => ({ day: point.day, stock: input.criticalThreshold }))
  } as const
}
