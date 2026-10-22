import { useCallback, useEffect, useRef, useState } from "react";
import { VOICE_MAX_PARTICIPANTS } from "@omioroom/contracts";
import { supabase } from "../../../shared/api/supabase.js";
import { VoiceMesh, type SignalMessage } from "./voice-mesh.js";

export type VoiceStatus = "off" | "joining" | "on";
export type VoiceError = "unsupported" | "denied" | "full" | "failed" | null;

interface PresenceMeta {
  muted: boolean;
}

export interface VoicePeer {
  userId: string;
  muted: boolean;
  speaking: boolean;
}

function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  const url = import.meta.env.VITE_TURN_URL;
  if (url) {
    servers.push({
      urls: url,
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_CREDENTIAL,
    });
  }
  return servers;
}

/** Level meter for the speaking indicator. */
function watchLevel(stream: MediaStream, ctx: AudioContext, onLevel: (speaking: boolean) => void): () => void {
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  let last = false;
  const timer = setInterval(() => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += (v - 128) * (v - 128);
    const speaking = Math.sqrt(sum / data.length) > 6;
    if (speaking !== last) {
      last = speaking;
      onLevel(speaking);
    }
  }, 150);
  return () => {
    clearInterval(timer);
    source.disconnect();
  };
}

export function useVoiceChat(roomId: string, userId: string | undefined) {
  const [status, setStatus] = useState<VoiceStatus>("off");
  const [error, setError] = useState<VoiceError>(null);
  const [muted, setMuted] = useState(false);
  const [peers, setPeers] = useState<VoicePeer[]>([]);
  const [selfSpeaking, setSelfSpeaking] = useState(false);
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});

  const stateRef = useRef<{
    channel: ReturnType<typeof supabase.channel> | null;
    mesh: VoiceMesh | null;
    local: MediaStream | null;
    ctx: AudioContext | null;
    stops: Array<() => void>;
  }>({ channel: null, mesh: null, local: null, ctx: null, stops: [] });
  const mutedMap = useRef<Record<string, boolean>>({});
  const speakingMap = useRef<Record<string, boolean>>({});

  const publishPeers = useCallback((presentIds: string[]) => {
    setPeers(
      presentIds.map((id) => ({
        userId: id,
        muted: Boolean(mutedMap.current[id]),
        speaking: Boolean(speakingMap.current[id]),
      }))
    );
  }, []);

  const teardown = useCallback(() => {
    const s = stateRef.current;
    s.stops.forEach((stop) => stop());
    s.stops = [];
    s.mesh?.close();
    s.local?.getTracks().forEach((t) => t.stop());
    void s.ctx?.close().catch(() => {});
    if (s.channel) void supabase.removeChannel(s.channel);
    stateRef.current = { channel: null, mesh: null, local: null, ctx: null, stops: [] };
    mutedMap.current = {};
    speakingMap.current = {};
    setStreams({});
    setPeers([]);
    setSelfSpeaking(false);
    setMuted(false);
    setStatus("off");
  }, []);

  const join = useCallback(async () => {
    if (!userId || status !== "off") return;
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      setError("unsupported");
      return;
    }

    setStatus("joining");
    let local: MediaStream;
    try {
      local = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setError("denied");
      setStatus("off");
      return;
    }

    const s = stateRef.current;
    s.local = local;
    const ctx = new AudioContext();
    s.ctx = ctx;
    s.stops.push(watchLevel(local, ctx, setSelfSpeaking));

    const channel = supabase.channel(`voice:${roomId}`, {
      config: { private: true, presence: { key: userId }, broadcast: { self: false } },
    });
    s.channel = channel;

    const mesh = new VoiceMesh(userId, local, iceServers(), {
      send: (to, message) => {
        void channel.send({ type: "broadcast", event: "signal", payload: { to, from: userId, msg: message } });
      },
      onRemoteStream: (peerId, stream) => {
        setStreams((prev) => ({ ...prev, [peerId]: stream }));
        s.stops.push(
          watchLevel(stream, ctx, (speaking) => {
            speakingMap.current[peerId] = speaking;
            publishPeers(Object.keys(channel.presenceState()));
          })
        );
      },
      onPeerClosed: (peerId) => {
        setStreams((prev) => {
          const next = { ...prev };
          delete next[peerId];
          return next;
        });
      },
    });
    s.mesh = mesh;

    channel
      .on("broadcast", { event: "signal" }, ({ payload }) => {
        const p = payload as { to: string; from: string; msg: SignalMessage };
        if (p.to === userId) void mesh.handleSignal(p.from, p.msg).catch(() => {});
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceMeta>();
        const ids = Object.keys(state);
        for (const id of ids) mutedMap.current[id] = Boolean(state[id]?.[0]?.muted);
        for (const id of ids) if (id !== userId) mesh.connectTo(id);
        // Drop peers that left
        for (const known of Object.keys(mutedMap.current)) {
          if (!ids.includes(known)) {
            delete mutedMap.current[known];
            mesh.removePeer(known);
          }
        }
        publishPeers(ids);
      })
      .subscribe(async (st) => {
        if (st === "SUBSCRIBED") {
          const others = Object.keys(channel.presenceState()).filter((id) => id !== userId);
          if (others.length >= VOICE_MAX_PARTICIPANTS) {
            setError("full");
            teardown();
            return;
          }
          await channel.track({ muted: false } satisfies PresenceMeta);
          setStatus("on");
        } else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT") {
          setError("failed");
          teardown();
        }
      });
  }, [roomId, userId, status, publishPeers, teardown]);

  const toggleMute = useCallback(() => {
    const s = stateRef.current;
    if (!s.local || !s.channel) return;
    const next = !muted;
    s.local.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
    void s.channel.track({ muted: next } satisfies PresenceMeta);
  }, [muted]);

  // Leaving the room page ends the call
  useEffect(() => teardown, [teardown]);

  return { status, error, muted, peers, selfSpeaking, streams, join, leave: teardown, toggleMute };
}
