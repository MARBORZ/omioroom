import React, { useEffect, useRef, useState, useCallback } from "react";
import { ImagePlus, Send, X, UploadCloud, MessageSquare } from "lucide-react";
import { CHAT_MAX_TEXT_LENGTH, CHAT_IMAGE_MIME_TYPES, type ChatMessageDto } from "@omioroom/contracts";
import { useSession } from "../../../app/providers/session-context.js";
import { useI18n } from "../../../shared/lib/i18n/index.js";
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
  const [isDragging, setIsDragging] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    const el = listRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length]);

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

  const attachFile = useCallback(
    (file: File) => {
      if (!isAllowedChatImage(file)) {
        setError(t.chat.imageType);
        return;
      }
      setError(null);
      setImage(file);
      inputRef.current?.focus();
    },
    [t.chat.imageType]
  );

  const pickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) attachFile(file);
  };

  // Clipboard paste handler: paste screenshot / copied image directly into chat
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          attachFile(file);
          return;
        }
      }
    }
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault();
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith("image/")) {
      attachFile(file);
    }
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
      if (err instanceof ChatImageError) {
        setError(err.reason === "size" ? t.chat.imageTooLarge : t.chat.imageType);
      } else if (err?.code === "RATE_LIMITED") {
        setError(t.chat.rateLimited);
      } else {
        setError(t.chat.sendFailed);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <section
      className={`${styles.chat} ${isDragging ? styles.dragOver : ""}`}
      data-widget="room-chat"
      aria-label={t.chat.title}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={styles.header}>
        <span className={styles.title}>{t.chat.title}</span>
      </div>

      {isDragging && (
        <div className={styles.dropOverlay}>
          <UploadCloud size={36} />
          <span>{t.chat.dropImage}</span>
        </div>
      )}

      <div className={styles.list} ref={listRef} role="log" aria-live="polite">
        {loading && (
          <div className={styles.skeletonList}>
            <Skeleton width="45%" shape="text" />
            <Skeleton width="75%" shape="text" />
            <Skeleton width="60%" shape="text" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className={styles.empty}>
            <MessageSquare size={24} className={styles.emptyIcon} />
            <p>{t.chat.empty}</p>
          </div>
        )}

        {messages.map((m) => {
          const isOwn = m.senderId === user?.id;
          return (
            <div
              key={m.id}
              className={`${styles.messageWrapper} ${isOwn ? styles.ownWrapper : styles.otherWrapper} motion-rise`}
            >
              {!isOwn && <span className={styles.sender}>{m.senderName}</span>}
              <div className={`${styles.bubble} ${isOwn ? styles.ownBubble : styles.otherBubble}`}>
                {m.text && <p className={styles.text}>{m.text}</p>}
                {m.attachmentPath && (
                  <ChatImage
                    path={m.attachmentPath}
                    onOpen={setZoomUrl}
                    openLabel={t.chat.openImage}
                    className={styles}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={handleSubmit} className={styles.form} onPaste={handlePaste}>
        {preview && (
          <div className={styles.previewContainer}>
            <div className={styles.previewImageWrapper}>
              <img src={preview} alt="Attached preview" className={styles.previewImage} />
              <button
                type="button"
                className={styles.removePreviewBtn}
                onClick={() => setImage(null)}
                aria-label={t.chat.removeImage}
                title={t.chat.removeImage}
              >
                <X size={12} />
              </button>
            </div>
            <div className={styles.previewMeta}>
              <span className={styles.previewFilename}>{image?.name || "image.png"}</span>
              <span className={styles.previewFilesize}>
                {Math.max(1, Math.round((image?.size || 0) / 1024))} KB
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        <div className={styles.inputRow}>
          <button
            type="button"
            className={styles.attachBtn}
            onClick={() => fileRef.current?.click()}
            title={t.chat.attach}
            aria-label={t.chat.attach}
          >
            <ImagePlus size={18} />
          </button>

          <input
            ref={fileRef}
            type="file"
            accept={CHAT_IMAGE_MIME_TYPES.join(",")}
            onChange={pickImage}
            hidden
          />

          <input
            ref={inputRef}
            className={styles.input}
            value={text}
            maxLength={CHAT_MAX_TEXT_LENGTH}
            onChange={(e) => setText(e.target.value)}
            placeholder={t.chat.placeholder}
            aria-label={t.chat.placeholder}
          />

          <button
            type="submit"
            className={styles.sendBtn}
            disabled={(!text.trim() && !image) || sending}
            title={t.chat.send}
            aria-label={t.chat.send}
          >
            <Send size={16} />
          </button>
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
