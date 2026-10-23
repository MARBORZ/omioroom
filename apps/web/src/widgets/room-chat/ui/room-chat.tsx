import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { ImagePlus, SendHorizontal, X, UploadCloud, MessageSquare, Reply, ChevronDown, Check, CheckCheck, MicOff, Flag } from "lucide-react";
import { CHAT_MAX_TEXT_LENGTH, CHAT_IMAGE_MIME_TYPES, type ChatMessageDto, type ParticipantDto } from "@omioroom/contracts";
import { useSession } from "../../../app/providers/session-context.js";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { showToast } from "../../../shared/ui/toast/toast.js";
import { ChatImageError, isAllowedChatImage } from "../../../shared/lib/image/prepare-chat-image.js";
import { Skeleton } from "../../../shared/ui/skeleton/skeleton.js";
import { backend } from "../../../shared/api/backend.js";
import { ChatImage } from "./chat-image.js";
import styles from "./room-chat.module.scss";

interface RoomChatProps {
  messages: ChatMessageDto[];
  loading?: boolean;
  onSend: (text: string, image: File | null) => Promise<void>;
  participants?: ParticipantDto[];
  roomId?: string;
  isMuted?: boolean;
  onReportMessage?: (messageId: string) => void;
}

interface ReplyState {
  id: string;
  senderName: string;
  text: string;
  attachmentPath: string | null;
}

interface ParsedMessage {
  reply?: {
    id: string;
    senderName: string;
    snippet: string;
  };
  body: string;
}

function parseMessageText(rawText: string): ParsedMessage {
  if (rawText.startsWith("> [") && rawText.includes("]: ")) {
    const headerEnd = rawText.indexOf("]: ");
    const lineEnd = rawText.indexOf("\n", headerEnd);
    if (headerEnd !== -1 && lineEnd !== -1) {
      const meta = rawText.slice(3, headerEnd);
      const [id, ...nameParts] = meta.split("|");
      const senderName = nameParts.join("|");
      const snippet = rawText.slice(headerEnd + 3, lineEnd);
      const body = rawText.slice(lineEnd + 1);
      return {
        reply: { id, senderName, snippet },
        body,
      };
    }
  }
  return { body: rawText };
}

function formatMsgTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "";
  }
}

