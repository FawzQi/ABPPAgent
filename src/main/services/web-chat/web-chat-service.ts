import { app, BrowserWindow, clipboard, type WebContents } from "electron";
import type {
  WebChatResponsePushedPayload,
  WebChatSendResult,
  WebChatStatus,
  WebChatTargetId,
  WebChatTargetInfo,
} from "@shared/types";
import {
  getWebChatProfile,
  WEB_CHAT_PROFILES,
  type WebChatProfile,
} from "./profiles";

/**
 * Drives a real chat site (chat.deepseek.com, chatgpt.com, …) in a dedicated
 * Electron window: types the generated prompt into the site's own composer,
 * submits it, waits for the reply to finish streaming, then asks the site to
 * copy its reply to the clipboard and reads it back from the main process.
 *
 * The clipboard is the *preferred* source because it carries the site's own
 * markdown — fenced code blocks, tables, headings — whereas scraping the
 * rendered DOM with `innerText` collapses tables into a run of cells and
 * drops fence markers. When the reply is a full-file code block followed by
 * an explanation and a debug section, the fences are what let the parser
 * tell the code apart from the prose; without them the whole reply lands in
 * the file. So the clipboard path is not an optimisation, it is the
 * correctness path: every fallback to DOM scraping is a degraded answer.
 *
 * Why a real window instead of an HTTP client: the entire point of this
 * feature is to reuse the account the user already has. There is no API key
 * to paste, no per-token bill, and no separate model catalogue to keep
 * current — the site is the model. The trade-off is that the integration is
 * only as stable as each site's DOM, which changes without notice. Every
 * selector below is therefore a list tried in order, and every one of them
 * degrades to a generic heuristic rather than throwing.
 *
 * Bot detection: the window is a normal Chromium window on a persistent
 * session partition, so the user signs in once and stays signed in. Two
 * fingerprints are deliberately removed:
 *
 *   - The `Electron/…` token in the user agent, which several sites key on.
 *     Replaced with a plain Chrome UA matching the bundled Chromium version.
 *
 *   - The `AutomationControlled` blink feature, which otherwise makes
 *     `navigator.webdriver` true. Set in `index.ts` before app ready, since
 *     Chromium reads its switches during start-up.
 *
 * No further evasion is attempted: the goal is to look like the browser the
 * user is actually running, not to defeat a determined anti-bot system. If a
 * site adds a captcha or a proof-of-work challenge, the window is visible and
 * the user can solve it by hand.
 */

const PARTITION = "persist:AnythingButProPlan-webchat";

/**
 * Google blocks OAuth sign-in from embedded webviews. Presenting a
 * laundered Chrome UA — which is what `plainChromeUserAgent` produces, a
 * UA byte-shaped like stock Chrome with the Electron and app tokens
 * stripped — is what Google rejects with `accounts.google.com/v3/signin/rejected`.
 *
 * The combination that reliably works is a Firefox identity on the sign-in hosts,
 * with no `sec-ch-ua*` client hint headers, matching what a real Firefox sends.
 *
 * Pinned to Firefox 138 rather than a computed current version: a UA that
 * advertises a version newer than any real Firefox release trips Google's
 * anomaly detection. 138 is a real, released version.
 */
const GOOGLE_AUTH_FIREFOX_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0";

/**
 * Hosts whose requests must carry the Firefox identity. `accounts.google.com`
 * is the sign-in host itself; `accounts.youtube.com` handles Google account
 * chooser and authentication surfaces. Matching by host suffix rather than
 * by exact string keeps a future subdomain working without a code change.
 *
 * Only the sign-in hosts are matched. Post-auth surfaces (`myaccount.google.com`,
 * `gds.google.com`) keep the profile's real Chrome identity so the session does
 * not appear as a different browser after sign-in completes.
 */
const GOOGLE_AUTH_HOSTS = ["accounts.google.com", "accounts.youtube.com"];

function isGoogleAuthHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return GOOGLE_AUTH_HOSTS.some(
      (candidate) => host === candidate || host.endsWith(`.${candidate}`),
    );
  } catch {
    return false;
  }
}

/**
 * Attach the Google-auth UA switch to every WebContents the app creates —
 * the main chat windows and the OAuth popups alike.
 *
 * The previous fix only rewrote the outgoing request header via
 * `onBeforeSendHeaders`. That covers the wire, but it does not cover
 * `navigator.userAgent`, which is what Google's sign-in script reads and
 * which is served from the WebContents UA, not from the request header. A
 * request that says Firefox while `navigator.userAgent` says Chrome is a
 * sharper bot signal than either value alone, and that mismatch is why the
 * header-only fix still produced `accounts.google.com/v3/signin/rejected`.
 *
 * The listener fires before the request for the new document is sent, so
 * the very first request to `accounts.google.com` already carries the
 * Firefox identity at both layers. `web-contents-created` fires for every
 * WebContents — including popups opened by the chat site's own "Sign in
 * with Google" button — so no per-window registration is needed in
 * `ensureWindow`.
 */
if (typeof app?.on === "function") {
  app.on("web-contents-created", (_event, contents: WebContents) => {
    contents.on(
      "did-start-navigation",
      (_navEvent, url, isInPlace, isMainFrame) => {
        // In-page navigations (hash changes, `history.pushState`) do not
        // issue a new document request, so the UA does not need flipping for
        // them and flipping it would churn the WebContents for nothing.
        if (!isMainFrame || isInPlace) return;
        contents.setUserAgent(
          isGoogleAuthHost(url) ? GOOGLE_AUTH_FIREFOX_UA : plainChromeUserAgent(),
        );
      },
    );
  });
}

/** Time allowed for an upload to land before the prompt is sent. */
const UPLOAD_GRACE_MS = 10_000;

/**
 * How long to let the page's copy handler reach the OS clipboard before the
 * main process reads it back. `navigator.clipboard.writeText` is async, so a
 * synchronous read right after the click would race the write; this is the
 * head-room for the common sites that await the platform clipboard promise
 * before resolving the click handler. Sized generously because a coding-mode
 * reply can be large and the browser has to serialize the whole markdown
 * blob before handing it to the OS.
 */
const CLIPBOARD_SETTLE_MS = 1500;

/**
 * How long to wait after `win.focus()` before clicking a copy control.
 * Chromium refuses `navigator.clipboard.writeText` while the document is
 * unfocused and a synthetic click does not count as user activation, so a
 * copy issued into a document the OS has not yet handed focus back to is a
 * silent no-op: the write never happens, the sentinel stays on the
 * clipboard, and we fall through to the scraped text.
 */
const FOCUS_SETTLE_MS = 400;

type WebChatTarget = WebChatProfile;

/**
 * Supported web chat targets configured via provider profiles.
 */
export const WEB_CHAT_TARGETS: WebChatProfile[] = [
  WEB_CHAT_PROFILES.deepseek,
  WEB_CHAT_PROFILES.chatgpt,
  WEB_CHAT_PROFILES.gemini,
];

export function listWebChatTargets(): WebChatTargetInfo[] {
  return WEB_CHAT_TARGETS.map((t) => ({
    id: t.id,
    label: t.label,
    url: t.url,
  }));
}

/**
 * Per-target status tracking.
 *
 * The page script cannot push events back to the main process — the
 * `executeJavaScript` call resolves once, when the whole async function
 * returns — so the script maintains a global (`window.__AnythingButProPlanWebChatStatus`)
 * and the main process polls it while a send is in flight. This module owns
 * both ends of that channel and exposes a listener so `ipc.ts` can relay
 * the status to every open renderer.
 */
const statuses = new Map<WebChatTargetId, WebChatStatus>();
let statusListener:
  | ((statuses: Record<WebChatTargetId, WebChatStatus>) => void)
  | null = null;

