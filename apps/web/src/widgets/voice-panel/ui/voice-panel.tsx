import React from "react";
import { Mic, MicOff, PhoneOff, Radio, Users } from "lucide-react";
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
      {voice.status === "off" || voice.status === "joining" ? (
        <div className={styles.offStateCard}>
          <div className={styles.micBadge} aria-hidden>
            <Radio size={30} />
          </div>

          <div className={styles.offInfo}>
            <h3 className={styles.offTitle}>{t.voice.title}</h3>
            <p className={styles.offDesc}>{t.voice.desc}</p>
          </div>

          <div className={styles.peersPill}>
            <Users size={13} />
            <span>
              {voice.peers.length > 0 ? t.voice.activePeers(voice.peers.length) : t.voice.noPeers}
            </span>
          </div>

          <Button
            variant="primary"
            size="md"
            icon={<Mic size={16} />}
            loading={voice.status === "joining"}
            onClick={() => void voice.join()}
            disabled={!userId}
            className={styles.joinBtn}
          >
            {t.voice.join}
          </Button>

          <span className={styles.offTip}>{t.voice.tip}</span>
        </div>
      ) : (
        <div className={styles.activeContainer}>
          <div className={styles.activeHeader}>
            <span className={styles.activeTitle}>{t.voice.title}</span>
            <span className={styles.countBadge}>
              {voice.peers.length} / {VOICE_MAX_PARTICIPANTS}
            </span>
          </div>

          <ul className={styles.list}>
            {voice.peers.map((p, i) => {
              const self = p.userId === userId;
              const speaking = self ? voice.selfSpeaking && !voice.muted : p.speaking && !p.muted;
              const isMuted = self ? voice.muted : p.muted;
              const name = nameOf(p.userId);
              return (
                <li
                  key={p.userId}
                  className={`${styles.item} ${speaking ? styles.itemSpeaking : ""} motion-rise`}
                  style={{ "--i": Math.min(i, 7) } as React.CSSProperties}
                >
                  <span
                    className={`${styles.avatar} ${speaking ? styles.avatarSpeaking : ""}`}
                    aria-hidden
                  >
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className={styles.peerDetails}>
                    <span className={styles.name}>
                      {name}
                      {self ? ` (${t.group.you})` : ""}
                    </span>
                    <span className={styles.peerStatus}>
                      {isMuted ? (
                        <span className={styles.statusMuted}>{t.voice.muted}</span>
                      ) : speaking ? (
                        <span className={styles.statusSpeaking}>{t.voice.speaking}</span>
                      ) : (
                        <span className={styles.statusIdle}>{t.voice.listening}</span>
                      )}
                    </span>
                  </div>
                  {isMuted && <MicOff size={14} className={styles.statusMuted} aria-label={t.voice.muted} />}
                </li>
              );
            })}
          </ul>

          <div className={styles.activeActions}>
            <Button
              variant={voice.muted ? "primary" : "secondary"}
              size="sm"
              icon={voice.muted ? <MicOff size={15} /> : <Mic size={15} />}
              onClick={voice.toggleMute}
              className={styles.muteBtn}
            >
              {voice.muted ? t.voice.unmute : t.voice.mute}
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<PhoneOff size={15} />}
              onClick={voice.leave}
              className={styles.leaveBtn}
            >
              {t.voice.leave}
            </Button>
          </div>
        </div>
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
