"use client";

import { useEffect, useState } from "react";

const ERROR_COPY = {
  ru: { title: "Что-то пошло не так", description: "Экран не загрузился. Данные аккаунта не затронуты — попробуй открыть его ещё раз.", retry: "Повторить" },
  en: { title: "Something went wrong", description: "This screen did not load. Your account data is safe. Try opening it again.", retry: "Try again" },
  kk: { title: "Бірдеңе дұрыс болмады", description: "Экран жүктелмеді. Аккаунт деректеріңе ештеңе болған жоқ — қайта ашып көр.", retry: "Қайталап көру" },
} as const;

export default function ErrorPage({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const [locale, setLocale] = useState<keyof typeof ERROR_COPY>("ru");
  useEffect(() => {
    let timer = 0;
    try {
      const saved = JSON.parse(window.localStorage.getItem("upskill-vn-v1") || "null");
      const preference = saved?.profile?.preferences?.uiLanguage;
      if (preference === "en" || preference === "kk") timer = window.setTimeout(() => setLocale(preference), 0);
    } catch {
      // Keep the Russian fallback if local profile data cannot be read.
    }
    return () => window.clearTimeout(timer);
  }, []);
  const copy = ERROR_COPY[locale];
  return (
    <main className="experience-error" role="alert">
      <span aria-hidden="true">✦</span>
      <h1>{copy.title}</h1>
      <p>{copy.description}</p>
      <button type="button" onClick={() => retry()}>{copy.retry}</button>
    </main>
  );
}
