import React from "react";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { VOICE_MAX_PARTICIPANTS, type ParticipantDto } from "@omioroom/contracts";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { Button } from "../../../shared/ui/button/button.js";
import { useVoiceChat } from "../../../features/voice-chat/model/use-voice-chat.js";
import styles from "./voice-panel.module.scss";

interface VoicePanelProps {
  roomId: string;
  userId: string | undefined;
  participants: ParticipantDto[];
}

const RemoteAudio: React.FC<{ stream: MediaStream }> = ({ stream }) => {
  const ref = React.useCallback(
    (el: HTMLAudioElement | null) => {
      if (el && el.srcObject !== stream) el.srcObject = stream;
    },
    [stream]
  );
  return <audio ref={ref} autoPlay playsInline />;
};

export const VoicePanel: React.FC<VoicePanelProps> = ({ roomId, userId, participants }) => {
  const { t } = useI18n();
  const voice = useVoiceChat(roomId, userId);
  const nameOf = (id: string) => participants.find((p) => p.userId === id)?.displayName ?? "…";

  const errorText =
    voice.error === "denied"
      ? t.voice.denied
      : voice.error === "unsupported"
      ? t.voice.unsupported
      : voice.error === "full"
      ? t.voice.full
      : voice.error === "failed"
      ? t.voice.failed
      : null;

  return (
    <section className={styles.panel} aria-label={t.voice.title}>
      <div className={styles.header}>
        <span className={styles.title}>{t.voice.title}</span>
        {voice.status === "on" && (
          <span className={styles.count}>
            {voice.peers.length} / {VOICE_MAX_PARTICIPANTS}
          </span>
        )}
      </div>

      {voice.status === "off" || voice.status === "joining" ? (
        <Button
          variant="secondary"
          size="sm"
          icon={<Mic size={14} />}
          loading={voice.status === "joining"}
          onClick={() => void voice.join()}
          disabled={!userId}
        >
          {t.voice.join}
        </Button>
      ) : (
        <>
          <ul className={styles.list}>
            {voice.peers.map((p) => {
              const self = p.userId === userId;
              const speaking = self ? voice.selfSpeaking && !voice.muted : p.speaking && !p.muted;
              const isMuted = self ? voice.muted : p.muted;
              return (
                <li key={p.userId} className={styles.item}>
                  <span className={`${styles.avatar} ${speaking ? styles.speaking : ""}`} aria-hidden>
                    {nameOf(p.userId).slice(0, 1).toUpperCase()}
                  </span>
                  <span className={styles.name}>
                    {nameOf(p.userId)}
                    {self ? ` (${t.group.you})` : ""}
                  </span>
                  {isMuted && <MicOff size={13} aria-label={t.voice.muted} />}
                </li>
              );
            })}
          </ul>
          <div className={styles.actions}>
            <Button
              variant={voice.muted ? "primary" : "secondary"}
              size="sm"
              icon={voice.muted ? <MicOff size={14} /> : <Mic size={14} />}
              onClick={voice.toggleMute}
            >
              {voice.muted ? t.voice.unmute : t.voice.mute}
            </Button>
            <Button variant="ghost" size="sm" icon={<PhoneOff size={14} />} onClick={voice.leave}>
              {t.voice.leave}
            </Button>
          </div>
        </>
      )}

      {errorText && (
        <div className={styles.error} role="alert">
          {errorText}
        </div>
      )}

      {Object.entries(voice.streams).map(([id, stream]) => (
        <RemoteAudio key={id} stream={stream} />
      ))}
    </section>
  );
};