/** Snapshot of every target's status, filling in `idle` for untouched ones. */
export function getWebChatStatuses(): Record<WebChatTargetId, WebChatStatus> {
  const result = {} as Record<WebChatTargetId, WebChatStatus>;
  for (const target of WEB_CHAT_TARGETS) {
    result[target.id] = statuses.get(target.id) ?? "idle";
  }
  return result;
}

/**
 * Register the listener that will receive every status change. Called once
 * from `registerIpcHandlers`; the listener fans the update out to every
 * open renderer window.
 */
export function setWebChatStatusListener(
  listener: ((statuses: Record<WebChatTargetId, WebChatStatus>) => void) | null,
): void {
  statusListener = listener;
}

let responsePushListener:
  | ((payload: WebChatResponsePushedPayload) => void)
  | null = null;

export function setWebChatResponsePushListener(
  listener: ((payload: WebChatResponsePushedPayload) => void) | null,
): void {
  responsePushListener = listener;
}

/**
 * Update one target's status. Short-circuits when the value is unchanged so
 * the poller's 500 ms ticks do not flood the renderer with identical
 * payloads — only real transitions (idle → working, working → paused,
 * …) reach the IPC bridge.
 *
 * When shifting from 'working' to 'idle', triggers autoCopyLatestResponse to
 * extract the AI's reply and populate the app's Response panel.
 */
function setStatus(target: WebChatTargetId, status: WebChatStatus): void {
  const prev = statuses.get(target) ?? "idle";
  if (prev === status) return;
  statuses.set(target, status);
  statusListener?.(getWebChatStatuses());
}

const windows = new Map<WebChatTargetId, BrowserWindow>();
const generationObserved = new Map<WebChatTargetId, boolean>();

/** @internal test helper */
export function _setWindowForTest(
  targetId: WebChatTargetId,
  win: BrowserWindow | null,
): void {
  if (win) {
    windows.set(targetId, win);
  } else {
    windows.delete(targetId);
    idleStreakCounts.delete(targetId);
    generationObserved.delete(targetId);
  }
}

/** @internal test helper */
export function _setStatusForTest(
  targetId: WebChatTargetId,
  status: WebChatStatus,
): void {
  setStatus(targetId, status);
}

/** @internal test helper */
export function _setGenerationObservedForTest(
  targetId: WebChatTargetId,
  observed: boolean,
): void {
  generationObserved.set(targetId, observed);
}

const STATUS_POLL_INTERVAL_MS = 1000;

/**
 * In-page inspection script executed periodically in each open web chat window.
 * Detects whether the chat model is paused, working, or idle using provider-tailored rules.
 */
function buildStatusInspectionScript(profile: WebChatProfile): string {
  return `(() => {
  // If deliverPrompt page script explicitly flagged paused or working, honor it immediately
  if (window.__AnythingButProPlanWebChatStatus === 'paused') return 'paused';
  if (window.__AnythingButProPlanWebChatStatus === 'working') return 'working';

  const isVisible = (el) => {
    if (!el) return false;
    return !!(el.offsetWidth || el.offsetHeight || (el.getClientRects && el.getClientRects().length > 0));
  };

  // 1. Detect PAUSED state
  const isPaused = () => {
    ${profile.getIsPausedScript()}
  };
  if (isPaused()) return 'paused';

  // 2. Detect WORKING state
  const stopSels = ${JSON.stringify(profile.stopSelectors)};
  const isGenerating = () => {
    ${profile.getIsGeneratingScript()}
  };
  if (isGenerating()) return 'working';

  // 3. Detect BUSY state
  const isBusy = () => {
    ${profile.getIsBusyScript()}
  };
  if (isBusy()) return 'working';

  // 4. Assistant message text streaming/growth detection
  const respSels = ${JSON.stringify(profile.responseSelectors)};
  for (const sel of respSels) {
    const nodes = document.querySelectorAll(sel);
    if (nodes && nodes.length > 0) {
      const last = nodes[nodes.length - 1];
      if (isVisible(last)) {
        const text = (last.textContent || '').trim();
        if (text.length > 0) {
          if (window.__AnythingButProPlanLastObservedText !== undefined) {
            if (text !== window.__AnythingButProPlanLastObservedText) {
              window.__AnythingButProPlanLastObservedText = text;
              return 'working';
            }
          }
          window.__AnythingButProPlanLastObservedText = text;
        }
      }
      break;
    }
  }

  return 'idle';
})()`;
}

const IDLE_CONFIRMATION_THRESHOLD = 2; // Require 2 consecutive 'idle' polls (at 1000ms = 2s) to transition to idle
const idleStreakCounts = new Map<WebChatTargetId, number>();

async function pollOpenWindowsStatus(): Promise<void> {
  if (windows.size === 0) {
    if (liveStatusTimer !== null) {
      clearTimeout(liveStatusTimer);
      liveStatusTimer = null;
    }
    return;
  }
  for (const [targetId, win] of windows) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) {
      windows.delete(targetId);
      idleStreakCounts.delete(targetId);
      generationObserved.delete(targetId);
      setStatus(targetId, "idle");
      continue;
    }
    if (typeof win.webContents.isLoading === "function" && win.webContents.isLoading()) continue;
    try {
      const profile = getWebChatProfile(targetId);
      const status = (await win.webContents.executeJavaScript(
        buildStatusInspectionScript(profile),
        true,
      )) as WebChatStatus;

      const current = statuses.get(targetId) ?? "idle";

      if (status === "working") {
        idleStreakCounts.set(targetId, 0);
        generationObserved.set(targetId, true);
        setStatus(targetId, "working");
      } else if (status === "paused") {
        idleStreakCounts.set(targetId, 0);
        setStatus(targetId, "paused");
      } else if (status === "idle") {
        const streak = (idleStreakCounts.get(targetId) ?? 0) + 1;
        idleStreakCounts.set(targetId, streak);

        if (current === "working" || current === "paused") {
          if (streak >= IDLE_CONFIRMATION_THRESHOLD) {
            setStatus(targetId, "idle");
            if (generationObserved.get(targetId) === true) {
              generationObserved.set(targetId, false);
              void autoCopyLatestResponse(targetId);
            }
          }
          // Debounce: transient drops maintain working/paused state
        } else {
          setStatus(targetId, "idle");
        }
      }
    } catch {
      // Window navigating or busy; ignore
    }
  }
}

/** @internal test helper */
export async function _pollOpenWindowsStatusForTest(): Promise<void> {
  await pollOpenWindowsStatus();
}

let liveStatusTimer: NodeJS.Timeout | null = null;

function hasActiveWork(): boolean {
  for (const targetId of windows.keys()) {
    if (generationObserved.get(targetId) === true || statuses.get(targetId) === "working") {
      return true;
    }
  }
  return false;
}

async function runPollerCycle(): Promise<void> {
  await pollOpenWindowsStatus();
  if (windows.size === 0) {
    if (liveStatusTimer !== null) {
      clearTimeout(liveStatusTimer);
      liveStatusTimer = null;
    }
    return;
  }
  const delay = hasActiveWork() ? 1000 : 3000;
  liveStatusTimer = setTimeout(() => {
    void runPollerCycle();
  }, delay);
  liveStatusTimer.unref?.();
}

function ensureStatusPoller(): void {
  if (liveStatusTimer !== null) return;
  const delay = hasActiveWork() ? 1000 : 3000;
  liveStatusTimer = setTimeout(() => {
    void runPollerCycle();
  }, delay);
  liveStatusTimer.unref?.();
}

/**
 * Build a Chrome user-agent string for the platform this process is running
 * on, using the Chromium version Electron was built against. The Chromium
 * version matters: sites that gate features on `Sec-CH-UA` compare it to the
 * UA, and a mismatch is itself a fingerprint.
 */
