import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { ImagePlus, SendHorizontal, X, UploadCloud, MessageSquare, Reply, ChevronDown, Check, CheckCheck, MicOff, Flag, Trash2, Clock, Copy } from "lucide-react";
import { CHAT_MAX_TEXT_LENGTH, CHAT_IMAGE_MIME_TYPES, type ChatMessageDto, type ParticipantDto } from "@omioroom/contracts";
import { useSession } from "../../../app/providers/session-context.js";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { useSettings } from "../../../shared/lib/settings/index.js";
import { playNotificationSound } from "../../../shared/lib/sound/chat-sound.js";
import { showToast } from "../../../shared/ui/toast/toast.js";
import { ChatImageError, isAllowedChatImage } from "../../../shared/lib/image/prepare-chat-image.js";
import { backend } from "../../../shared/api/backend.js";
import { ChatImage } from "./chat-image.js";
import styles from "./room-chat.module.scss";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🔥", "😮", "😢"] as const;

interface RoomChatProps {
  messages: ChatMessageDto[];
  loading?: boolean;
  onSend: (text: string, image: File | null) => Promise<void>;
  participants?: ParticipantDto[];
  roomId?: string;
  isMuted?: boolean;
  onReportMessage?: (messageId: string) => void;
  onToggleReaction?: (messageId: string, emoji: string) => Promise<void>;
  onDeleteMessage?: (messageId: string) => Promise<void>;
  isOwner?: boolean;
  canControl?: boolean;
  /** Names of the people typing right now (already limited to when this chat is on screen). */
  typingNames?: string[];
  /** Called with true while the user is typing (throttled) and false when they stop or send. */
  onTypingChange?: (typing: boolean) => void;
}

interface ReplyState {
  id: string;
  senderName: string;
  text: string;
  attachmentPath: string | null;
}

interface PendingMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  localPreviewUrl?: string | null;
  hasImage: boolean;
  createdAt: string;
  isUploading?: boolean;
}

interface ParsedMessage {
  reply?: {
    id: string;
    senderName: string;
    snippet: string;
  };
  body: string;
}

const REPLY_HEADER_REGEX = /^> \[([a-zA-Z0-9_-]+)\|([^\]]+)\]: ([^\n]*)(?:\n([\s\S]*))?$/;

