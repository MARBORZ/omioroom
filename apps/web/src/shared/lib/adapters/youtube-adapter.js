function loadYouTubeScript() {
    return new Promise((resolve) => {
        if (window.YT && window.YT.Player) {
            return resolve();
        }
        const existing = document.getElementById("youtube-iframe-api");
        if (existing) {
            const prev = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => {
                prev?.();
                resolve();
            };
            return;
        }
        const script = document.createElement("script");
        script.id = "youtube-iframe-api";
        script.src = "https://www.youtube.com/iframe_api";
        window.onYouTubeIframeAPIReady = () => {
            resolve();
        };
        document.body.appendChild(script);
    });
}
export class YouTubePlayerAdapter {
    player = null;
    containerElement = null;
    listeners = new Set();
    timeUpdateInterval = null;
    isBufferingState = false;
    async attach(container) {
        await loadYouTubeScript();
        this.containerElement = container;
        container.innerHTML = `<div id="yt-player-target" style="width:100%; height:100%;"></div>`;
    }
    emit(event) {
        for (const listener of this.listeners) {
            listener(event);
        }
    }
    startTimeTracker() {
        this.stopTimeTracker();
        this.timeUpdateInterval = setInterval(() => {
            if (this.player && typeof this.player.getCurrentTime === "function") {
                this.emit({
                    type: "timeupdate",
                    currentTime: this.player.getCurrentTime() || 0,
                    duration: this.player.getDuration() || 0,
                });
            }
        }, 250);
    }
    stopTimeTracker() {
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
            this.timeUpdateInterval = null;
        }
    }
    async loadMedia(media) {
        if (!this.player) {
            await loadYouTubeScript();
            return new Promise((resolve) => {
                this.player = new window.YT.Player("yt-player-target", {
                    videoId: media.sourceId,
                    playerVars: {
                        autoplay: 0,
                        controls: 0,
                        disablekb: 1,
                        fs: 0,
                        modestbranding: 1,
                        rel: 0,
                        playsinline: 1,
                    },
                    events: {
                        onReady: () => resolve(),
                        onStateChange: (event) => this.handleStateChange(event.data),
                        onError: (err) => {
                            this.emit({
                                type: "error",
                                currentTime: 0,
                                duration: 0,
                                error: `YouTube Player error: ${err.data}`,
                            });
                        },
                    },
                });
            });
        }
        else {
            if (typeof this.player.cueVideoById === "function") {
                this.player.cueVideoById(media.sourceId);
            }
        }
    }
    handleStateChange(state) {
        // -1: unstarted, 0: ended, 1: playing, 2: paused, 3: buffering, 5: video cued
        const currentTime = this.getCurrentTime();
        const duration = this.getDuration();
        if (state === 1) {
            // PLAYING
            this.isBufferingState = false;
            this.startTimeTracker();
            this.emit({ type: "play", currentTime, duration });
        }
        else if (state === 2) {
            // PAUSED
            this.isBufferingState = false;
            this.stopTimeTracker();
            this.emit({ type: "pause", currentTime, duration });
        }
        else if (state === 3) {
            // BUFFERING
            this.isBufferingState = true;
            this.emit({ type: "buffering", currentTime, duration });
        }
        else if (state === 0) {
            // ENDED
            this.isBufferingState = false;
            this.stopTimeTracker();
            this.emit({ type: "ended", currentTime, duration });
        }
    }
    async play() {
        if (this.player && typeof this.player.playVideo === "function") {
            this.player.playVideo();
        }
    }
    async pause() {
        if (this.player && typeof this.player.pauseVideo === "function") {
            this.player.pauseVideo();
        }
    }
    async seek(seconds) {
        if (this.player && typeof this.player.seekTo === "function") {
            this.player.seekTo(seconds, true);
        }
    }
    async setPlaybackRate(rate) {
        if (this.player && typeof this.player.setPlaybackRate === "function") {
            this.player.setPlaybackRate(rate);
        }
    }
    setMuted(muted) {
        if (!this.player)
            return;
        if (muted && typeof this.player.mute === "function") {
            this.player.mute();
        }
        else if (!muted && typeof this.player.unMute === "function") {
            this.player.unMute();
        }
    }
    getCurrentTime() {
        if (this.player && typeof this.player.getCurrentTime === "function") {
            return this.player.getCurrentTime() || 0;
        }
        return 0;
    }
    getDuration() {
        if (this.player && typeof this.player.getDuration === "function") {
            return this.player.getDuration() || 0;
        }
        return 0;
    }
    isBuffering() {
        return this.isBufferingState;
    }
    destroy() {
        this.stopTimeTracker();
        if (this.player && typeof this.player.destroy === "function") {
            this.player.destroy();
            this.player = null;
        }
        this.listeners.clear();
        if (this.containerElement) {
            this.containerElement.innerHTML = "";
        }
    }
    onStateChange(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }
}