function plainChromeUserAgent(): string {
  const chrome = process.versions.chrome ?? "120.0.0.0";
  let platform = "X11; Linux x86_64";
  if (process.platform === "darwin") {
    platform = "Macintosh; Intel Mac OS X 10_15_7";
  } else if (process.platform === "win32") {
    platform = "Windows NT 10.0; Win64; x64";
  }
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`;
}

function findTarget(id: WebChatTargetId): WebChatTarget | undefined {
  return getWebChatProfile(id);
}

/**
 * Get the existing window for a target, or create and load one. The window
 * is created hidden and lives until the user closes it — closing it logs
 * them out of the next session, which is intentional, but the window is not
 * destroyed between sends so the login survives a normal workflow.
 */
async function ensureWindow(target: WebChatTarget): Promise<BrowserWindow> {
  const existing = windows.get(target.id);
  if (existing && !existing.isDestroyed()) return existing;

  const win = new BrowserWindow({
    width: 1100,
    height: 820,
    show: false,
    title: `AnythingButProPlan — ${target.label}`,
    backgroundColor: "#16181d",
    autoHideMenuBar: true,
    webPreferences: {
      partition: PARTITION,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      // Deliberately no preload. This window is a plain browser tab; nothing
      // in the app's renderer bridge should be reachable from a third-party
      // page.
    },
  });

  // The session default is what a freshly-created WebContents (an OAuth
  // popup, for example) starts with. Set it once so every window in the
  // partition begins with the Chrome-shaped identity, and let the
  // `did-start-navigation` handler above flip individual navigations to
  // Firefox when they target a Google sign-in host.
  win.webContents.session.setUserAgent(plainChromeUserAgent());
  win.webContents.setUserAgent(plainChromeUserAgent());

  // Present a Firefox identity on Google's sign-in hosts and leave the
  // Chrome-shaped UA on every other host. The Chrome UA is what keeps
  // Cloudflare Turnstile happy on the chat sites themselves; the Firefox
  // UA is what gets Google's sign-in past the embedded-browser check. A
  // single UA cannot do both, so the switch is per-request.
  //
  // Client Hints headers are stripped on the Google requests because a real
  // Firefox sends none. Leaving `sec-ch-ua` in place alongside a Firefox UA
  // is an immediate giveaway — a real Firefox and a `sec-ch-ua` header
  // cannot both be true — and Google rejects the mismatch.
  win.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: ["https://*/*"] },
    (details, callback) => {
      const headers = details.requestHeaders;
      if (isGoogleAuthHost(details.url)) {
        for (const key of Object.keys(headers)) {
          const lower = key.toLowerCase();
          if (lower === "user-agent") {
            headers[key] = GOOGLE_AUTH_FIREFOX_UA;
          } else if (
            lower === "sec-ch-ua" ||
            lower === "sec-ch-ua-mobile" ||
            lower === "sec-ch-ua-platform" ||
            lower === "sec-ch-ua-full-version-list"
          ) {
            delete headers[key];
          }
        }
        callback({ requestHeaders: headers });
        return;
      }
      callback({ requestHeaders: headers });
    },
  );

  // Some sites gate `navigator.clipboard.writeText` behind the Clipboard
  // permission even when the document is focused, and Electron's default
  // permission handler resolves a request as "denied" unless a handler is
  // registered. That silently breaks the copy path and drops us onto the
  // DOM scrape, which is exactly the failure mode this whole file exists to
  // avoid.
  //
  // The handler therefore grants *only* the one permission the copy path
  // needs and denies everything else. Granting `true` for every permission
  // would be broader than the comment above it justifies: this handler is
  // registered on the shared `persist:` partition, so a compromised or
  // ad-injected page on any of the six chat sites would be able to reach
  // the camera, microphone, geolocation, notifications, MIDI, HID, USB,
  // and serial ports without a prompt. A chat site has no legitimate reason
  // to ask for any of those inside this app.
  //
  // The name Electron emits for the sanitized clipboard-write path is
  // `clipboard-sanitized-write`. The app never asks the page to *read* the
  // clipboard back — the main process reads the OS clipboard itself — so no
  // read permission is granted.
  win.webContents.session.setPermissionRequestHandler(
    (_wc, permission, callback) => {
      callback(permission === "clipboard-sanitized-write");
    },
  );

  // OAuth popups ("Sign in with Google", passkey prompts) open in a sibling
  // window that shares the session partition, so the cookies land in the
  // same jar the main chat window reads from.
  win.webContents.setWindowOpenHandler(() => ({
    action: "allow",
    overrideBrowserWindowOptions: {
      width: 600,
      height: 750,
      autoHideMenuBar: true,
      webPreferences: {
        partition: PARTITION,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    },
  }));

  win.on("closed", () => {
    windows.delete(target.id);
    idleStreakCounts.delete(target.id);
    generationObserved.delete(target.id);
    setStatus(target.id, "idle");
    if (windows.size === 0 && liveStatusTimer !== null) {
      clearTimeout(liveStatusTimer);
      liveStatusTimer = null;
    }
  });
  windows.set(target.id, win);
  ensureStatusPoller();
  win.webContents.on("did-finish-load", () => {
    void pollOpenWindowsStatus();
  });
  await win.loadURL(target.url);
  void pollOpenWindowsStatus();
  return win;
}

/**
 * In-page HTML-to-Markdown serializer executed inside the chat webview.
 * Walks the rendered response DOM, removes UI artifacts and provider-specific
 * blocks (via profile.getCleanResponseScript()), and outputs formatted Markdown.
 */
function buildCleanAssistantTextFunction(profile: WebChatProfile): string {
  return `
  const UI_LABEL = /^(copy|download|edit|share|retry|regenerate|model|think|thought|reasoning|复制|下载|编辑|分享|重试)$/i;
  const BLOCK_TAGS = new Set([
    'p','div','section','article','header','footer','main','aside','nav',
    'h1','h2','h3','h4','h5','h6','li','ul','ol','blockquote','table','thead','tbody','tr','hr','figure','figcaption','dl','dt','dd'
  ]);
  const FENCE = '\\x60\\x60\\x60';
  const BACKTICK = '\\x60';

  const cleanAssistantText = (node) => {
    try {
      const clone = node.cloneNode(true);
      clone
        .querySelectorAll(
          'button, [role="button"], [aria-label*="Copy" i], [aria-label*="Download" i], ' +
          '[class*="header" i], [class*="toolbar" i], [class*="code-header" i], [class*="code_header" i]'
        )
        .forEach((el) => {
          if (
            el.querySelector('button, [role="button"]') ||
            el.closest('pre') ||
            el.closest('[class*="code-block" i], [class*="codeblock" i]') ||
            el.nextElementSibling?.tagName?.toLowerCase() === 'pre' ||
            /code-header|code_header|code-toolbar/i.test(el.className || '')
          ) {
            el.remove();
          }
        });

      // Provider-specific DOM cleaning
      ${profile.getCleanResponseScript()}

      const out = [];
      const walk = (n) => {
        if (!n) return;
        if (n.nodeType === 3) {
          const v = n.nodeValue || '';
          if (v.length > 0) out.push(v);
          return;
        }
        if (n.nodeType !== 1) return;
        const tag = n.tagName ? n.tagName.toLowerCase() : '';
        if (tag === 'script' || tag === 'style' || tag === 'noscript') return;
        if (tag === 'br') { out.push('\\n'); return; }

        if (/^h[1-6]$/.test(tag)) {
          const level = parseInt(tag[1], 10);
          const prefix = '#'.repeat(level) + ' ';
          out.push('\\n\\n' + prefix);
          const kids = n.childNodes || [];
          for (let i = 0; i < kids.length; i++) walk(kids[i]);
          out.push('\\n\\n');
          return;
        }

        if (tag === 'li') {
          out.push('\\n- ');
          const kids = n.childNodes || [];
          for (let i = 0; i < kids.length; i++) walk(kids[i]);
          out.push('\\n');
          return;
        }

        if (tag === 'strong' || tag === 'b') {
          out.push('**');
          const kids = n.childNodes || [];
          for (let i = 0; i < kids.length; i++) walk(kids[i]);
          out.push('**');
          return;
        }

        if (tag === 'em' || tag === 'i') {
          out.push('*');
          const kids = n.childNodes || [];
          for (let i = 0; i < kids.length; i++) walk(kids[i]);
          out.push('*');
          return;
        }

        if (tag === 'pre') {
          const codeEl = n.querySelector('code');
          const codeText = ((codeEl || n).textContent || '').replace(/\\n+$/, '');
          let lang = '';
          if (codeEl) {
            const cls = typeof codeEl.className === 'string' ? codeEl.className : '';
            const m = cls.match(/language-([a-z0-9+#._-]+)/i);
            if (m) lang = m[1];
          }
          if (!lang) {
            const dataLang = n.getAttribute && n.getAttribute('data-language');
            if (dataLang) lang = dataLang;
          }
          out.push('\\n\\n' + FENCE + lang + '\\n' + codeText + '\\n' + FENCE + '\\n');
          return;
        }

        if (tag === 'code') {
          out.push(BACKTICK + (n.textContent || '') + BACKTICK);
          return;
        }

        const isBlock = BLOCK_TAGS.has(tag);
        if (isBlock) out.push('\\n');
        const kids = n.childNodes || [];
        for (let i = 0; i < kids.length; i++) walk(kids[i]);
        if (isBlock) out.push('\\n');
      };

      walk(clone);
      const raw = out
        .join('')
        .replace(/[ \\t]+$/gm, '')
        .replace(/\\n{3,}/g, '\\n\\n')
        .trim();
      const lines = raw.split('\\n');
      const kept = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length < 30 && UI_LABEL.test(trimmed)) continue;
        kept.push(line);
      }
      while (
        kept.length > 1 &&
        /^(server is (?:temporarily unavailable|busy|too busy|overloaded)|the server is (?:busy|overloaded)|system is busy|服务器繁忙[，。]?|服务繁忙[，。]?|too many requests\\.?|please try again( later)?\\.?)$/i.test(
          kept[0].trim(),
        )
      ) {
        kept.shift();
      }
      return kept.join('\\n').trim();
    } catch {
      return (node.innerText || '').trim();
    }
  };
`;
}

/**
 * The page-side driver script executed inside the chat site via `executeJavaScript`.
 *
 * Flow:
 *   1. Poll for the composer input element using target.inputSelectors.
 *   2. Inject the prompt via target.getInjectPromptScript().
 *   3. Submit the prompt via target.getSubmitScript().
 *   4. Poll the newest assistant response until text stops changing AND
 *      no visible generating/busy indicator is present (via target profile scripts).
 *
 * Deliberately does not click the copy button: clipboard clicks require document
 * focus and user activation, which are handled after completion in `readReplyViaCopy`.
 */
function buildScript(
  target: WebChatTarget,
  prompt: string,
  sendDelayMs: number = 1000,
  randomMinMs: number = 50,
  randomMaxMs: number = 150,
): string {
  return `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const queryFirst = (sels) => {
    for (const s of sels) {
      try { const el = document.querySelector(s); if (el) return el; } catch {}
    }
    return null;
  };
  const queryAll = (sels) => {
    const out = [];
    for (const s of sels) {
      try { document.querySelectorAll(s).forEach((el) => out.push(el)); } catch {}
    }
    return out;
  };

  ${buildCleanAssistantTextFunction(target)}

  const inputSels = ${JSON.stringify(target.inputSelectors)};
  const sendSels = ${JSON.stringify(target.sendSelectors)};
  const respSels = ${JSON.stringify(target.responseSelectors)};
  const stopSels = ${JSON.stringify(target.stopSelectors)};
  const prompt = ${JSON.stringify(prompt)};

  window.__AnythingButProPlanWebChatAbort = false;
  window.__AnythingButProPlanWebChatStatus = 'working';
  const aborted = () => window.__AnythingButProPlanWebChatAbort === true;

  let input = null;
  for (let i = 0; i < 80; i++) {
    if (aborted()) return { ok: false, error: 'Cancelled.' };
    input = queryFirst(inputSels);
    if (input) break;
    await sleep(250);
  }
  if (!input) {
    return { ok: false, error: 'Could not find the chat input. Are you signed in?' };
  }

  // --- Provider-specific input injection ---
  ${target.getInjectPromptScript('prompt')}

  // Pacing: Wait configured delay + configurable random jitter after putting prompt into input before clicking send
  const minJitter = ${Math.max(0, randomMinMs)};
  const maxJitter = Math.max(minJitter, ${Math.max(0, randomMaxMs)});
  const jitter = maxJitter > minJitter
    ? Math.floor(Math.random() * (maxJitter - minJitter + 1)) + minJitter
    : minJitter;
  await sleep(${Math.max(50, sendDelayMs)} + jitter);
  if (aborted()) return { ok: false, error: 'Cancelled.' };

  // Snapshot the transcript before submitting so the loop below only ever
  // reads the reply to *this* turn. Response selectors match every
  // assistant message in the DOM, and the previous turn's reply stays
  // rendered while the new one is being generated. Reading that old reply,
  // seeing it never change, and returning stable: true after two seconds
  // is exactly how the indicator flipped to idle while the model was still
  // thinking — the scrape returned the prior answer and the send ended.
  const baselineNodes = queryAll(respSels);
  const baselineCount = baselineNodes.length;
  const baselineText =
    baselineNodes.length > 0
      ? cleanAssistantText(baselineNodes[baselineNodes.length - 1])
      : '';

  // --- Provider-specific submit trigger ---
  ${target.getSubmitScript()}

  // Pacing: Wait 1 second after clicking send before polling/monitoring
  await sleep(1000);

  const isGenerating = () => {
    ${target.getIsGeneratingScript()}
  };

  const isPaused = () => {
    ${target.getIsPausedScript()}
  };

  const isBusyIndicator = () => {
    ${target.getIsBusyScript()}
  };

  const started = Date.now();
  const MAX_MS = 8 * 60 * 1000;
  let lastText = '';
  let stableMs = 0;
  let sawAny = false;

  await sleep(900);
  while (Date.now() - started < MAX_MS) {
    if (aborted()) {
      window.__AnythingButProPlanWebChatStatus = 'idle';
      return { ok: false, error: 'Cancelled.' };
    }
    await sleep(500);

    const nodes = queryAll(respSels);
    const lastNode = nodes.length > 0 ? nodes[nodes.length - 1] : null;
    const lastNodeText = lastNode ? cleanAssistantText(lastNode) : '';
    const hasNewTurn =
      nodes.length > baselineCount || lastNodeText !== baselineText;
    if (!hasNewTurn) {
      // Still the previous turn (or nothing rendered yet). The model may
      // be in its reasoning phase, or the site has not created the new
      // message element. Stay in working and keep polling.
      window.__AnythingButProPlanWebChatStatus = 'working';
      continue;
    }

    // Only read the newest turn node! Never walk backwards into previous turns' responses!
    const current = lastNodeText;
    if (!current || current === baselineText) {
      window.__AnythingButProPlanWebChatStatus = 'working';
      continue;
    }
    sawAny = true;

    const generating = isGenerating();
    const pauseBtn = isPaused();
    if (pauseBtn) {
      try {
        pauseBtn.click();
        stableMs = 0;
        window.__AnythingButProPlanWebChatStatus = 'working';
        await sleep(1000);
        continue;
      } catch (e) {}
    }
    const paused = !!pauseBtn;
    const busy = isBusyIndicator();
    window.__AnythingButProPlanWebChatStatus = (paused || generating || busy) ? (paused ? 'paused' : 'working') : 'working';

    // Check if send button is back and re-enabled (strong signal that generation finished)
    const sendBtnNow = queryFirst(sendSels);
    const sendReady = sendBtnNow && !sendBtnNow.disabled && sendBtnNow.getAttribute('aria-disabled') !== 'true';

    if (
      current === lastText &&
      !generating &&
      !paused &&
      !busy
    ) {
      const hasCompleteToolJson = /"tool_call_name"\s*:\s*"[^"]+"/i.test(current);
      const targetStableMs = (sendReady || hasCompleteToolJson) ? 1000 : 1500;

      stableMs += 500;
      if (stableMs >= targetStableMs) {
        // Pacing: Wait 1 second after response finishes streaming before returning
        await sleep(1000);
        window.__AnythingButProPlanWebChatStatus = 'idle';
        return { ok: true, stable: true, text: current };
      }
    } else {
      stableMs = 0;
    }
    lastText = current;
  }

  window.__AnythingButProPlanWebChatStatus = 'idle';
  if (sawAny) return { ok: true, stable: false, text: lastText };
  return { ok: false, error: 'Timed out waiting for a response.' };
})()`;
}

/**
 * Collect every visible copy control on the page and stash the list on
 * `window`, keyed by index. Returns the count.
 *
 * There is more than one "Copy" on a coding-mode reply: each fenced code
 * block carries its own copy button (which copies only that block), and the
 * message's action bar carries a copy button (which copies the whole turn
 * as markdown). The label alone cannot tell them apart — a site may label
 * both "Copy" — so we gather every candidate and let the main process try
 * them newest-to-oldest, accepting the result that looks like the whole
 * turn. Candidates inside `<pre>`, `<code>`, or any element whose class
 * mentions "code" are dropped first: those are always per-block controls,
 * and pruning them keeps the click loop short.
 */
function buildCollectCopyCandidatesScript(target: WebChatTarget): string {
  return `(() => {
    // 1. Hook navigator.clipboard.writeText so we can capture the markdown string directly
    // in memory even if Chromium denies OS clipboard write due to document focus.
    window.__AnythingButProPlanCapturedCopy = null;
    if (!window.__AnythingButProPlanClipboardHooked) {
      window.__AnythingButProPlanClipboardHooked = true;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          const origWrite = navigator.clipboard.writeText.bind(navigator.clipboard);
          navigator.clipboard.writeText = async function(text) {
            window.__AnythingButProPlanCapturedCopy = text;
            try {
              return await origWrite(text);
            } catch (err) {
              // Ignore focus errors - text is already captured!
            }
          };
        }
      } catch (e) {}

      document.addEventListener('copy', (e) => {
        try {
          const data = e.clipboardData?.getData('text/plain');
          if (data) window.__AnythingButProPlanCapturedCopy = data;
        } catch {}
      }, true);
    }

    const queryAll = (sels) => {
      const out = [];
      for (const s of sels) {
        try { document.querySelectorAll(s).forEach((el) => out.push(el)); } catch {}
      }
      return out;
    };

    const isVisible = (el) => {
      if (!el) return false;
      return !!(el.offsetWidth || el.offsetHeight || (el.getClientRects && el.getClientRects().length > 0));
    };

    const isForbidden = (el) => {
      if (!el) return true;
      if (el.closest('form, div[class*="input" i], textarea, [class*="composer" i], [class*="chat-input" i], #chat-input, [data-message-author-role="user"], [class*="user-message" i], [class*="user_message" i]')) return true;
      const label = (el.getAttribute('aria-label') || '').trim();
      const title = (el.getAttribute('title') || '').trim();
      const text = (el.textContent || '').trim();
      const cls = (typeof el.className === 'string' ? el.className : '').trim();
      const combined = (label + ' ' + title + ' ' + text + ' ' + cls).toLowerCase();
      return /regenerat|retry|edit|share|like|dislike|thumb|report|delete|send|submit|重新生成|重试|编辑|分享|点赞|点踩|删除|发送/i.test(combined);
    };

    const copySels = ${JSON.stringify(
      target.copySelectors ?? [
        'button[aria-label*="Copy" i]',
        'div[role="button"][aria-label*="Copy" i]',
      ],
    )};

    const allButtons = document.querySelectorAll('button, [role="button"], .ds-icon-button, [data-testid*="copy" i]');
    const seen = new Set();
    const candidates = [];

    // First: query target-configured copy selectors
    for (const el of queryAll(copySels)) {
      if (!el || seen.has(el) || !isVisible(el) || isForbidden(el)) continue;
      seen.add(el);
      candidates.push(el);
    }

    // Second: scan all buttons for copy / 复制 keywords or copy SVG icons
    for (const b of allButtons) {
      if (!b || seen.has(b) || !isVisible(b) || isForbidden(b)) continue;
      const label = (b.getAttribute('aria-label') || '').trim();
      const title = (b.getAttribute('title') || '').trim();
      const text = (b.textContent || '').trim();
      const cls = (typeof b.className === 'string' ? b.className : '').trim();
      const combined = (label + ' ' + title + ' ' + text + ' ' + cls).toLowerCase();

      let isMatch = combined.includes('copy') || combined.includes('复制') || combined.includes('拷贝');
      if (!isMatch) {
        const svgs = b.querySelectorAll('svg');
        for (const s of svgs) {
          const sLabel = ((s.getAttribute('aria-label') || '') + ' ' + (s.getAttribute('name') || '')).toLowerCase();
          if (sLabel.includes('copy') || sLabel.includes('复制') || sLabel.includes('拷贝')) {
            isMatch = true;
            break;
          }
        }
      }

      if (isMatch) {
        seen.add(b);
        candidates.push(b);
      }
    }

    const isCodeBlockControl = (el) => {
      if (!el) return true;
      // 1. Inside pre, code, or syntax highlighter / code block wrapper
      if (el.closest('pre, code, [class*="code-block" i], [class*="codeblock" i], [class*="highlight" i], [class*="code-header" i], [class*="code-toolbar" i], [class*="code_header" i], [class*="code-box" i], [class*="codebox" i]')) {
        return true;
      }
      // 2. Immediate parent or nearby ancestor has code/highlight class or contains pre/code
      let p = el.parentElement;
      let d = 0;
      while (p && d < 4) {
        const pTag = p.tagName ? p.tagName.toLowerCase() : '';
        if (pTag === 'pre' || pTag === 'code') return true;
        const pCls = (typeof p.className === 'string' ? p.className : '').toLowerCase();
        if (pCls.includes('code') || pCls.includes('highlight') || pCls.includes('syntax') || pCls.includes('snippet')) {
          if (p.querySelector && p.querySelector('pre, code')) return true;
        }
        p = p.parentElement;
        d++;
      }
      // 3. Label/title/text explicitly referencing code/snippet/代码/代码块
      const label = ((el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '') + ' ' + (el.textContent || '')).toLowerCase();
      if (/\b(code|snippet)\b|代码|代码块/.test(label)) {
        return true;
      }
      // 4. Test ID or attribute indicating code copy
      const testid = ((el.getAttribute('data-testid') || '') + ' ' + (el.getAttribute('data-code') || '')).toLowerCase();
      if (/code/.test(testid)) {
        return true;
      }
      return false;
    };

    const outerPool = candidates.filter((el) => !isCodeBlockControl(el));
    // CRITICAL: NEVER fall back to code-block buttons if outerPool is empty.
    // Falling back to DOM scraping is infinitely better than copying a single code snippet!
    const final = outerPool;

    window.__AnythingButProPlanCopyCandidates = final;
    return final.length;
  })()`;
}

async function collectCopyCandidates(
  win: BrowserWindow,
  target: WebChatTarget,
): Promise<number> {
  try {
    const count = (await win.webContents.executeJavaScript(
      buildCollectCopyCandidatesScript(target),
      true,
    )) as number | undefined;
    return typeof count === "number" ? count : 0;
  } catch {
    return 0;
  }
}

async function clickCopyCandidate(
  win: BrowserWindow,
  index: number,
): Promise<{ clicked: boolean; capturedText: string | null }> {
  try {
    const res = (await win.webContents.executeJavaScript(
      `(() => {
        window.__AnythingButProPlanCapturedCopy = null;
        const el = (window.__AnythingButProPlanCopyCandidates || [])[${index}];
        if (!el) return { clicked: false, capturedText: null };
        if (el.closest('form, div[class*="input" i], textarea, [class*="composer" i], [class*="chat-input" i], #chat-input, [data-message-author-role="user"], [class*="user-message" i], [class*="user_message" i]')) {
          return { clicked: false, capturedText: null };
        }
        const label = ((el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '') + ' ' + (el.textContent || '') + ' ' + (el.className || '')).toLowerCase();
        if (/regenerat|retry|edit|share|like|dislike|thumb|report|delete|send|submit|重新生成|重试|编辑|分享|删除|发送/i.test(label)) {
          return { clicked: false, capturedText: null };
        }
        try {
          try { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); } catch {}
          try { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); } catch {}
          try { el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); } catch {}
          try { el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true })); } catch {}
          el.click();
          return { clicked: true, capturedText: window.__AnythingButProPlanCapturedCopy };
        } catch {
          return { clicked: false, capturedText: null };
        }
      })()`,
      true,
    )) as { clicked?: boolean; capturedText?: string | null } | undefined;

    return {
      clicked: res?.clicked === true,
      capturedText: typeof res?.capturedText === "string" ? res.capturedText : null,
    };
  } catch {
    return { clicked: false, capturedText: null };
  }
}

/**
 * Ask the site to copy its reply, click the message-level "Copy" control,
 * and read the result back from in-memory capture or the OS clipboard.
 */
async function readReplyViaCopy(
  win: BrowserWindow,
  target: WebChatTarget,
  scrapedBaseline?: string | null,
): Promise<string | null> {
  const count = await collectCopyCandidates(win, target);
  if (count === 0) return null;

  const sentinel = `__AnythingButProPlan_${Date.now()}__`;
  const previousClipboard = await clipboard.readText();
  const maxTries = Math.min(count, 8);
  let best = "";
  let sawAnyCopy = false;

  for (let i = count - 1; i >= count - maxTries; i--) {
    await clipboard.writeText(sentinel);
    const { clicked, capturedText } = await clickCopyCandidate(win, i);
    if (!clicked) continue;

    await new Promise((resolve) => setTimeout(resolve, CLIPBOARD_SETTLE_MS));

    // 1. Check in-memory captured copy from navigator.clipboard.writeText hook
    let candidateText = capturedText;
    if (!candidateText) {
      try {
        const polled = (await win.webContents.executeJavaScript(
          "window.__AnythingButProPlanCapturedCopy",
          true,
        )) as string | null | undefined;
        if (typeof polled === "string" && polled.length > 0) {
          candidateText = polled;
        }
      } catch {}
    }

    // 2. Check OS clipboard as well
    const textFromClipboard = await clipboard.readText();
    if (textFromClipboard && textFromClipboard !== sentinel) {
      if (!candidateText || textFromClipboard.length > candidateText.length) {
        candidateText = textFromClipboard;
      }
    }

    if (!candidateText || candidateText === sentinel) continue;
    sawAnyCopy = true;

    if (candidateText.length > best.length) {
      best = candidateText;
    }

    // Accept candidate if it has all expected major sections present in scrapedBaseline
    const hasKeySections =
      !scrapedBaseline ||
      ((!scrapedBaseline.includes("===Explanation===") || candidateText.includes("===Explanation===")) &&
       (!scrapedBaseline.includes("===Files===") || candidateText.includes("===Files===")) &&
       (!scrapedBaseline.includes("===Debug===") || candidateText.includes("===Debug===")));
    const isAdequateLength =
      !scrapedBaseline || candidateText.length >= scrapedBaseline.length * 0.75;

    if (hasKeySections && isAdequateLength && candidateText.length > 300) {
      best = candidateText;
      break;
    }
  }

  // If no copy attempt succeeded at all, try candidate clicks without stealing OS focus
  if (!sawAnyCopy && !win.isDestroyed()) {
    try {
      for (let i = count - 1; i >= count - Math.min(count, 3); i--) {
        await clipboard.writeText(sentinel);
        const { clicked, capturedText } = await clickCopyCandidate(win, i);
        if (!clicked) continue;
        await new Promise((resolve) => setTimeout(resolve, CLIPBOARD_SETTLE_MS));

        let candidateText = capturedText;
        if (!candidateText) {
          try {
            const polled = (await win.webContents.executeJavaScript(
              "window.__AnythingButProPlanCapturedCopy",
              true,
            )) as string | null | undefined;
            if (typeof polled === "string" && polled.length > 0) {
              candidateText = polled;
            }
          } catch {}
        }
        const textFromClipboard = await clipboard.readText();
        if (textFromClipboard && textFromClipboard !== sentinel) {
          if (!candidateText || textFromClipboard.length > candidateText.length) {
            candidateText = textFromClipboard;
          }
        }
        if (candidateText && candidateText !== sentinel && candidateText.length > best.length) {
          best = candidateText;
          break;
        }
      }
    } catch {}
  }

  // Validate best candidate against scraped baseline if available
  if (best.length > 0 && scrapedBaseline && scrapedBaseline.trim().length > 0) {
    const scrapedLen = scrapedBaseline.trim().length;
    const missingExplanation =
      scrapedBaseline.includes("===Explanation===") && !best.includes("===Explanation===");
    const missingFiles =
      scrapedBaseline.includes("===Files===") && !best.includes("===Files===");
    const tooShort = best.length < scrapedLen * 0.7;

    if (missingExplanation || missingFiles || tooShort) {
      // The copied text is only a partial snippet/fragment. Reject in favor of scraped baseline!
      best = "";
    }
  }

  if (best.length === 0) {
    try {
      await clipboard.writeText(previousClipboard);
    } catch {}
    return null;
  }

  // Ensure OS clipboard holds the final best markdown copy
  try {
    await clipboard.writeText(best);
  } catch {}

  return best;
}

function buildScrapeLatestAssistantResponseScript(target: WebChatTarget): string {
  return `(() => {
    ${buildCleanAssistantTextFunction(target)}

    const respSels = ${JSON.stringify(target.responseSelectors)};
    const queryAll = (sels) => {
      const out = [];
      for (const s of sels) {
        try { document.querySelectorAll(s).forEach((el) => out.push(el)); } catch {}
      }
      return out;
    };

    const nodes = queryAll(respSels);
    let latestText = '';
    for (let i = nodes.length - 1; i >= 0; i--) {
      const t = cleanAssistantText(nodes[i]);
      if (t && t.length > 0) {
        latestText = t;
        break;
      }
    }
    return latestText;
  })()`;
}

async function scrapeLatestAssistantResponse(
  win: BrowserWindow,
  target: WebChatTarget,
): Promise<string | null> {
  try {
    const text = (await win.webContents.executeJavaScript(
      buildScrapeLatestAssistantResponseScript(target),
      true,
    )) as string | undefined;
    return typeof text === "string" && text.trim().length > 0 ? text : null;
  } catch {
    return null;
  }
}

async function extractLatestAssistantResponse(
  win: BrowserWindow,
  target: WebChatTarget,
): Promise<string | null> {
  const previousClipboard = await clipboard.readText();
  // 1. Scrape the DOM first to establish a reliable baseline of the full message
  const scraped = await scrapeLatestAssistantResponse(win, target);

  // 2. Try copying via message action bar button, using scraped as baseline validator
  let text = await readReplyViaCopy(win, target, scraped);

  if (!text) {
    try {
      await clipboard.writeText(previousClipboard);
    } catch {}
    text = scraped;
  }
  return text && text.trim().length > 0 ? text : null;
}

const lastCopiedResponses = new Map<WebChatTargetId, string>();
const extractingTargets = new Set<WebChatTargetId>();

export async function autoCopyLatestResponse(
  targetId: WebChatTargetId,
): Promise<string | null> {
  if (extractingTargets.has(targetId)) return null;
  extractingTargets.add(targetId);

  try {
    const win = windows.get(targetId);
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return null;

    const targetObj = findTarget(targetId);
    if (!targetObj) return null;

    // Small delay to allow the page DOM to settle
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (win.isDestroyed() || win.webContents.isDestroyed()) return null;

    const text = await extractLatestAssistantResponse(win, targetObj);
    if (!text || text.trim() === "") return null;

    if (lastCopiedResponses.get(targetId) === text) return null;
    lastCopiedResponses.set(targetId, text);

    try {
      clipboard.writeText(text);
    } catch {}

    responsePushListener?.({ target: targetId, text });
    return text;
  } catch {
    return null;
  } finally {
    extractingTargets.delete(targetId);
  }
}

/**
 * Manually scrape and copy the latest response from an open web chat window.
 * Copies the markdown to OS clipboard and returns the result to populate the response panel.
 */
export async function scrapeWebChatResponse(
  targetId: WebChatTargetId,
): Promise<WebChatSendResult> {
  const win = windows.get(targetId);
  const targetObj = findTarget(targetId);
  if (!win || win.isDestroyed() || win.webContents.isDestroyed() || !targetObj) {
    return {
      ok: false,
      error: `No open web chat window for ${targetObj?.label ?? targetId}.`,
    };
  }

  const text = await extractLatestAssistantResponse(win, targetObj);
  if (!text || text.trim() === "") {
    return {
      ok: false,
      error: `No response found in ${targetObj.label}.`,
    };
  }

  lastCopiedResponses.set(targetId, text);
  try {
    await clipboard.writeText(text);
  } catch {}

  return {
    ok: true,
    text,
  };
}

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message;
}

/**
 * Type `prompt` into the target site, submit it, and return the assistant's
 * reply.
 *
 * The reply is sourced from the clipboard when possible. Between the settle
 * check and the copy click the window is briefly focused — a copy issued
 * while the document is unfocused is a no-op — and a sentinel is planted on
 * the clipboard first, so a write that silently fails can be told apart
 * from a write that succeeded. Without the sentinel, a failed write would
 * leave whatever the user last copied on the clipboard and we would return
 * that, which is worse than useless: it looks like an answer.
 *
 * Failure never destroys the window: when the send fails the window is
 * brought to the front so the user can complete a login or clear a captcha,
 * and a retry reuses the same session.
 */
async function deliverPrompt(
  win: BrowserWindow,
  target: WebChatTarget,
  prompt: string,
  sendDelayMs: number = 1000,
  randomMinMs: number = 50,
  randomMaxMs: number = 150,
): Promise<WebChatSendResult> {
  try {
    await win.webContents.executeJavaScript(
      "window.__AnythingButProPlanWebChatAbort = false;",
      true,
    );
  } catch {
    // The page has not finished loading; the script sets the flag itself.
  }

  // Mark this target as working immediately and reset idle streak
  idleStreakCounts.set(target.id, 0);
  setStatus(target.id, "working");

  try {
    const raw = (await win.webContents.executeJavaScript(
      buildScript(target, prompt, sendDelayMs, randomMinMs, randomMaxMs),
      true,
    )) as
      | { ok?: boolean; text?: string; error?: string; stable?: boolean }
      | undefined;
    if (!raw || typeof raw !== "object") {
      return {
        ok: false,
        error: `${target.label} returned an unexpected result.`,
      };
    }
    if (!raw.ok) {
      return {
        ok: false,
        error: raw.error ?? `${target.label} reported a failure.`,
      };
    }

    const scraped = typeof raw.text === "string" ? raw.text : "";

    if (raw.stable === true) {
      try {
        const fromClipboard = await readReplyViaCopy(win, target, scraped);
        if (fromClipboard) {
          lastCopiedResponses.set(target.id, fromClipboard);
          return { ok: true, text: fromClipboard };
        }
      } catch {
        // Fall through to the scraped text.
      }
    }

    lastCopiedResponses.set(target.id, scraped);
    return { ok: true, text: scraped };
  } catch (error) {
    return { ok: false, error: `${target.label}: ${describe(error)}` };
  } finally {
    idleStreakCounts.set(target.id, IDLE_CONFIRMATION_THRESHOLD);
    generationObserved.set(target.id, false);
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents
        .executeJavaScript(
          'window.__AnythingButProPlanWebChatStatus = "idle";',
          true,
        )
        .catch(() => {});
    }
    setStatus(target.id, "idle");
  }
}

/**
 * Put a real file into the site's file input.
 *
 * `input.files` cannot be assigned from page JavaScript — a `File` built in
 * the page carries bytes we would have to push through `executeJavaScript`
 * as base64, which is megabytes of string for a paper and fails outright on
 * a large PDF. The debugger protocol's `DOM.setFileInputFiles` sets the path
 * on the element the way a user's file picker does, so the site's own upload
 * code runs unchanged.
 *
 * Returns false when the page has no file input — the caller then sends the
 * extracted text instead of the document, which is worse but works.
 */
async function attachFile(
  win: BrowserWindow,
  target: WebChatTarget,
  absolutePath: string,
): Promise<boolean> {
  const debugger_ = win.webContents.debugger;
  try {
    if (!debugger_.isAttached()) debugger_.attach("1.3");
    await debugger_.sendCommand("DOM.enable");
    const document_ = (await debugger_.sendCommand("DOM.getDocument", {
      depth: -1,
      pierce: true,
    })) as { root?: { nodeId?: number } };
    const rootId = document_.root?.nodeId;
    if (rootId === undefined) return false;

    for (const selector of target.fileSelectors ?? ['input[type="file"]']) {
      const found = (await debugger_.sendCommand("DOM.querySelector", {
        nodeId: rootId,
        selector,
      })) as { nodeId?: number };
      if (found.nodeId === undefined || found.nodeId === 0) continue;
      await debugger_.sendCommand("DOM.setFileInputFiles", {
        files: [absolutePath],
        nodeId: found.nodeId,
      });
      return true;
    }
    return false;
  } catch (error) {
    // A page that already has a debugger attached (the user opened devtools)
    // refuses a second one; that is not worth failing the conversion over.
    console.warn(
      `Could not attach a file to ${target.label}:`,
      describe(error),
    );
    return false;
  }
}

/**
 * Best-effort wait for an in-flight upload to complete.
 *
 * No two of these sites agree on what "uploading" looks like in the DOM, so
 * this polls a handful of generic indicators (progress bars, `aria-busy`
 * containers, class names containing "upload"). It returns `true` when an
 * indicator appeared and then cleared; `false` when none was ever seen, in
 * which case the caller falls back to the fixed grace period — the common
 * case, since most sites swap the composer for a "file attached" chip
 * instead of rendering a progress bar.
 */
async function waitForUploadSettle(
  win: BrowserWindow,
  _target: WebChatTarget,
): Promise<boolean> {
  const script = `(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const indicators = [
      '[role="progressbar"]',
      '[aria-busy="true"]',
      'div[class*="uploading"]',
      'div[class*="upload-progress"]',
      'div[class*="file-upload"][class*="loading"]',
    ];
    const busy = () => {
      for (const s of indicators) {
        try {
          const el = document.querySelector(s);
          if (el && el.offsetParent !== null) return true;
        } catch {}
      }
      return false;
    };
    const start = Date.now();
    let seen = false;
    while (Date.now() - start < 1500) {
      if (busy()) { seen = true; break; }
      await sleep(100);
    }
    if (!seen) return false;
    while (busy() && Date.now() - start < 60000) await sleep(200);
    return true;
  })()`;
  try {
    const settled = (await win.webContents.executeJavaScript(script, true)) as
      | boolean
      | undefined;
    return settled === true;
  } catch {
    return false;
  }
}

const lastPromptSentTimes = new Map<WebChatTargetId, number>();
const WEB_CHAT_PROMPT_COOLDOWN_MS = 1000;

export async function sendToWebChat(
  targetId: WebChatTargetId,
  prompt: string,
  sendDelayMs: number = 1000,
  randomMinMs: number = 50,
  randomMaxMs: number = 150,
): Promise<WebChatSendResult> {
  const target = findTarget(targetId);
  if (!target)
    return { ok: false, error: `Unknown web chat target: ${targetId}` };

  lastPromptSentTimes.set(targetId, Date.now());
  generationObserved.set(targetId, true);
  if (liveStatusTimer !== null) {
    clearTimeout(liveStatusTimer);
    liveStatusTimer = null;
  }
  ensureStatusPoller();

  let win: BrowserWindow;
  try {
    win = await ensureWindow(target);
  } catch (error) {
    return {
      ok: false,
      error: `Could not open ${target.label}: ${describe(error)}`,
    };
  }

  const maxRetries = 3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await deliverPrompt(win, target, prompt, sendDelayMs, randomMinMs, randomMaxMs);

    const isTransientError =
      !result.ok &&
      typeof result.error === "string" &&
      /server is (?:temporarily unavailable|busy|too busy|overloaded)|the server is (?:busy|overloaded)|system is busy|服务器繁忙|服务繁忙|network error|failed to fetch|rate limit|too many requests|please try again/i.test(
        result.error,
      );

    const isTransientText =
      result.ok &&
      typeof result.text === "string" &&
      (/server is (?:temporarily unavailable|busy|too busy|overloaded)|the server is (?:busy|overloaded)|system is busy|服务器繁忙|服务繁忙|rate limit|too many requests/i.test(
        result.text.trim(),
      ) ||
        /^(?:error:?\s*)?(?:server|system|network|please try again)/i.test(
          result.text.trim(),
        )) &&
      result.text.trim().length < 500 &&
      !/<(?:tool_call|[|｜]{2}DSML[|｜]{2})/i.test(result.text);

    if ((isTransientError || isTransientText) && attempt < maxRetries) {
      const backoffMs = (attempt + 1) * 5000;
      console.warn(
        `[web-chat] Transient error on ${target.label} (attempt ${attempt + 1}/${maxRetries + 1}). Retrying in ${backoffMs / 1000}s...`,
      );
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      continue;
    }

    return result;
  }

  return { ok: false, error: `${target.label}: Exceeded maximum retry attempts.` };
}

export interface WebChatDocumentResult extends WebChatSendResult {
  /** True when the document itself was attached, false when only text went. */
  attached: boolean;
}

/**
 * Attach a document to the chat and send `prompt` with it.
 *
 * This is the path a research conversion takes when the user has no API key:
 * the site's model reads the actual PDF — figures, charts and layout included
 * — and answers with markdown, which is the whole reason to prefer this over
 * extracting text locally first.
 *
 * The flow mirrors what a user does by hand: drop the file in, give the
 * upload a moment to land, paste the base prompt, wait for the model to
 * finish, then ask the site to copy its reply to the clipboard. The final
 * clipboard read happens inside `deliverPrompt`, so a site whose copy
 * control cannot be found still degrades to a DOM scrape rather than
 * failing.
 *
 * Uploads are asynchronous and the sites gate their send button while one is
 * in flight. Two mechanisms cover the wait: a generic progress-indicator
 * poll (`waitForUploadSettle`) for sites that render one, and a fixed
 * ten-second grace period for everyone else — there is no shared DOM event
 * for "upload finished" across web chat sites, and the send path already
 * tolerates a click that does nothing because it retries and falls back to
 * Enter.
 */
export async function sendDocumentToWebChat(
  targetId: WebChatTargetId,
  prompt: string,
  documentPath: string,
): Promise<WebChatDocumentResult> {
  const target = findTarget(targetId);
  if (!target) {
    return {
      ok: false,
      attached: false,
      error: `Unknown web chat target: ${targetId}`,
    };
  }

  let win: BrowserWindow;
  try {
    win = await ensureWindow(target);
  } catch (error) {
    return {
      ok: false,
      attached: false,
      error: `Could not open ${target.label}: ${describe(error)}`,
    };
  }

  if (win.isMinimized()) win.restore();
  win.showInactive();

  const attached = await attachFile(win, target, documentPath);
  if (attached) {
    const sawIndicator = await waitForUploadSettle(win, target);
    if (!sawIndicator) {
      await new Promise((resolve) => setTimeout(resolve, UPLOAD_GRACE_MS));
    }
  }

  const result = await deliverPrompt(win, target, prompt);
  if (!win.isDestroyed() && !result.ok) {
    win.show();
    win.focus();
  }
  return { ...result, attached };
}

/** Show the target window so the user can sign in before the first send. */
export async function openWebChat(targetId: WebChatTargetId): Promise<void> {
  const target = findTarget(targetId);
  if (!target) return;
  const win = await ensureWindow(target);
  win.show();
  win.focus();
  void pollOpenWindowsStatus();
}

/**
 * Ask any in-flight send to stop on its next poll. The polling loop inside
 * the page checks the flag every 500 ms; the result is discarded as a
 * cancellation, not treated as an error.
 */
export function cancelWebChat(): void {
  for (const [targetId, win] of windows.entries()) {
    if (win.isDestroyed()) continue;
    idleStreakCounts.set(targetId, IDLE_CONFIRMATION_THRESHOLD);
    generationObserved.set(targetId, false);
    setStatus(targetId, "idle");
    win.webContents
      .executeJavaScript(
        "window.__AnythingButProPlanWebChatAbort = true; window.__AnythingButProPlanWebChatStatus = 'idle';",
        true,
      )
      .catch(() => undefined);
  }
}

/**
 * Close every open web chat window. Called from `index.ts` when the main
 * window closes and when the app is about to quit, so the hidden chat
 * windows do not keep the process alive after the main window is gone.
 *
 * Electron keeps the app running for as long as any window exists, and the
 * web chat windows are created `show: false` and are never closed by the
 * app — so without this, closing the main window would leave the process
 * (and the signed-in chat sessions) running with no visible way to reach
 * them. The `windows` map is cleared afterwards so a subsequent
 * `ensureWindow` starts from a clean slate rather than handing back a
 * destroyed reference.
 */
export function closeAllWebChatWindows(): void {
  if (liveStatusTimer !== null) {
    clearTimeout(liveStatusTimer);
    liveStatusTimer = null;
  }
  idleStreakCounts.clear();
  generationObserved.clear();
  for (const win of windows.values()) {
    if (!win.isDestroyed()) win.destroy();
  }
  windows.clear();
  for (const target of WEB_CHAT_TARGETS) {
    setStatus(target.id, "idle");
  }
}
