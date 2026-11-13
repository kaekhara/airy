"use client";

import { useEffect, useRef, useState } from "react";

const LOAD_TIMEOUT_MS = 20_000;

export default function ExperienceFrame() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (loaded) return;
    const frame = frameRef.current;
    let finished = false;
    const finish = (success: boolean) => {
      if (finished) return;
      finished = true;
      window.clearInterval(poll);
      window.clearTimeout(timeout);
      if (success) {
        setLoaded(true);
        setTimedOut(false);
      } else {
        setTimedOut(true);
      }
    };
    const checkReady = () => {
      try {
        if (frame?.contentDocument?.documentElement?.dataset.airyAppReady === "true") finish(true);
      } catch {
        // Cross-origin or browser-restricted documents stay behind the retry UI.
      }
    };
    const onLoad = () => checkReady();
    frame?.addEventListener("load", onLoad);
    const poll = window.setInterval(checkReady, 100);
    const timeout = window.setTimeout(() => finish(false), LOAD_TIMEOUT_MS);
    checkReady();
    return () => {
      finished = true;
      frame?.removeEventListener("load", onLoad);
      window.clearInterval(poll);
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
              <p>Не удалось загрузить Upskill Airy.</p>
              <button type="button" onClick={retry}>Попробовать ещё раз</button>
            </>
          ) : (
            <>
              <span className="experience-loading-mark" aria-hidden="true">✦</span>
              <p>Загружаю твой путь…</p>
            </>
          )}
        </div>
      )}
      <iframe
        ref={frameRef}
        key={attempt}
        className="experience-frame"
        src="/upskill.html"
        title="Upskill Airy — дневник навыков и Мика"
      />
    </div>
  );
}
