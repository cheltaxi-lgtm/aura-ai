"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error?.message, error?.digest);
  }, [error]);

  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0f",
          color: "#e8e4dc",
          fontFamily: "system-ui, sans-serif",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Сервис временно недоступен</h1>
          <p style={{ color: "#9ca3af", marginBottom: "1.5rem", maxWidth: "20rem" }}>
            Произошла критическая ошибка. Обновите страницу или зайдите позже.
          </p>
          <button
            type="button"
            onClick={() => {
              try {
                reset();
              } catch {
                window.location.reload();
              }
            }}
            style={{
              background: "linear-gradient(135deg, #c9a24a, #e8c77e)",
              border: "none",
              borderRadius: "9999px",
              color: "#0a0a0f",
              cursor: "pointer",
              fontWeight: 600,
              padding: "12px 24px",
            }}
          >
            Обновить
          </button>
        </div>
      </body>
    </html>
  );
}
