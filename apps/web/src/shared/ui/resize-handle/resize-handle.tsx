import React, { useRef } from "react";
import styles from "./resize-handle.module.scss";

interface ResizeHandleProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onDragStart: (startX: number) => { move: (clientX: number) => void; end: () => void };
  onNudge: (delta: number) => void;
  className?: string;
}

/** A thin vertical grip between the content and a right-hand side panel. */
export const ResizeHandle: React.FC<ResizeHandleProps> = ({ label, value, min, max, onDragStart, onNudge, className }) => {
  const dragRef = useRef<ReturnType<ResizeHandleProps["onDragStart"]> | null>(null);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      className={`${styles.handle} ${className ?? ""}`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = onDragStart(e.clientX);
        document.body.style.userSelect = "none";
      }}
      onPointerMove={(e) => dragRef.current?.move(e.clientX)}
      onPointerUp={() => {
        dragRef.current?.end();
        dragRef.current = null;
        document.body.style.userSelect = "";
      }}
      onPointerCancel={() => {
        dragRef.current?.end();
        dragRef.current = null;
        document.body.style.userSelect = "";
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onNudge(24);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          onNudge(-24);
        }
      }}
    >
      <span className={styles.grip} />
    </div>
  );
};
