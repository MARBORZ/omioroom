import React, { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Trash2, Upload } from "lucide-react";
import { useSession } from "../../../app/providers/session-context.js";
import { Button } from "../../../shared/ui/button/button.js";
import { TextField } from "../../../shared/ui/text-field/text-field.js";
import { Loader } from "../../../shared/ui/loader/loader.js";
import { showToast } from "../../../shared/ui/toast/toast.js";
import { deleteVideo, listVideos, titleFromFileName, uploadVideo, type Video } from "../../../shared/api/videos.js";
import { formatDuration, formatFileSize } from "../../../shared/lib/format-duration.js";
import styles from "./dashboard-page.module.scss";

/** The dashboard lives at /dashboard and at the root of a dashboard.* host. */
export function isDashboardLocation(loc: Pick<Location, "hostname" | "pathname"> = window.location): boolean {
  return loc.hostname.startsWith("dashboard.") || loc.pathname.replace(/\/+$/, "") === "/dashboard";
}

const SignIn: React.FC = () => {
  const { login } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      localStorage.setItem("omioroom_identity_chosen", "true");
    } catch (err: any) {
      setError(err?.message ?? "Не удалось войти");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className={styles.card} onSubmit={submit}>
      <h1 className={styles.title}>Вход для администратора</h1>
      <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <TextField
        label="Пароль"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={error ?? undefined}
      />
      <Button type="submit" variant="primary" loading={loading} disabled={!email.trim() || !password}>
        Войти
      </Button>
    </form>
  );
};

const Library: React.FC = () => {
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setVideos(await listVideos());
    } catch (err: any) {
      showToast(err?.message ?? "Не удалось загрузить список");
      setVideos([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const choose = (f: File | undefined) => {
    setFile(f ?? null);
    setTitle(f ? titleFromFileName(f.name) : "");
  };

  const upload = async () => {
    if (!file) return;
    setProgress(0);
    try {
      await uploadVideo(file, title, setProgress);
      showToast("Видео загружено");
      setFile(null);
      setTitle("");
      if (inputRef.current) inputRef.current.value = "";
      await refresh();
    } catch (err: any) {
      showToast(err?.message ?? "Не удалось загрузить");
    } finally {
      setProgress(null);
    }
  };

  const remove = async (video: Video) => {
    if (!window.confirm(`Удалить «${video.title}»?`)) return;
    try {
      await deleteVideo(video);
      setVideos((list) => list?.filter((v) => v.id !== video.id) ?? null);
    } catch (err: any) {
      showToast(err?.message ?? "Не удалось удалить");
    }
  };

  const copy = async (video: Video) => {
    await navigator.clipboard.writeText(video.url).catch(() => {});
    showToast("Ссылка скопирована");
  };

  const uploading = progress !== null;
  return (
    <>
      <div className={styles.card}>
        <h2 className={styles.subtitle}>Загрузка</h2>
        <p className={styles.hint}>MP4 или WebM (H.264/AAC для лучшей совместимости). Превью и длительность определяются автоматически.</p>
        <input ref={inputRef} type="file" accept="video/mp4,video/webm" hidden onChange={(e) => choose(e.target.files?.[0])} />
        <Button icon={<Upload size={16} />} disabled={uploading} onClick={() => inputRef.current?.click()}>
          {file ? file.name : "Выбрать видео"}
        </Button>
        {file && (
          <>
            <TextField label="Название" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} disabled={uploading} />
            <Button variant="primary" loading={uploading} disabled={!title.trim()} onClick={() => void upload()}>
              Загрузить
            </Button>
          </>
        )}
        {uploading && (
          <div className={styles.progress} role="progressbar" aria-valuenow={Math.round(progress * 100)}>
            <div className={styles.progressBar} style={{ width: `${progress * 100}%` }} />
            <span className={styles.progressLabel}>{Math.round(progress * 100)}%</span>
          </div>
        )}
      </div>

      <div className={styles.card}>
        <h2 className={styles.subtitle}>Библиотека</h2>
        {videos === null ? (
          <Loader size="sm" />
        ) : videos.length === 0 ? (
          <p className={styles.hint}>Пока пусто.</p>
        ) : (
          <ul className={styles.list}>
            {videos.map((v) => (
              <li key={v.id} className={styles.item}>
                <span className={styles.thumb}>{v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" loading="lazy" />}</span>
                <div className={styles.itemInfo}>
                  <span className={styles.itemName}>{v.title}</span>
                  <span className={styles.itemMeta}>
                    {[formatDuration(v.durationSeconds), formatFileSize(v.sizeBytes), new Date(v.createdAt).toLocaleDateString("ru-RU")]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={() => void copy(v)} aria-label="Скопировать ссылку" />
                <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={() => void remove(v)} aria-label="Удалить" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
};

export const DashboardPage: React.FC = () => {
  const { user, sessionReady, signOut } = useSession();

  useEffect(() => {
    document.title = "Dashboard";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  if (!sessionReady) {
    return (
      <div className={styles.page}>
        <Loader size="md" />
      </div>
    );
  }

  const isAdmin = user?.role === "admin";
  return (
    <div className={styles.page}>
      <div className={styles.column}>
        {isAdmin ? (
          <>
            <div className={styles.header}>
              <h1 className={styles.title}>Dashboard</h1>
              <Button variant="ghost" size="sm" onClick={() => void signOut()}>
                Выйти
              </Button>
            </div>
            <Library />
          </>
        ) : user && user.kind === "registered" ? (
          <div className={styles.card}>
            <h1 className={styles.title}>Нет доступа</h1>
            <p className={styles.hint}>У аккаунта {user.displayName} нет прав администратора.</p>
            <Button onClick={() => void signOut()}>Выйти</Button>
          </div>
        ) : (
          <SignIn />
        )}
      </div>
    </div>
  );
};
