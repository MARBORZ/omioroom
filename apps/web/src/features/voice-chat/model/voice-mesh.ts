/**
 * Audio-only WebRTC mesh. Every participant keeps one peer connection to each other participant,
 * so it suits small voice groups (see VOICE_MAX_PARTICIPANTS). Signaling is injected.
 *
 * Roles are deterministic to avoid both sides offering at once: the peer with the smaller id offers.
 */
export type SignalMessage =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "ice"; candidate: RTCIceCandidateInit };

export interface VoiceMeshCallbacks {
  send: (to: string, message: SignalMessage) => void;
  onRemoteStream: (peerId: string, stream: MediaStream) => void;
  onPeerClosed: (peerId: string) => void;
}

interface Peer {
  pc: RTCPeerConnection;
  pendingIce: RTCIceCandidateInit[];
  restartTimer: ReturnType<typeof setTimeout> | null;
  createdAt: number;
}

export class VoiceMesh {
  private readonly peers = new Map<string, Peer>();

  constructor(
    private readonly selfId: string,
    private readonly localStream: MediaStream,
    private readonly iceServers: RTCIceServer[],
    private readonly cb: VoiceMeshCallbacks
  ) {}

  has(peerId: string): boolean {
    return this.peers.has(peerId);
  }

  /** True when a connection exists but is dead or never got going, so it must be rebuilt. */
  isStale(peerId: string, nowMs: number): boolean {
    const peer = this.peers.get(peerId);
    if (!peer) return false;
    const state = peer.pc.connectionState;
    if (state === "failed" || state === "closed" || state === "disconnected") return true;
    return state !== "connected" && nowMs - peer.createdAt > 15_000;
  }

  /** Called when a peer shows up in the voice presence list. */
  connectTo(peerId: string): void {
    if (peerId === this.selfId || this.peers.has(peerId)) return;
    const peer = this.createPeer(peerId);
    if (this.selfId < peerId) void this.makeOffer(peerId, peer);
  }

  removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    if (peer.restartTimer) clearTimeout(peer.restartTimer);
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.close();
    this.peers.delete(peerId);
    this.cb.onPeerClosed(peerId);
  }

  close(): void {
    for (const id of [...this.peers.keys()]) this.removePeer(id);
  }

  async handleSignal(from: string, msg: SignalMessage): Promise<void> {
    if (from === this.selfId) return;

    if (msg.kind === "offer") {
      // An offer for a peer we already know means the other side restarted: rebuild cleanly
      if (this.peers.has(from) && this.peers.get(from)!.pc.signalingState !== "stable") this.removePeer(from);
      const peer = this.peers.get(from) ?? this.createPeer(from);
      await peer.pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
      await this.flushIce(peer);
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      this.cb.send(from, { kind: "answer", sdp: answer.sdp ?? "" });
    } else if (msg.kind === "answer") {
      const peer = this.peers.get(from);
      if (!peer || peer.pc.signalingState !== "have-local-offer") return;
      await peer.pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
      await this.flushIce(peer);
    } else if (msg.kind === "ice") {
      const peer = this.peers.get(from) ?? this.createPeer(from);
      if (peer.pc.remoteDescription) {
        await peer.pc.addIceCandidate(msg.candidate).catch(() => {});
      } else {
        peer.pendingIce.push(msg.candidate);
      }
    }
  }

  private async flushIce(peer: Peer): Promise<void> {
    const queued = peer.pendingIce.splice(0);
    for (const c of queued) await peer.pc.addIceCandidate(c).catch(() => {});
  }

  private createPeer(peerId: string): Peer {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const peer: Peer = { pc, pendingIce: [], restartTimer: null, createdAt: Date.now() };
    this.peers.set(peerId, peer);

    for (const track of this.localStream.getTracks()) pc.addTrack(track, this.localStream);

    pc.onicecandidate = (e) => {
      if (e.candidate) this.cb.send(peerId, { kind: "ice", candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      this.cb.onRemoteStream(peerId, stream);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" && this.selfId < peerId) {
        // Try once more with fresh ICE; the answering side just follows
        peer.restartTimer = setTimeout(() => void this.makeOffer(peerId, peer, true), 1000);
      }
    };
    return peer;
  }

  private async makeOffer(peerId: string, peer: Peer, iceRestart = false): Promise<void> {
    try {
      const offer = await peer.pc.createOffer({ iceRestart });
      await peer.pc.setLocalDescription(offer);
      this.cb.send(peerId, { kind: "offer", sdp: offer.sdp ?? "" });
    } catch {
      // The peer is gone or the connection closed meanwhile
    }
  }
}
