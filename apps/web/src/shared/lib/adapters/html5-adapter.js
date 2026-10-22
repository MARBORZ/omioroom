export class Html5PlayerAdapter {
    videoElement = null;
    listeners = new Set();
    bufferingState = false;
    async attach(container) {
        container.innerHTML = "";
        const video = document.createElement("video");
        video.style.width = "100%";
        video.style.height = "100%";
        video.style.objectFit = "contain";
        video.playsInline = true;
        video.controls = false;
        this.videoElement = video;
        container.appendChild(video);
        this.bindEvents(video);
    }
    emit(event) {
        for (const listener of this.listeners) {
            listener(event);
        }
    }
    bindEvents(video) {
        video.addEventListener("play", () => {
            this.bufferingState = false;
            this.emit({
                type: "play",
                currentTime: video.currentTime,
                duration: video.duration || 0,
            });
        });
        video.addEventListener("pause", () => {
            this.emit({
                type: "pause",
                currentTime: video.currentTime,
                duration: video.duration || 0,
            });
        });
        video.addEventListener("waiting", () => {
            this.bufferingState = true;
            this.emit({
                type: "buffering",
                currentTime: video.currentTime,
                duration: video.duration || 0,
            });
        });
        video.addEventListener("playing", () => {
            this.bufferingState = false;
            this.emit({
                type: "play",
                currentTime: video.currentTime,
                duration: video.duration || 0,
            });
        });
        video.addEventListener("timeupdate", () => {
            this.emit({
                type: "timeupdate",
                currentTime: video.currentTime,
                duration: video.duration || 0,
            });
        });
        video.addEventListener("ended", () => {
            this.emit({
                type: "ended",
                currentTime: video.currentTime,
                duration: video.duration || 0,
            });
        });
        video.addEventListener("error", () => {
            this.emit({
                type: "error",
                currentTime: video.currentTime,
                duration: video.duration || 0,
                error: video.error?.message || "Failed to load video",
            });
        });
    }
    async loadMedia(media) {
        if (!this.videoElement)
            return;
        this.videoElement.src = media.canonicalUrl;
        this.videoElement.load();
    }
    async play() {
        if (!this.videoElement)
            return;
        try {
            await this.videoElement.play();
        }
        catch {
            // Autoplay with audio was blocked by browser
            this.videoElement.muted = true;
            await this.videoElement.play();
        }
    }
    async pause() {
        this.videoElement?.pause();
    }
    async seek(seconds) {
        if (this.videoElement) {
            this.videoElement.currentTime = seconds;
        }
    }
    async setPlaybackRate(rate) {
        if (this.videoElement) {
            this.videoElement.playbackRate = rate;
        }
    }
    setMuted(muted) {
        if (this.videoElement) {
            this.videoElement.muted = muted;
        }
    }
    getCurrentTime() {
        return this.videoElement?.currentTime || 0;
    }
    getDuration() {
        return this.videoElement?.duration || 0;
    }
    isBuffering() {
        return this.bufferingState;
    }
    destroy() {
        if (this.videoElement) {
            this.videoElement.pause();
            this.videoElement.src = "";
            this.videoElement.remove();
            this.videoElement = null;
        }
        this.listeners.clear();
    }
    onStateChange(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }
}
