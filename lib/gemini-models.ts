/** Ordered from the preferred low-cost model to its supported Flash-Lite fallback. */
export const GEMINI_FLASH_LITE_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'] as const;

/** Retry another supported model only for model availability, quota, or upstream failures. */
export function shouldRetryGeminiModel(status: number, index: number, modelCount: number): boolean {
  return index < modelCount - 1 && (status === 404 || status === 429 || status >= 500);
}
