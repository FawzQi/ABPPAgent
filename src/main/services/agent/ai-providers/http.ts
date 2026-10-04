import { net } from 'electron'

const DEFAULT_TIMEOUT_MS = 60_000

export async function httpFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const fetchFn = typeof net !== 'undefined' && typeof net.fetch === 'function' ? net.fetch : fetch
    return await fetchFn(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export function describeFetchError(
  providerLabel: string,
  error: unknown,
): string {
  if (error instanceof Error && error.name === 'AbortError') {
    return `${providerLabel} did not respond within 60 seconds. Check your internet connection and try again.`
  }
  if (error instanceof Error) {
    const cause = (error as { cause?: unknown }).cause
    if (cause instanceof Error && cause.name === 'AggregateError') {
      return `${providerLabel} could not be reached. Check proxy, VPN, or network settings.`
    }
    return `${providerLabel} request failed: ${error.message}`
  }
  return `${providerLabel} request failed: ${String(error)}`
}
