import React, { useEffect, useRef, useState } from "react";
import { Paperclip, Send, FileText, X } from "lucide-react";
import {
  ClientCommand,
  ServerEvent,
  CHAT_MAX_TEXT_LENGTH,
  CHAT_HISTORY_LIMIT,
  type ChatMessageDto,
  type AttachmentType,
} from "@omioroom/contracts";
import { useSocketContext } from "../../../app/providers/socket-context.js";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { emitCommand } from "../../../shared/api/socket.js";
import { Button } from "../../../shared/ui/button/button.js";
import styles from "./room-chat.module.scss";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i;

function detectAttachmentType(url: string): AttachmentType {
  try {
    return IMAGE_EXT.test(new URL(url).pathname + new URL(url).search) ? "image" : "file";
  } catch {
    return "file";
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

interface RoomChatProps {
  roomId: string;
}

export const RoomChat: React.FC<RoomChatProps> = ({ roomId }) => {
  const { socket, user } = useSocketContext();
  const { t } = useI18n();

  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [text, setText] = useState("");
  const [attachUrl, setAttachUrl] = useState("");
  const [showAttach, setShowAttach] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // History on entry and after every (re)connect, then live messages
  useEffect(() => {
    let cancelled = false;

    const loadHistory = () => {
      emitCommand<{ roomId: string }, ChatMessageDto[]>(socket, ClientCommand.CHAT_HISTORY, { roomId })
        .then((history) => {
          if (!cancelled) setMessages(history);
        })
        .catch(() => {});
    };

    const onMessage = (msg: ChatMessageDto) => {
      if (msg.roomId !== roomId) return;
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg].slice(-CHAT_HISTORY_LIMIT)
      );
    };

    loadHistory();
    socket.on(ServerEvent.CHAT_MESSAGE, onMessage);
    socket.io.on("reconnect", loadHistory);
    return () => {
      cancelled = true;
      socket.off(ServerEvent.CHAT_MESSAGE, onMessage);
      socket.io.off("reconnect", loadHistory);
    };
  }, [socket, roomId]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    const url = attachUrl.trim();
    if (!trimmed && !url) return;
    if (url && !isHttpUrl(url)) {
      setError(t.chat.badUrl);
      return;
    }

    setError(null);
    setSending(true);
    try {
      await emitCommand(socket, ClientCommand.CHAT_SEND, {
        roomId,
        text: trimmed,
        attachmentUrl: url || null,
        attachmentType: url ? detectAttachmentType(url) : null,
      });
      setText("");
      setAttachUrl("");
      setShowAttach(false);
    } catch (err: any) {
      setError(err?.code === "RATE_LIMITED" ? t.chat.rateLimited : t.chat.sendFailed);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className={styles.chat} aria-label={t.chat.title}>
      <div className={styles.title}>{t.chat.title}</div>

      <div className={styles.list} ref={listRef} role="log" aria-live="polite">
        {messages.length === 0 && <div className={styles.empty}>{t.chat.empty}</div>}
        {messages.map((m) => (
          <div key={m.id} className={`${styles.message} ${m.senderId === user?.id ? styles.own : ""}`}>
            <span className={styles.sender}>{m.senderName}</span>
            {m.text && <span className={styles.text}>{m.text}</span>}
            {m.attachmentUrl && m.attachmentType === "image" && (
              <button
                type="button"
                className={styles.imageButton}
                onClick={() => setZoomUrl(m.attachmentUrl)}
                aria-label={t.chat.openImage}
              >
                <img src={m.attachmentUrl} alt="" className={styles.image} loading="lazy" referrerPolicy="no-referrer" />
              </button>
            )}
            {m.attachmentUrl && m.attachmentType === "file" && (
              <a href={m.attachmentUrl} target="_blank" rel="noopener noreferrer nofollow" className={styles.file}>
                <FileText size={14} />
                <span>{m.attachmentUrl}</span>
              </a>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        {showAttach && (
          <input
            className={styles.input}
            type="url"
            placeholder={t.chat.attachPlaceholder}
            value={attachUrl}
            onChange={(e) => setAttachUrl(e.target.value)}
            aria-label={t.chat.attach}
          />
        )}
        <input
          className={styles.input}
          value={text}
          maxLength={CHAT_MAX_TEXT_LENGTH}
          onChange={(e) => setText(e.target.value)}
          placeholder={t.chat.placeholder}
          aria-label={t.chat.placeholder}
        />
        {error && <div className={styles.error} role="alert">{error}</div>}
        <div className={styles.actions}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<Paperclip size={14} />}
            onClick={() => setShowAttach((v) => !v)}
          >
            {t.chat.attach}
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={sending}
            disabled={!text.trim() && !attachUrl.trim()}
            icon={<Send size={14} />}
          >
            {t.chat.send}
          </Button>
        </div>
      </form>

      {zoomUrl && (
        <div className={styles.lightbox} onClick={() => setZoomUrl(null)} role="dialog" aria-modal="true">
          <button type="button" className={styles.close} aria-label={t.chat.close}>
            <X size={20} />
          </button>
          <img src={zoomUrl} alt="" referrerPolicy="no-referrer" />
        </div>
      )}
    </section>
  );
};