export const RoomChat: React.FC<RoomChatProps> = ({
  messages,
  loading = false,
  onSend,
  participants,
  roomId,
  isMuted = false,
  onReportMessage,
}) => {
  const { user } = useSession();
  const { t } = useI18n();

  const [text, setText] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyState | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isNearBottomRef = useRef(true);
  const lastMarkedIdRef = useRef<string | null>(null);
  const markSeenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = listRef.current;
    if (!el) return;

    isNearBottomRef.current = true;
    setShowScrollBottom(false);

    const doScroll = () => {
      if (!listRef.current) return;
      const target = listRef.current.scrollHeight;
      if (smooth) {
        listRef.current.scrollTo({ top: target, behavior: "smooth" });
      } else {
        listRef.current.scrollTop = target;
      }
    };

    doScroll();

    // Re-check after paint & layout recalculation (for multi-line text, emojis, and bubbles)
    requestAnimationFrame(() => {
      doScroll();
      setTimeout(doScroll, 40);
      setTimeout(() => {
        if (listRef.current && isNearBottomRef.current) {
          listRef.current.scrollTop = listRef.current.scrollHeight;
          setShowScrollBottom(false);
        }
      }, 150);
    });
  }, []);

  // Messages count as read only while the list is really on screen, in a visible browser tab, scrolled to the end
  const isReadingNow = useCallback(() => {
    const el = listRef.current;
    if (!el || el.getClientRects().length === 0) return false;
    return document.visibilityState === "visible" && isNearBottomRef.current;
  }, []);

  const triggerMarkSeen = useCallback(() => {
    if (!roomId || !isReadingNow()) return;
    const lastOther = [...messages].reverse().find((m) => m.senderId !== user?.id);
    if (!lastOther || lastOther.id === lastMarkedIdRef.current) return;

    if (markSeenTimeoutRef.current) clearTimeout(markSeenTimeoutRef.current);
    markSeenTimeoutRef.current = setTimeout(() => {
      // Look again: the user may have switched away during the delay
      if (!isReadingNow()) return;
      lastMarkedIdRef.current = lastOther.id;
      backend.markChatSeen(roomId, lastOther.id).catch(() => {});
    }, 1200);
  }, [messages, roomId, user?.id, isReadingNow]);

  // The chat appears (tab switched, panel opened) or the browser tab returns to the foreground
  useEffect(() => {
    const el = listRef.current;
    const onVisible = () => triggerMarkSeen();
    document.addEventListener("visibilitychange", onVisible);
    let observer: IntersectionObserver | null = null;
    if (el && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) triggerMarkSeen();
      });
      observer.observe(el);
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      observer?.disconnect();
    };
  }, [triggerMarkSeen]);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // Generous threshold to avoid false "scrolled away" triggers during smooth movement
    const nearBottom = distanceToBottom < 120;
    isNearBottomRef.current = nearBottom;
    setShowScrollBottom(!nearBottom);

    if (nearBottom) {
      triggerMarkSeen();
    }
  };

  // Initial scroll and auto-scroll on new messages
  useEffect(() => {
    if (isNearBottomRef.current || messages.length <= 1) {
      scrollToBottom(true);
      triggerMarkSeen();
    }
  }, [messages.length, scrollToBottom, triggerMarkSeen]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (markSeenTimeoutRef.current) clearTimeout(markSeenTimeoutRef.current);
    };
  }, []);

  // Scroll to bottom on first load
  useEffect(() => {
    scrollToBottom(false);
  }, [scrollToBottom]);

  // Local preview of chosen image
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
      if (isMuted) return;
      if (!isAllowedChatImage(file)) {
        setError(t.chat.imageType);
        return;
      }
      setError(null);
      setImage(file);
      textareaRef.current?.focus();
    },
    [t.chat.imageType, isMuted]
  );

  const pickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isMuted) return;
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) attachFile(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (isMuted) return;
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

  const handleDragOver = (e: React.DragEvent) => {
    if (isMuted) return;
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
    if (isMuted) return;
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith("image/")) {
      attachFile(file);
    }
  };

  const handleStartReply = (m: ChatMessageDto) => {
    const parsed = parseMessageText(m.text);
    setReplyTo({
      id: m.id,
      senderName: m.senderName,
      text: parsed.body,
      attachmentPath: m.attachmentPath,
    });
    textareaRef.current?.focus();
  };

  const handleQuoteClick = (targetId: string) => {
    const targetEl = document.getElementById(`msg-${targetId}`);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedId(targetId);
      setTimeout(() => setHighlightedId(null), 1800);
    }
  };

  // Auto-resize textarea height as text lines expand or wrap
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = 140;
    const nextHeight = Math.min(maxHeight, Math.max(34, el.scrollHeight));
    el.style.height = `${nextHeight}px`;
    if (isNearBottomRef.current) {
      scrollToBottom(false);
    }
  }, [text, scrollToBottom]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isMuted) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (text.trim() || image) {
        const form = e.currentTarget.form;
        if (form) {
          form.requestSubmit();
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMuted) return;
    const trimmed = text.trim();
    if (!trimmed && !image) return;

    const finalText = replyTo
      ? `> [${replyTo.id}|${replyTo.senderName}]: ${replyTo.text.slice(0, 80).replace(/\n/g, " ") || (replyTo.attachmentPath ? t.chat.openImage : "")}\n${trimmed}`
      : trimmed;

    setError(null);
    setSending(true);
    try {
      await onSend(finalText, image);
      setText("");
      setImage(null);
      setReplyTo(null);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      isNearBottomRef.current = true;
      scrollToBottom(true);
    } catch (err: any) {
      const isMutedError =
        err?.code === "MUTED" ||
        err?.message === "MUTED" ||
        (typeof err?.message === "string" && err.message.includes("MUTED"));

      const isLinksNotAllowed =
        err?.code === "LINKS_NOT_ALLOWED" ||
        err?.message === "LINKS_NOT_ALLOWED" ||
        (typeof err?.message === "string" && err.message.includes("LINKS_NOT_ALLOWED"));

      if (isMutedError) {
        showToast(t.chat.mutedNotice, { id: "chat-muted-notice" });
        setError(t.chat.mutedNotice);
      } else if (isLinksNotAllowed) {
        showToast(t.chat.linksNotAllowed, { id: "chat-links-not-allowed" });
        setError(t.chat.linksNotAllowed);
      } else if (err instanceof ChatImageError) {
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
      {isDragging && (
        <div className={styles.dropOverlay}>
          <UploadCloud size={36} />
          <span>{t.chat.dropImage}</span>
        </div>
      )}

      <div
        className={styles.list}
        ref={listRef}
        role="log"
        aria-live="polite"
        onScroll={handleScroll}
      >
        {loading && (
          <div className={styles.skeletonList}>
            <Skeleton width="45%" shape="text" />
            <Skeleton width="75%" shape="text" />
            <Skeleton width="60%" shape="text" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className={styles.empty}>
            <MessageSquare size={26} className={styles.emptyIcon} />
            <p>{t.chat.empty}</p>
          </div>
        )}

        {messages.map((m, index) => {
          const isOwn = m.senderId === user?.id;
          const prevMsg = messages[index - 1];
          const nextMsg = messages[index + 1];

          const isSameSenderAbove = prevMsg && prevMsg.senderId === m.senderId;
          const isSameSenderBelow = nextMsg && nextMsg.senderId === m.senderId;

          const parsed = parseMessageText(m.text);
          const isHighlighted = highlightedId === m.id;

          const hasImage = Boolean(m.attachmentPath);
          const hasText = Boolean(parsed.body);
          const hasReply = Boolean(parsed.reply);
          const isImageOnly = hasImage && !hasText && !hasReply;

          const isRead = Boolean(
            participants?.some(
              (p) =>
                p.userId !== user?.id &&
                p.chatSeenAt &&
                new Date(p.chatSeenAt).getTime() >= new Date(m.createdAt).getTime()
            )
          );

          let groupClass = "";
          if (isSameSenderAbove && isSameSenderBelow) groupClass = styles.groupMiddle;
          else if (isSameSenderAbove) groupClass = styles.groupLast;
          else if (isSameSenderBelow) groupClass = styles.groupFirst;
          else groupClass = styles.groupSingle;

          return (
            <div
              key={m.id}
              id={`msg-${m.id}`}
              className={`${styles.messageRow} ${isOwn ? styles.ownRow : styles.otherRow} ${groupClass} ${isHighlighted ? styles.highlighted : ""}`}
            >
              {isImageOnly ? (
                <div
                  className={`${styles.bubble} ${isOwn ? styles.ownBubble : styles.otherBubble} ${styles.imageOnlyBubble}`}
                >
                  {!isOwn && !isSameSenderAbove && (
                    <span className={styles.imageSenderOverlay}>{m.senderName}</span>
                  )}
                  <ChatImage
                    path={m.attachmentPath!}
                    onOpen={setZoomUrl}
                    openLabel={t.chat.openImage}
                    className={styles}
                    onLoad={() => {
                      if (isNearBottomRef.current) scrollToBottom(true);
                    }}
                  />
                  <div className={styles.imageFloatingMeta}>
                    <span className={styles.time}>{formatMsgTime(m.createdAt)}</span>
                    {isOwn &&
                      (isRead ? (
                        <CheckCheck size={12} className={styles.checkIcon} />
                      ) : (
                        <Check size={12} className={styles.checkIcon} />
                      ))}
                  </div>
                </div>
              ) : (
                <div
                  className={`${styles.bubble} ${isOwn ? styles.ownBubble : styles.otherBubble} ${hasImage ? styles.withImageBubble : ""}`}
                >
                  {/* Sender name shown only on first message of the group */}
                  {!isOwn && !isSameSenderAbove && (
                    <span className={styles.senderName}>{m.senderName}</span>
                  )}

                  {/* Image attachment in multi-content bubble */}
                  {hasImage && (
                    <ChatImage
                      path={m.attachmentPath!}
                      onOpen={setZoomUrl}
                      openLabel={t.chat.openImage}
                      className={styles}
                      onLoad={() => {
                        if (isNearBottomRef.current) scrollToBottom(true);
                      }}
                    />
                  )}

                  {/* Reply quote banner inside message bubble */}
                  {parsed.reply && (
                    <button
                      type="button"
                      className={styles.quoteBlock}
                      onClick={() => handleQuoteClick(parsed.reply!.id)}
                      title={t.chat.reply}
                    >
                      <div className={styles.quoteStripe} />
                      <div className={styles.quoteBody}>
                        <span className={styles.quoteSender}>{parsed.reply.senderName}</span>
                        <span className={styles.quoteSnippet}>{parsed.reply.snippet}</span>
                      </div>
                    </button>
                  )}

                  {/* Message content: text and timestamp inline (Telegram style) */}
                  <div className={styles.textContainer}>
                    {parsed.body && <span className={styles.text}>{parsed.body}</span>}
                    <span className={styles.metaRow}>
                      <span className={styles.time}>{formatMsgTime(m.createdAt)}</span>
                      {isOwn &&
                        (isRead ? (
                          <CheckCheck size={12} className={styles.checkIcon} />
                        ) : (
                          <Check size={12} className={styles.checkIcon} />
                        ))}
                    </span>
                  </div>
                </div>
              )}

              {/* Hover action to reply */}
              <button
                type="button"
                className={styles.replyActionBtn}
                onClick={() => handleStartReply(m)}
                title={t.chat.reply}
                aria-label={t.chat.reply}
              >
                <Reply size={13} />
              </button>

              {!isOwn && onReportMessage && (
                <button
                  type="button"
                  className={styles.replyActionBtn}
                  onClick={() => onReportMessage(m.id)}
                  title={t.chat.report}
                  aria-label={t.chat.report}
                >
                  <Flag size={13} />
                </button>
              )}
            </div>
          );
        })}
        <div ref={bottomAnchorRef} className={styles.bottomAnchor} />
      </div>

      {/* Floating scroll to bottom button */}
      {showScrollBottom && (
        <button
          type="button"
          className={styles.scrollBottomBtn}
          onClick={() => {
            isNearBottomRef.current = true;
            scrollToBottom(true);
          }}
          aria-label="Scroll to bottom"
          title="Scroll to bottom"
        >
          <ChevronDown size={18} />
        </button>
      )}

      {/* Telegram-style Input Area */}
      <form onSubmit={handleSubmit} className={styles.form} onPaste={handlePaste}>
        {/* Reply preview bar */}
        {replyTo && (
          <div className={`${styles.replyBanner} motion-rise`}>
            <div className={styles.replyBannerStripe} />
            <div className={styles.replyBannerContent}>
              <div className={styles.replyBannerAuthor}>
                <Reply size={12} className={styles.replyBannerIcon} />
                <span>{t.chat.replyTo} {replyTo.senderName}</span>
              </div>
              <div className={styles.replyBannerSnippet}>
                {replyTo.text || (replyTo.attachmentPath ? t.chat.openImage : "")}
              </div>
            </div>
            <button
              type="button"
              className={styles.replyBannerClose}
              onClick={() => setReplyTo(null)}
              aria-label={t.chat.cancelReply}
              title={t.chat.cancelReply}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Image Attachment Preview */}
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

        {isMuted && (
          <div className={styles.mutedBanner} role="status">
            <MicOff size={13} />
            <span>{t.chat.youAreMuted}</span>
          </div>
        )}

        {/* Telegram-style expanding pill input container */}
        <div className={`${styles.inputContainer} ${isMuted ? styles.inputContainerMuted : ""}`}>
          <button
            type="button"
            className={styles.attachBtn}
            onClick={() => {
              if (!isMuted) fileRef.current?.click();
            }}
            disabled={isMuted}
            title={isMuted ? t.chat.youAreMuted : t.chat.attach}
            aria-label={isMuted ? t.chat.youAreMuted : t.chat.attach}
          >
            <ImagePlus size={18} />
          </button>

          <input
            ref={fileRef}
            type="file"
            accept={CHAT_IMAGE_MIME_TYPES.join(",")}
            onChange={pickImage}
            disabled={isMuted}
            hidden
          />

          <textarea
            ref={textareaRef}
            className={styles.input}
            rows={1}
            value={text}
            maxLength={CHAT_MAX_TEXT_LENGTH}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isMuted ? t.chat.youAreMuted : t.chat.placeholder}
            aria-label={isMuted ? t.chat.youAreMuted : t.chat.placeholder}
            disabled={isMuted || sending}
          />

          <button
            type="submit"
            className={`${styles.sendBtn} ${!isMuted && (text.trim() || image) ? styles.sendBtnActive : ""}`}
            disabled={isMuted || (!text.trim() && !image) || sending}
            title={isMuted ? t.chat.youAreMuted : t.chat.send}
            aria-label={isMuted ? t.chat.youAreMuted : t.chat.send}
          >
            <SendHorizontal size={17} />
          </button>
        </div>
      </form>

      {zoomUrl &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className={styles.lightbox}
            onClick={() => setZoomUrl(null)}
            role="dialog"
            aria-modal="true"
            aria-label={t.chat.openImage}
          >
            <button
              type="button"
              className={styles.close}
              aria-label={t.chat.close}
              onClick={() => setZoomUrl(null)}
            >
              <X size={20} />
            </button>
            <div className={styles.lightboxContent} onClick={(e) => e.stopPropagation()}>
              <img
                src={zoomUrl}
                alt=""
                className={styles.lightboxImg}
                referrerPolicy="no-referrer"
                onClick={() => setZoomUrl(null)}
              />
            </div>
          </div>,
          document.body
        )}
    </section>
  );
};
