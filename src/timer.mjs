export const PHASES = { WORK: 'work', SHORT: 'short', LONG: 'long' };
export const LONG_BREAK_EVERY = 4;

export function durationMsFor(phase, settings) {
  if (phase === PHASES.WORK) return settings.workMin * 60000;
  if (phase === PHASES.SHORT) return settings.shortMin * 60000;
  return settings.longMin * 60000;
}

export function initState(settings) {
  return {
    phase: PHASES.WORK,
    completedWork: 0,
    running: false,
    remainingMs: durationMsFor(PHASES.WORK, settings),
    targetEndMs: null,
  };
}

function transition(phase, completedWork, settings) {
  return {
    phase,
    completedWork,
    running: false,
    remainingMs: durationMsFor(phase, settings),
    targetEndMs: null,
  };
}

export function complete(state, settings) {
  let { phase, completedWork } = state;
  if (phase === PHASES.WORK) {
    completedWork += 1;
    const next = completedWork % LONG_BREAK_EVERY === 0 ? PHASES.LONG : PHASES.SHORT;
    return transition(next, completedWork, settings);
  }
  if (phase === PHASES.LONG) {
    return transition(PHASES.WORK, 0, settings);
  }
  return transition(PHASES.WORK, completedWork, settings);
}

export function skip(state, settings) {
  const { phase, completedWork } = state;
  if (phase === PHASES.LONG) return transition(PHASES.WORK, 0, settings);
  if (phase === PHASES.WORK) return transition(PHASES.SHORT, completedWork, settings);
  return transition(PHASES.WORK, completedWork, settings);
}

export function reset(state, settings) {
  return initState(settings);
}
