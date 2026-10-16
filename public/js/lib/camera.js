// Live camera for the cooking coach.
// The phone films continuously, but we only send a frame to Claude when something changed
// (or a heartbeat is due). That keeps the coach responsive while cutting cost and noise:
// a pot simmering untouched for two minutes doesn't need 12 identical answers.

export class LiveCamera {
  constructor(video) {
    this.video = video;
    this.stream = null;
    this.lastThumb = null;
    this.lastSentAt = 0;
    this.wakeLock = null;
  }

  get running() {
    return Boolean(this.stream);
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser can't open the camera. Use Chrome or Safari over https or localhost.");
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false, // speech recognition opens the mic separately
    });
    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play();
    // Keep the screen on while the phone sits on the stand.
    try {
      this.wakeLock = await navigator.wakeLock?.request("screen");
    } catch {
      /* not supported or denied: fine */
    }
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.wakeLock?.release?.();
    this.wakeLock = null;
  }

  /** Current frame as a JPEG data URL, long side <= maxSide. */
  frame(maxSide = 768, quality = 0.7) {
    const { videoWidth: w, videoHeight: h } = this.video;
    if (!w || !h) return null;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext("2d").drawImage(this.video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  }

  /** 0..1: how different the scene is from the last frame we sent (32x24 greyscale). */
  change() {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 24;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(this.video, 0, 0, 32, 24);
    const px = ctx.getImageData(0, 0, 32, 24).data;
    const thumb = new Float32Array(32 * 24);
    for (let i = 0; i < thumb.length; i++) thumb[i] = (px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11) / 255;
    this.pendingThumb = thumb;
    if (!this.lastThumb) return 1;
    let diff = 0;
    for (let i = 0; i < thumb.length; i++) diff += Math.abs(thumb[i] - this.lastThumb[i]);
    return diff / thumb.length;
  }

  /**
   * Should we send a frame now? Yes if the scene moved enough, or if the heartbeat is due.
   * `heartbeatMs` keeps a slow check-in going even when nothing moves (e.g. browning in the oven).
   */
  shouldSend({ threshold = 0.035, heartbeatMs = 45000 } = {}) {
    if (!this.running) return false;
    const changed = this.change() >= threshold;
    return changed || Date.now() - this.lastSentAt >= heartbeatMs;
  }

  markSent() {
    this.lastThumb = this.pendingThumb;
    this.lastSentAt = Date.now();
  }
}
