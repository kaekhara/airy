"use client";

export default function ErrorPage({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="experience-error" role="alert">
      <span aria-hidden="true">✦</span>
      <h1>Что-то пошло не так</h1>
      <p>Экран не загрузился. Данные аккаунта не затронуты — попробуй открыть его ещё раз.</p>
      <button type="button" onClick={() => retry()}>Повторить</button>
    </main>
  );
}
