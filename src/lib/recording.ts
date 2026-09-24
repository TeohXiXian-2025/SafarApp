// Turns a screen recording (of a reel, TikTok or Xiaohongshu note) into what
// the AI can read — entirely in the browser, so nothing large is uploaded:
//   • key frames: one every ~1.2 s, keeping only frames that visibly change
//   • audio: 16 kHz mono WAV for speech-to-text (place names said aloud)

const MAX_DIM = 1280;

function waitFor(el: HTMLMediaElement, event: string, timeoutMs = 8000) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`video ${event} timed out`)), timeoutMs);
    el.addEventListener(event, () => (clearTimeout(t), resolve()), { once: true });
  });
}

/** Tiny grayscale fingerprint used to skip near-identical frames. */
function fingerprint(ctx: CanvasRenderingContext2D, w: number, h: number): Uint8Array {
  const small = document.createElement('canvas');
  small.width = 24;
  small.height = 24;
  const sctx = small.getContext('2d')!;
  sctx.drawImage(ctx.canvas, 0, 0, w, h, 0, 0, 24, 24);
  const px = sctx.getImageData(0, 0, 24, 24).data;
  const out = new Uint8Array(24 * 24);
  for (let i = 0; i < out.length; i++) out[i] = (px[i * 4] * 3 + px[i * 4 + 1] * 6 + px[i * 4 + 2]) / 10;
  return out;
}
const difference = (a: Uint8Array, b: Uint8Array) => a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0) / a.length;

export async function extractFrames(
  file: Blob,
  opts: { maxFrames?: number; everySec?: number; onProgress?: (fraction: number) => void } = {},
): Promise<Blob[]> {
  const { maxFrames = 8, everySec = 1.2 } = opts;
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await waitFor(video, 'loadeddata');
    let duration = video.duration;
    // Recordings made with MediaRecorder (Chrome, some Android recorders) often
    // don't store their length — seek far past the end to make the browser find it.
    if (!Number.isFinite(duration)) {
      video.currentTime = 1e7;
      await waitFor(video, 'seeked').catch(() => {});
      duration = video.duration;
      video.currentTime = 0;
      await waitFor(video, 'seeked').catch(() => {});
    }
    duration = Number.isFinite(duration) ? duration : 0;
    if (!duration || !video.videoWidth) throw new Error("Couldn't read that video. Try a shorter screen recording (MP4 or MOV).");

    const scale = Math.min(1, MAX_DIM / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    const times: number[] = [];
    for (let t = 0.3; t < duration; t += everySec) times.push(t);
    const kept: { blob: Blob; fp: Uint8Array; changeScore: number }[] = [];
    let last: Uint8Array | null = null;

    for (const [i, t] of times.entries()) {
      video.currentTime = t;
      await waitFor(video, 'seeked');
      ctx.drawImage(video, 0, 0, w, h);
      const fp = fingerprint(ctx, w, h);
      const change = last ? difference(fp, last) : 255;
      // Skip frames that barely changed (same photo still on screen).
      if (change > 12) {
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
        if (blob) kept.push({ blob, fp, changeScore: change });
        last = fp;
      }
      opts.onProgress?.((i + 1) / times.length);
    }
    // Too many distinct frames → keep the most distinct ones, in time order.
    if (kept.length > maxFrames) {
      const threshold = [...kept].sort((a, b) => b.changeScore - a.changeScore)[maxFrames - 1].changeScore;
      return kept.filter((k) => k.changeScore >= threshold).slice(0, maxFrames).map((k) => k.blob);
    }
    return kept.map((k) => k.blob);
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }
}

/** Encodes mono 16-bit PCM WAV. */
function wav(samples: Float32Array, sampleRate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return new Blob([buf], { type: 'audio/wav' });
}

/**
 * The recording's sound as a small speech-quality WAV (≤ 5 min ≈ 9.6 MB), or
 * null when there's no audio track or it's silent.
 */
export async function extractAudio(file: Blob, maxSeconds = 300): Promise<Blob | null> {
  if (file.size > 250 * 1024 * 1024) return null;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
    const seconds = Math.min(decoded.duration, maxSeconds);
    if (seconds < 1) return null;
    const rate = 16000;
    const offline = new OfflineAudioContext(1, Math.ceil(seconds * rate), rate);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start(0, 0, seconds);
    const mono = (await offline.startRendering()).getChannelData(0);
    // Silent recordings (screen recorded with the mic/sound off) → skip.
    let peak = 0;
    for (let i = 0; i < mono.length; i += 64) peak = Math.max(peak, Math.abs(mono[i]));
    return peak > 0.01 ? wav(mono, rate) : null;
  } catch {
    return null; // no audio track, or a codec the browser can't decode
  } finally {
    void ctx.close();
  }
}