export function parseMessageText(rawText: string): ParsedMessage {
  const match = rawText.match(REPLY_HEADER_REGEX);
  if (match) {
    const [, id, senderName, snippet, body = ""] = match;
    return {
      reply: { id, senderName, snippet },
      body,
    };
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
  typingNames = [],
  onTypingChange,
  onReportMessage,
  onToggleReaction,
  onDeleteMessage,
  isOwner = false,
  canControl = false,
}) => {
  const { user } = useSession();
  const { t } = useI18n();
  const { soundNotifications } = useSettings();

  const prevMessageIdsRef = useRef<Set<string>>(new Set(messages.map((m) => m.id)));
  const initialLoadedRef = useRef(false);
  const renderedMessageIdsRef = useRef<Set<string>>(new Set());
  const sentMessageTextsRef = useRef<Set<string>>(new Set());

  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [quickReactionEffect, setQuickReactionEffect] = useState<{ id: string; emoji: string } | null>(null);
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reconcile pending optimistic messages as real messages arrive from realtime
  useEffect(() => {
    setPendingMessages((prev) => {
      if (prev.length === 0) return prev;
      return prev.filter((p) => {
        const found = messages.some(
          (m) =>
            m.senderId === p.senderId &&
            (m.text === p.text ||
              (p.hasImage &&
                Boolean(m.attachmentPath) &&
                Math.abs(new Date(m.createdAt).getTime() - new Date(p.createdAt).getTime()) < 35000))
        );
        if (found) {
          if (p.localPreviewUrl) URL.revokeObjectURL(p.localPreviewUrl);
          return false;
        }
        return true;
      });
    });
  }, [messages]);

  // The action bar (reactions, reply, copy...) opens on right-click, or on a long press on touch screens, as in Telegram
  const barOpenedAtRef = useRef(0);
  const messagePressRef = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  // The pressed bubble sinks slightly while a finger holds it, then springs back (as in Telegram)
  const [pressedId, setPressedId] = useState<string | null>(null);
  const openActionBar = useCallback((msgId: string) => {
    barOpenedAtRef.current = Date.now();
    setPressedId(null);
    setActiveMessageId(msgId);
    try {
      navigator.vibrate?.(8);
    } catch {
      // vibration is optional
    }
  }, []);
  const cancelMessagePress = useCallback(() => {
    if (messagePressRef.current) clearTimeout(messagePressRef.current.timer);
    messagePressRef.current = null;
    setPressedId(null);
  }, []);
  const PRESS_SKIP = `a, input, textarea, .${styles.actionBar}, .${styles.reactionBadge}, .${styles.reactionStack}`;
  const handleMessageContextMenu = useCallback(
    (e: React.MouseEvent, msgId: string) => {
      if ((e.target as HTMLElement | null)?.closest(PRESS_SKIP)) return;
      e.preventDefault();
      openActionBar(msgId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openActionBar]
  );
  const handleMessagePressStart = useCallback(
    (e: React.PointerEvent, msgId: string) => {
      if (e.pointerType === "mouse") return;
      if ((e.target as HTMLElement | null)?.closest(PRESS_SKIP)) return;
      cancelMessagePress();
      setPressedId(msgId);
      messagePressRef.current = {
        x: e.clientX,
        y: e.clientY,
        timer: setTimeout(() => {
          messagePressRef.current = null;
          openActionBar(msgId);
        }, 480),
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openActionBar, cancelMessagePress]
  );
  const handleMessagePressMove = useCallback(
    (e: React.PointerEvent) => {
      const press = messagePressRef.current;
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) cancelMessagePress();
    },
    [cancelMessagePress]
  );

  const handleMessageTap = useCallback(
    (e: React.MouseEvent, msgId: string) => {
      // Don't trigger if clicked on an interactive child
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          `button, a, input, textarea, .${styles.actionBar}, .${styles.quoteBlock}, .${styles.imageButton}, .${styles.reactionBadge}`
        )
      ) {
        return;
      }

      const now = Date.now();
      const last = lastTapRef.current;

      if (last && last.id === msgId && now - last.time < 320) {
        // Double-tap or double-click detected: quick reaction like Telegram (👍)
        if (tapTimerRef.current) {
          clearTimeout(tapTimerRef.current);
          tapTimerRef.current = null;
        }
        lastTapRef.current = null;

        void onToggleReaction?.(msgId, "👍");

        setQuickReactionEffect({ id: msgId, emoji: "👍" });
        setTimeout(() => setQuickReactionEffect(null), 850);
        return;
      }

      lastTapRef.current = { id: msgId, time: now };
    },
    [onToggleReaction]
  );

  useEffect(() => {
    const handleOutsideClick = () => {
      // The click that ends a long press must not close the bar it just opened
      if (Date.now() - barOpenedAtRef.current < 500) return;
      setActiveMessageId(null);
      setConfirmDeleteId(null);
    };
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, []);

  // Play subtle notification sound when new message arrives from another user
  useEffect(() => {
    if (!initialLoadedRef.current) {
      initialLoadedRef.current = true;
      prevMessageIdsRef.current = new Set(messages.map((m) => m.id));
      return;
    }

    const newFromOthers = messages.filter(
      (m) => !prevMessageIdsRef.current.has(m.id) && m.senderId !== user?.id
    );

    prevMessageIdsRef.current = new Set(messages.map((m) => m.id));

    if (newFromOthers.length > 0 && soundNotifications) {
      playNotificationSound();
    }
  }, [messages, user?.id, soundNotifications]);

  const [text, setText] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  // Who reacted: the message whose reactions are open in the sheet, and the emoji filter inside it
  const [reactionSheetId, setReactionSheetId] = useState<string | null>(null);
  const [reactionFilter, setReactionFilter] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressedRef = useRef(false);
  const nameOf = useCallback(
    (userId: string) =>
      userId === user?.id
        ? t.chat.reactionsYou
        : participants?.find((p) => p.userId === userId)?.displayName ?? t.chat.unknownMember,
    [participants, user?.id, t.chat.reactionsYou, t.chat.unknownMember]
  );
  const openReactionSheet = useCallback((messageId: string, emoji: string | null = null) => {
    setReactionFilter(emoji);
    setReactionSheetId(messageId);
  }, []);
  useEffect(() => {
    if (!reactionSheetId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setReactionSheetId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reactionSheetId]);
  const [isDragging, setIsDragging] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyState | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // "Typing" is announced at most every 2.5 s while text is being entered, and withdrawn when it stops
  const lastTypingSentRef = useRef(0);
  const typingActiveRef = useRef(false);
  const typingIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifyTyping = useCallback(
    (active: boolean) => {
      if (!onTypingChange) return;
      if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
      typingIdleRef.current = null;
      if (!active) {
        if (typingActiveRef.current) onTypingChange(false);
        typingActiveRef.current = false;
        lastTypingSentRef.current = 0;
        return;
      }
      const now = Date.now();
      if (!typingActiveRef.current || now - lastTypingSentRef.current > 2500) {
        onTypingChange(true);
        typingActiveRef.current = true;
        lastTypingSentRef.current = now;
      }
      typingIdleRef.current = setTimeout(() => notifyTyping(false), 4000);
    },
    [onTypingChange]
  );
  useEffect(() => () => {
    if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
  }, []);
  const isNearBottomRef = useRef(true);
  const lastMarkedIdRef = useRef<string | null>(null);
  const markSeenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = listRef.current;
    if (!el) return;

    isNearBottomRef.current = true;
    setShowScrollBottom(false);

    if (smooth) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else {
      el.scrollTop = el.scrollHeight;
    }
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
    }, 150);
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
      if (sending) return;
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
    if (isMuted || sending) return;
    const trimmed = text.trim();
    if (!trimmed && !image) return;
    notifyTyping(false);

    let quoteSnippet = "";
    if (replyTo) {
      const cleanSnippetText = replyTo.text.slice(0, 80).replace(/\n/g, " ").trim();
      if (replyTo.attachmentPath && cleanSnippetText) {
        quoteSnippet = `📷 ${cleanSnippetText}`;
      } else if (replyTo.attachmentPath) {
        quoteSnippet = `📷 ${t.chat.photo}`;
      } else {
        quoteSnippet = cleanSnippetText;
      }
    }

    const finalText = replyTo
      ? `> [${replyTo.id}|${replyTo.senderName}]: ${quoteSnippet}\n${trimmed}`
      : trimmed;

    const currentImage = image;
    const pendingId = `pending-${Date.now()}`;
    const localPreviewUrl = currentImage ? URL.createObjectURL(currentImage) : null;

    const pendingMsg: PendingMessage = {
      id: pendingId,
      senderId: user?.id ?? "me",
      senderName: user?.displayName || "You",
      text: finalText,
      localPreviewUrl,
      hasImage: Boolean(currentImage),
      createdAt: new Date().toISOString(),
      isUploading: Boolean(currentImage),
    };

    sentMessageTextsRef.current.add(finalText);
    setPendingMessages((prev) => [...prev, pendingMsg]);

    // Clear input immediately so user can type next message instantly without interruption
    setText("");
    setImage(null);
    setReplyTo(null);

    // Scroll to bottom immediately with Apple spring feel
    isNearBottomRef.current = true;
    scrollToBottom(true);

    // Keep focus explicitly on the textarea
    textareaRef.current?.focus();

    setError(null);
    // Text goes out without blocking the next message (the server rate-limits); only an image upload is exclusive
    if (currentImage) setSending(true);
    try {
      await onSend(finalText, currentImage);
      isNearBottomRef.current = true;
      scrollToBottom(true);

      // Failsafe cleanup in case realtime event was delayed
      setTimeout(() => {
        setPendingMessages((prev) => {
          const remaining = prev.filter((p) => p.id !== pendingId);
          if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
          return remaining;
        });
      }, 4000);
    } catch (err: any) {
      setPendingMessages((prev) => {
        if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
        return prev.filter((p) => p.id !== pendingId);
      });

      // Restore text only if user hasn't typed anything new in the meantime
      setText((prev) => (prev ? prev : trimmed));
      if (currentImage) setImage(currentImage);

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
      // Ensure focus remains on textarea after submission completes
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
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
          <div className={styles.skeletonList} aria-label="Loading messages">
            <div className={`${styles.skeletonRow} ${styles.skeletonRowOther}`}>
              <div className={`${styles.skeletonBubble} ${styles.skeletonBubbleOther}`} style={{ width: "55%", height: "42px" }} />
            </div>
            <div className={`${styles.skeletonRow} ${styles.skeletonRowOwn}`}>
              <div className={`${styles.skeletonBubble} ${styles.skeletonBubbleOwn}`} style={{ width: "42%", height: "38px" }} />
            </div>
            <div className={`${styles.skeletonRow} ${styles.skeletonRowOther}`}>
              <div className={`${styles.skeletonBubble} ${styles.skeletonBubbleOther}`} style={{ width: "68%", height: "148px", borderRadius: "18px" }} />
            </div>
            <div className={`${styles.skeletonRow} ${styles.skeletonRowOwn}`}>
              <div className={`${styles.skeletonBubble} ${styles.skeletonBubbleOwn}`} style={{ width: "48%", height: "38px" }} />
            </div>
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

          const isNew = !renderedMessageIdsRef.current.has(m.id) && initialLoadedRef.current;
          if (!renderedMessageIdsRef.current.has(m.id)) {
            renderedMessageIdsRef.current.add(m.id);
          }

          const wasOptimistic = isOwn && sentMessageTextsRef.current.has(m.text);
          if (wasOptimistic) {
            sentMessageTextsRef.current.delete(m.text);
          }
          const shouldAnimate = isNew && !wasOptimistic;

          const hasReactions = m.reactions && Object.keys(m.reactions).length > 0;
          const isConfirmingDelete = confirmDeleteId === m.id;

          return (
            <div
              key={m.id}
              id={`msg-${m.id}`}
              className={`${styles.messageRow} ${isOwn ? styles.ownRow : styles.otherRow} ${shouldAnimate ? (isOwn ? styles.ownNew : styles.otherNew) : ""} ${groupClass} ${isHighlighted ? styles.highlighted : ""}`}
              data-pressed={pressedId === m.id ? "true" : undefined}
              onClick={(e) => handleMessageTap(e, m.id)}
              onContextMenu={(e) => handleMessageContextMenu(e, m.id)}
              onPointerDown={(e) => handleMessagePressStart(e, m.id)}
              onPointerMove={handleMessagePressMove}
              onPointerUp={cancelMessagePress}
              onPointerCancel={cancelMessagePress}
              onPointerLeave={cancelMessagePress}
            >
              <div className={`${styles.bubbleWrapper} ${isOwn ? styles.bubbleWrapperOwn : styles.bubbleWrapperOther}`}>
                {/* Double-tap burst reaction animation */}
                {quickReactionEffect?.id === m.id && (
                  <div className={styles.doubleTapBurst}>
                    <span className={styles.doubleTapEmoji}>{quickReactionEffect.emoji}</span>
                  </div>
                )}
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

                    {/* Reply quote banner inside message bubble (placed at top of bubble) */}
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

                {/* Reaction badges under bubble: a few show as chips, many collapse into one stack that opens the list */}
                {hasReactions && (() => {
                  const entries = Object.entries(m.reactions).filter(([, uids]) => uids && uids.length > 0);
                  if (entries.length === 0) return null;
                  const total = entries.reduce((n, [, uids]) => n + uids.length, 0);
                  const mine = entries.some(([, uids]) => Boolean(user?.id && uids.includes(user.id)));
                  if (entries.length > 3) {
                    const top = [...entries].sort((x, y) => y[1].length - x[1].length).slice(0, 3);
                    return (
                      <div className={`${styles.reactionsRow} ${isOwn ? styles.reactionsRowOwn : ""}`}>
                        <button
                          type="button"
                          className={`${styles.reactionStack} ${mine ? styles.reactionBadgeActive : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openReactionSheet(m.id);
                          }}
                          aria-label={`${t.chat.reactionsTitle}: ${total}`}
                          title={`${t.chat.reactionsTitle}: ${total}`}
                        >
                          <span className={styles.reactionStackEmojis}>
                            {top.map(([emoji]) => (
                              <span key={emoji} className={styles.reactionStackEmoji}>
                                {emoji}
                              </span>
                            ))}
                          </span>
                          <span className={styles.reactionCount}>{total}</span>
                        </button>
                      </div>
                    );
                  }
                  return (
                    <div className={`${styles.reactionsRow} ${isOwn ? styles.reactionsRowOwn : ""}`}>
                      {entries.map(([emoji, uids]) => {
                        const hasReacted = Boolean(user?.id && uids.includes(user.id));
                        const startLongPress = () => {
                          longPressedRef.current = false;
                          if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                          longPressTimerRef.current = setTimeout(() => {
                            longPressedRef.current = true;
                            openReactionSheet(m.id, emoji);
                          }, 450);
                        };
                        const cancelLongPress = () => {
                          if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                          longPressTimerRef.current = null;
                        };
                        return (
                          <button
                            key={emoji}
                            type="button"
                            className={`${styles.reactionBadge} ${hasReacted ? styles.reactionBadgeActive : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              // A long press already opened the list: do not also toggle the reaction
                              if (longPressedRef.current) {
                                longPressedRef.current = false;
                                return;
                              }
                              onToggleReaction?.(m.id, emoji);
                            }}
                            onPointerDown={startLongPress}
                            onPointerUp={cancelLongPress}
                            onPointerLeave={cancelLongPress}
                            onPointerCancel={cancelLongPress}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openReactionSheet(m.id, emoji);
                            }}
                            title={`${emoji} ${uids.map(nameOf).join(", ")}`}
                          >
                            <span className={styles.reactionEmoji}>{emoji}</span>
                            <span className={styles.reactionCount}>{uids.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Floating action bar: Reactions + Reply + Delete + Report */}
              <div
                className={`${styles.actionBar} ${activeMessageId === m.id ? styles.actionBarActive : ""}`}
                onClick={(e) => e.stopPropagation()}
              >
                {isConfirmingDelete ? (
                  <div className={styles.deleteConfirmBanner}>
                    <span className={styles.deleteConfirmText}>{t.chat.deleteConfirm}</span>
                    <button
                      type="button"
                      className={styles.deleteConfirmYes}
                      onClick={() => {
                        setConfirmDeleteId(null);
                        onDeleteMessage?.(m.id);
                      }}
                    >
                      {t.chat.delete}
                    </button>
                    <button
                      type="button"
                      className={styles.deleteConfirmNo}
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      {t.chat.close}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className={styles.reactionPicker}>
                      {QUICK_EMOJIS.map((emoji) => {
                        const uids = m.reactions?.[emoji] ?? [];
                        const hasReacted = Boolean(user?.id && uids.includes(user.id));
                        return (
                          <button
                            key={emoji}
                            type="button"
                            className={`${styles.emojiBtn} ${hasReacted ? styles.emojiBtnActive : ""}`}
                            onClick={() => onToggleReaction?.(m.id, emoji)}
                            title={emoji}
                            aria-label={emoji}
                          >
                            {emoji}
                          </button>
                        );
                      })}
                    </div>
                    <div className={styles.actionDivider} />
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={() => handleStartReply(m)}
                      title={t.chat.reply}
                      aria-label={t.chat.reply}
                    >
                      <Reply size={13} />
                    </button>
                    {parsed.body && (
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => {
                          void navigator.clipboard?.writeText(parsed.body).then(() => showToast(t.common.copied, { id: "chat-copied" })).catch(() => {});
                          setActiveMessageId(null);
                        }}
                        title={t.chat.copy}
                        aria-label={t.chat.copy}
                      >
                        <Copy size={13} />
                      </button>
                    )}
                    {(isOwn || isOwner || canControl) && onDeleteMessage && (
                      <button
                        type="button"
                        className={`${styles.actionBtn} ${styles.deleteBtn}`}
                        onClick={() => setConfirmDeleteId(m.id)}
                        title={t.chat.delete}
                        aria-label={t.chat.delete}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                    {!isOwn && onReportMessage && (
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => onReportMessage(m.id)}
                        title={t.chat.report}
                        aria-label={t.chat.report}
                      >
                        <Flag size={13} />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}

        {/* Optimistic pending messages (smooth Apple bubble glide-in) */}
        {pendingMessages
          .filter(
            (p) =>
              !messages.some(
                (m) =>
                  m.senderId === p.senderId &&
                  (m.text === p.text ||
                    (p.hasImage &&
                      Boolean(m.attachmentPath) &&
                      Math.abs(new Date(m.createdAt).getTime() - new Date(p.createdAt).getTime()) < 35000))
              )
          )
          .map((p) => {
          const parsed = parseMessageText(p.text);
          const isImageOnly = p.hasImage && !parsed.body && !parsed.reply;
          return (
            <div
              key={p.id}
              id={`msg-${p.id}`}
              className={`${styles.messageRow} ${styles.ownRow} ${styles.ownNew} ${styles.groupSingle} ${styles.pendingRow}`}
            >
              <div className={`${styles.bubbleWrapper} ${styles.bubbleWrapperOwn}`}>
                {isImageOnly ? (
                  <div
                    className={`${styles.bubble} ${styles.ownBubble} ${styles.imageOnlyBubble} ${styles.pendingBubble}`}
                  >
                    <ChatImage
                      previewUrl={p.localPreviewUrl}
                      isUploading={p.isUploading}
                      openLabel={t.chat.openImage}
                      className={styles}
                    />
                    <div className={styles.imageFloatingMeta}>
                      <span className={styles.time}>{formatMsgTime(p.createdAt)}</span>
                      <Clock size={11} className={styles.pendingClockIcon} />
                    </div>
                  </div>
                ) : (
                  <div
                    className={`${styles.bubble} ${styles.ownBubble} ${p.hasImage ? styles.withImageBubble : ""} ${styles.pendingBubble}`}
                  >
                    {parsed.reply && (
                      <div className={styles.quoteBlock}>
                        <div className={styles.quoteStripe} />
                        <div className={styles.quoteBody}>
                          <span className={styles.quoteSender}>{parsed.reply.senderName}</span>
                          <span className={styles.quoteSnippet}>{parsed.reply.snippet}</span>
                        </div>
                      </div>
                    )}

                    {p.hasImage && (
                      <ChatImage
                        previewUrl={p.localPreviewUrl}
                        isUploading={p.isUploading}
                        openLabel={t.chat.openImage}
                        className={styles}
                      />
                    )}

                    <div className={styles.textContainer}>
                      {parsed.body && <span className={styles.text}>{parsed.body}</span>}
                      <span className={styles.metaRow}>
                        <span className={styles.time}>{formatMsgTime(p.createdAt)}</span>
                        <Clock size={11} className={styles.pendingClockIcon} />
                      </span>
                    </div>
                  </div>
                )}
              </div>
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

      {typingNames.length > 0 && (
        <div className={styles.typingLabel} role="status" aria-live="polite">
          <span className={styles.typingDots} aria-hidden>
            <i />
            <i />
            <i />
          </span>
          {typingNames.length === 1
            ? t.chat.typingOne.replace("{name}", typingNames[0]!)
            : typingNames.length === 2
              ? t.chat.typingTwo.replace("{a}", typingNames[0]!).replace("{b}", typingNames[1]!)
              : t.chat.typingMany}
        </div>
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
                {replyTo.attachmentPath && !replyTo.text
                  ? `📷 ${t.chat.photo}`
                  : replyTo.attachmentPath
                  ? `📷 ${replyTo.text}`
                  : replyTo.text}
              </div>
            </div>
            {replyTo.attachmentPath && (
              <div className={styles.replyBannerThumb}>
                <ChatImage
                  path={replyTo.attachmentPath}
                  onOpen={setZoomUrl}
                  openLabel={t.chat.openImage}
                  className={styles}
                />
              </div>
            )}
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
            onChange={(e) => {
              setText(e.target.value);
              notifyTyping(e.target.value.trim().length > 0);
            }}
            onBlur={() => notifyTyping(false)}
            onKeyDown={handleKeyDown}
            placeholder={isMuted ? t.chat.youAreMuted : t.chat.placeholder}
            aria-label={isMuted ? t.chat.youAreMuted : t.chat.placeholder}
            disabled={isMuted}
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

      {reactionSheetId && (() => {
        const target = messages.find((x) => x.id === reactionSheetId);
        const entries = Object.entries(target?.reactions ?? {}).filter(([, uids]) => uids && uids.length > 0);
        if (!target || entries.length === 0) return null;
        const total = entries.reduce((n, [, uids]) => n + uids.length, 0);
        const rows = entries
          .filter(([emoji]) => reactionFilter === null || emoji === reactionFilter)
          .flatMap(([emoji, uids]) => uids.map((uid) => ({ emoji, uid })));
        return (
          <div className={styles.reactionSheetBackdrop} onClick={() => setReactionSheetId(null)}>
            <div
              className={styles.reactionSheet}
              role="dialog"
              aria-label={t.chat.reactionsTitle}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.reactionSheetGrip} aria-hidden />
              <div className={styles.reactionSheetHead}>
                <span className={styles.reactionSheetTitle}>{t.chat.reactionsTitle}</span>
                <button
                  type="button"
                  className={styles.reactionSheetClose}
                  onClick={() => setReactionSheetId(null)}
                  aria-label={t.chat.reactionsClose}
                >
                  <X size={16} />
                </button>
              </div>
              <div className={styles.reactionSheetTabs} role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={reactionFilter === null}
                  className={`${styles.reactionSheetTab} ${reactionFilter === null ? styles.reactionSheetTabActive : ""}`}
                  onClick={() => setReactionFilter(null)}
                >
                  {t.chat.reactionsAll} {total}
                </button>
                {entries.map(([emoji, uids]) => (
                  <button
                    key={emoji}
                    type="button"
                    role="tab"
                    aria-selected={reactionFilter === emoji}
                    className={`${styles.reactionSheetTab} ${reactionFilter === emoji ? styles.reactionSheetTabActive : ""}`}
                    onClick={() => setReactionFilter(emoji)}
                  >
                    {emoji} {uids.length}
                  </button>
                ))}
              </div>
              <ul className={styles.reactionSheetList}>
                {rows.map(({ emoji, uid }) => {
                  const isMine = uid === user?.id;
                  const name = nameOf(uid);
                  return (
                    <li key={`${emoji}-${uid}`}>
                      <button
                        type="button"
                        className={styles.reactionSheetRow}
                        disabled={!isMine}
                        title={isMine ? t.chat.reactionsRemoveHint : undefined}
                        onClick={() => {
                          if (isMine) void onToggleReaction?.(target.id, emoji);
                        }}
                      >
                        <span className={styles.reactionSheetAvatar}>{(name.trim()[0] ?? "?").toUpperCase()}</span>
                        <span className={styles.reactionSheetName}>
                          {name}
                          {isMine && <span className={styles.reactionSheetHint}>{t.chat.reactionsRemoveHint}</span>}
                        </span>
                        <span className={styles.reactionSheetEmoji}>{emoji}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        );
      })()}

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
