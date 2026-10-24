let audioCtx: AudioContext | null = null;
let lastPlayedAt = 0;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioCtx) {
    try {
      audioCtx = new AudioCtx();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Plays a short, pleasant notification chime for new chat messages.
 * Debounced to at most once per 600ms to avoid overlapping sound bursts.
 */
export function playNotificationSound(): void {
  const nowMs = Date.now();
  if (nowMs - lastPlayedAt < 600) return;
  lastPlayedAt = nowMs;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Gentle modern two-tone chime: 659 Hz (E5) -> 880 Hz (A5)
    osc.type = "sine";
    osc.frequency.setValueAtTime(659, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.07);

    // Soft attack, smooth exponential decay
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.16);
  } catch {
    // Ignore audio autoplay / initialization errors
  }
}
