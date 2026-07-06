// Track how a work session's time splits across projects.
// Segments anchor to the timer's *remaining* ms, so paused time never counts.

export function beginSession(durationMs) {
  return { segments: [], anchorMs: durationMs };
}

export function switchSegment(sess, { project, task, remainingMs }) {
  const elapsed = sess.anchorMs - remainingMs;
  if (elapsed <= 0) return sess;
  return {
    segments: [...sess.segments, { project, task, ms: elapsed }],
    anchorMs: remainingMs,
  };
}

export function closeSession(sess, { project, task, totalMin }) {
  const { segments } = switchSegment(sess, { project, task, remainingMs: 0 });
  if (segments.length === 0) return [];
  const mins = segments.map((s) => Math.round(s.ms / 60000));
  const sum = mins.reduce((a, b) => a + b, 0);
  const last = mins.length - 1;
  // ponytail: last segment absorbs rounding drift so the total equals workMin
  mins[last] = Math.max(0, mins[last] + (totalMin - sum));
  return segments
    .map((s, i) => ({ project: s.project, task: s.task, minutes: mins[i] }))
    .filter((s) => s.minutes > 0);
}
