"use client";

import { useEffect, useRef, useState } from "react";

const LOAD_TIMEOUT_MS = 20_000;
type Locale = "ru" | "en" | "kk";

const LOADING_COPY: Record<Locale, { loading: string; failed: string; retry: string; title: string }> = {
  ru: { loading: "Загружаю твой путь…", failed: "Не удалось загрузить Upskill Airy.", retry: "Попробовать ещё раз", title: "Upskill Airy — дневник навыков и Мика" },
  en: { loading: "Loading your journey…", failed: "Upskill Airy could not be loaded.", retry: "Try again", title: "Upskill Airy — your skills journal with Mika" },
  kk: { loading: "Жолың жүктеліп жатыр…", failed: "Upskill Airy жүктелмеді.", retry: "Қайталап көру", title: "Upskill Airy — Микамен дағдылар күнделігі" },
};

function normalizeLocale(value: unknown): Locale {
  return value === "en" || value === "kk" ? value : "ru";
}

export default function ExperienceFrame() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [locale, setLocale] = useState<Locale>("ru");

  useEffect(() => {
    let timer = 0;
    try {
      const saved = JSON.parse(window.localStorage.getItem("upskill-vn-v1") || "null");
      const savedLocale = normalizeLocale(saved?.profile?.preferences?.uiLanguage);
      timer = window.setTimeout(() => setLocale(savedLocale), 0);
    } catch {
      // The embedded app will report its saved cloud preference when it starts.
    }

    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      if (!event.data || typeof event.data !== "object" || (event.data as { type?: unknown }).type !== "airy:locale") return;
      setLocale(normalizeLocale((event.data as { locale?: unknown }).locale));
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = LOADING_COPY[locale].title;
    if (frameRef.current) frameRef.current.title = LOADING_COPY[locale].title;
  }, [locale]);

  useEffect(() => {
    if (loaded) return;
    const frame = frameRef.current;
    let finished = false;
    let observedDocument: Document | null = null;
    const onReady = () => checkReady();
    const finish = (success: boolean) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      observedDocument?.removeEventListener("airy:ready", onReady);
      observedDocument = null;
      if (success) {
        setLoaded(true);
        setTimedOut(false);
      } else {
        setTimedOut(true);
      }
    };
    const checkReady = () => {
      try {
        const document = frame?.contentDocument;
        if (document !== observedDocument) {
          observedDocument?.removeEventListener("airy:ready", onReady);
          observedDocument = document || null;
          observedDocument?.addEventListener("airy:ready", onReady, { once: true });
        }
        if (document?.documentElement?.dataset.airyAppReady === "true") finish(true);
      } catch {
        // Cross-origin or browser-restricted documents stay behind the retry UI.
      }
    };
    const onLoad = () => checkReady();
    frame?.addEventListener("load", onLoad);
    const timeout = window.setTimeout(() => finish(false), LOAD_TIMEOUT_MS);
    checkReady();
    return () => {
      finished = true;
      frame?.removeEventListener("load", onLoad);
      observedDocument?.removeEventListener("airy:ready", onReady);
      window.clearTimeout(timeout);
    };
  }, [attempt, loaded]);

  function retry() {
    setLoaded(false);
    setTimedOut(false);
    setAttempt((value) => value + 1);
  }

  return (
    <div className="experience-frame-wrap" aria-busy={!loaded}>
      {!loaded && (
        <div className="experience-loading" role={timedOut ? "alert" : "status"}>
          {timedOut ? (
            <>
              <p>{LOADING_COPY[locale].failed}</p>
              <button type="button" onClick={retry}>{LOADING_COPY[locale].retry}</button>
            </>
          ) : (
            <>
              <span className="experience-loading-mark" aria-hidden="true">✦</span>
              <p>{LOADING_COPY[locale].loading}</p>
            </>
          )}
        </div>
      )}
      <iframe
        ref={frameRef}
        key={attempt}
        className="experience-frame"
        src="/upskill.html"
        title={LOADING_COPY[locale].title}
      />
    </div>
  );
}
