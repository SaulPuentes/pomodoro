export function playBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    // Ascending 3-note chime, repeated twice — longer and louder than a single blip.
    const notes = [660, 880, 1175, 0, 660, 880, 1175];
    const noteDur = 0.2;
    const peak = 0.5;
    notes.forEach((freq, i) => {
      if (!freq) return; // rest
      const t = ctx.currentTime + i * noteDur;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(peak, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + noteDur);
      osc.start(t);
      osc.stop(t + noteDur);
    });
    const total = notes.length * noteDur;
    setTimeout(() => ctx.close(), (total + 0.1) * 1000);
  } catch {
    /* audio unavailable — ignore */
  }
}
