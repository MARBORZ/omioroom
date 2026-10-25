import React, { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Trash2, Upload } from "lucide-react";
import { useSession } from "../../../app/providers/session-context.js";
import { Button } from "../../../shared/ui/button/button.js";
import { TextField } from "../../../shared/ui/text-field/text-field.js";
import { Loader } from "../../../shared/ui/loader/loader.js";
import { showToast } from "../../../shared/ui/toast/toast.js";
import { deleteVideo, listVideos, uploadVideo, type StoredVideo } from "../../../shared/api/videos.js";
import styles from "./dashboard-page.module.scss";

/** The dashboard lives at /dashboard and at the root of a dashboard.* host. */
export function isDashboardLocation(loc: Pick<Location, "hostname" | "pathname"> = window.location): boolean {
  return loc.hostname.startsWith("dashboard.") || loc.pathname.replace(/\/+$/, "") === "/dashboard";
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} ГБ`;
  return `${(bytes / 1024 ** 2).toFixed(1)} МБ`;
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
  const [videos, setVideos] = useState<StoredVideo[] | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadName, setUploadName] = useState("");
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

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploadName(file.name);
    setProgress(0);
    try {
      await uploadVideo(file, setProgress);
      showToast("Видео загружено");
      await refresh();
    } catch (err: any) {
      showToast(err?.message ?? "Не удалось загрузить");
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (video: StoredVideo) => {
    if (!window.confirm(`Удалить «${video.name}»?`)) return;
    try {
      await deleteVideo(video.name);
      setVideos((list) => list?.filter((v) => v.name !== video.name) ?? null);
    } catch (err: any) {
      showToast(err?.message ?? "Не удалось удалить");
    }
  };

  const copy = async (video: StoredVideo) => {
    await navigator.clipboard.writeText(video.url).catch(() => {});
    showToast("Ссылка скопирована");
  };

  return (
    <>
      <div className={styles.card}>
        <h2 className={styles.subtitle}>Загрузка</h2>
        <p className={styles.hint}>MP4 или WebM (H.264/AAC для лучшей совместимости). Файл попадает в бакет videos.</p>
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/webm"
          hidden
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        <Button
          variant="primary"
          icon={<Upload size={16} />}
          disabled={progress !== null}
          onClick={() => inputRef.current?.click()}
        >
          Выбрать видео
        </Button>
        {progress !== null && (
          <div className={styles.progress} role="progressbar" aria-valuenow={Math.round(progress * 100)}>
            <div className={styles.progressBar} style={{ width: `${progress * 100}%` }} />
            <span className={styles.progressLabel}>
              {uploadName} · {Math.round(progress * 100)}%
            </span>
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
              <li key={v.name} className={styles.item}>
                <div className={styles.itemInfo}>
                  <span className={styles.itemName}>{v.name}</span>
                  <span className={styles.itemMeta}>{v.size ? formatSize(v.size) : ""}</span>
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
