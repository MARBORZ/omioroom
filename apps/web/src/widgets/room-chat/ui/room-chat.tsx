import React, { useEffect, useRef, useState } from "react";
import { ImagePlus, Send, X } from "lucide-react";
import { CHAT_MAX_TEXT_LENGTH, CHAT_IMAGE_MIME_TYPES, type ChatMessageDto } from "@omioroom/contracts";
import { useSession } from "../../../app/providers/session-context.js";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { Button } from "../../../shared/ui/button/button.js";
import { ChatImageError, isAllowedChatImage } from "../../../shared/lib/image/prepare-chat-image.js";
import { Skeleton } from "../../../shared/ui/skeleton/skeleton.js";
import { ChatImage } from "./chat-image.js";
import styles from "./room-chat.module.scss";

interface RoomChatProps {
  messages: ChatMessageDto[];
  loading?: boolean;
  onSend: (text: string, image: File | null) => Promise<void>;
}

export const RoomChat: React.FC<RoomChatProps> = ({ messages, loading = false, onSend }) => {
  const { user } = useSession();
  const { t } = useI18n();

  const [text, setText] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Local preview of the chosen image
  useEffect(() => {
    if (!image) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const pickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!isAllowedChatImage(file)) {
      setError(t.chat.imageType);
      return;
    }
    setError(null);
    setImage(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed && !image) return;

    setError(null);
    setSending(true);
    try {
      await onSend(trimmed, image);
      setText("");
      setImage(null);
    } catch (err: any) {
      if (err instanceof ChatImageError) setError(err.reason === "size" ? t.chat.imageTooLarge : t.chat.imageType);
      else if (err?.code === "RATE_LIMITED") setError(t.chat.rateLimited);
      else setError(t.chat.sendFailed);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className={styles.chat} aria-label={t.chat.title}>
      <div className={styles.title}>{t.chat.title}</div>

      <div className={styles.list} ref={listRef} role="log" aria-live="polite">
        {loading && (
          <>
            <Skeleton width="40%" shape="text" />
            <Skeleton width="75%" shape="text" />
            <Skeleton width="55%" shape="text" />
          </>
        )}
        {!loading && messages.length === 0 && <div className={styles.empty}>{t.chat.empty}</div>}
        {messages.map((m) => (
          <div key={m.id} className={`${styles.message} ${m.senderId === user?.id ? styles.own : ""} motion-rise`}>
            <span className={styles.sender}>{m.senderName}</span>
            {m.text && <span className={styles.text}>{m.text}</span>}
            {m.attachmentPath && (
              <ChatImage path={m.attachmentPath} onOpen={setZoomUrl} openLabel={t.chat.openImage} className={styles} />
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        {preview && (
          <div className={styles.preview}>
            <img src={preview} alt="" className={styles.previewImage} />
            <button type="button" className={styles.removePreview} onClick={() => setImage(null)} aria-label={t.chat.removeImage}>
              <X size={14} />
            </button>
          </div>
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
        <input
          ref={fileRef}
          type="file"
          accept={CHAT_IMAGE_MIME_TYPES.join(",")}
          onChange={pickImage}
          hidden
        />
        <div className={styles.actions}>
          <Button type="button" variant="ghost" size="sm" icon={<ImagePlus size={14} />} onClick={() => fileRef.current?.click()}>
            {t.chat.attach}
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={sending}
            disabled={!text.trim() && !image}
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
