# PLAN.md: Standalone Web-Chat Powered Agent Harness (OpenCode-Style UI)

An architectural blueprint and engineering roadmap for building a standalone autonomous coding agent harness powered by **Web Chat LLM Scraping** (DeepSeek, ChatGPT, Claude, Gemini) instead of paid API models, featuring an **OpenCode-inspired UI**, interactive tool execution, multi-turn conversation loops in the same chat thread, and the same modern Electron + React 19 + TypeScript + Tailwind CSS v4 tech stack.

---

## 1. Executive Summary & Core Motivation

### Why a Web-Chat Agent Harness?
Modern AI coding agents (such as OpenCode, Claude Code, Aider, and Roo Code) rely heavily on model APIs (Anthropic Claude 3.7 Sonnet, OpenAI o1/GPT-4o, DeepSeek V3/R1). For active developers, multi-turn agentic loops consume millions of tokens rapidly, generating prohibitive API bills.

Meanwhile, many developers already have web subscriptions (ChatGPT Plus, Claude Pro) or access to free, highly capable web platforms (DeepSeek Chat with free DeepThink R1, ChatGPT Free, Gemini).

**This project creates a developer-grade agent harness that replaces the API layer with automated Web Chat sessions**:
1. **Zero API Cost**: Interacts with web LLMs using background Electron browser windows and persistent user login sessions.
2. **In-Thread Multi-Turn Conversations**: Feeds tool results back into the **same ongoing web chat session**, allowing the web platform to natively handle context history and memory without re-sending massive prompt histories.
3. **OpenCode-Inspired Interface**: Clean, terminal-and-cockpit developer interface featuring collapsible thinking traces, interactive tool execution cards, streaming terminal boxes, and inline unified diff viewers.
4. **Configurable Safety**: Default semi-autonomous operation (auto-approves read/inspect operations, asks for confirmation on shell commands and file mutations, with one-click full-auto YOLO toggle).

---

## 2. Technology Stack & Architectural Alignment

| Component | Technology | Rationale & Reliability Justification |
| :--- | :--- | :--- |
| **App Shell** | **Electron 34+ / 44+** | Native process execution (`child_process`), filesystem access, and headless/hidden browser sessions with persistent user partitions (`partition: 'persist:agent-webchat'`). |
| **Build System** | **electron-vite + Vite 7** | Sub-second HMR in development, optimal tree-shaking, and clean multi-target bundles (Main, Preload, Renderer). |
| **Frontend Framework** | **React 19 + TypeScript 5.7+** | Component model, hooks, strict type safety across all IPC bridges and state trees. |
| **Styling** | **Tailwind CSS v4** | Clean dark-mode developer aesthetic, low-overhead utility styling, OpenCode visual language. |
| **State Management** | **Zustand 5** | Unopinionated, lightweight stores for sessions, timeline messages, active tool runs, and diff reviews. |
| **Terminal Runner** | **`node-pty` + `xterm.js`** | True pseudo-terminal (TTY) allocation for authentic shell execution (ANSI colors, interactive curses, `git diff`). |
| **Browser Automation** | **`webContents.debugger` (CDP)** + DOM Injection | Hardware-level mouse/keyboard events (`Input.dispatchMouseEvent`) and native file drops (`DOM.setFileInputFiles`) bypassing synthetic event limits. |
| **Database & Persistence**| **`better-sqlite3`** | ACID-compliant embedded SQLite for instantaneous session indexing, full-text search, and crash-resilient diff history. |
| **Code & Diffs** | **Monaco Editor + react-diff-viewer-continued** | High-performance syntax highlighting, side-by-side or inline unified diff review with reject/accept capabilities. |
| **Testing** | **Vitest 5 + Playwright** | Fast unit testing for parsers, safety rules, and scrapers; headless E2E testing. |

---

## 3. High-Level Architecture Diagram

```
+---------------------------------------------------------------------------------------------------------+
|                                        RENDERER PROCESS (React 19)                                      |
|                                                                                                         |
|  +---------------------------+  +-------------------------------------+  +---------------------------+  |
|  |       Sessions Sidebar    |  |       Agent Cockpit / Timeline      |  |     Context & Diffs Panel |  |
|  | - Chat Sessions List      |  | - User Goals & Instructions         |  | - Modified Files Tree     |  |
|  | - Target Selector Status  |  | - Collapsible Thinking Traces       |  | - Monaco Unified Diff     |  |
|  | - Workspace Explorer      |  | - Tool Execution Cards (Shell/File) |  | - Git Staging / Discard   |  |
|  | - Model Quick Switch      |  | - Composer (@file, /plan, /mode)    |  | - Token / Turn Counters   |  |
|  +---------------------------+  +-------------------------------------+  +---------------------------+  |
+---------------------------------------------------------------------------------------------------------+
                                                     ▲
                                                     │ IPC Bridge (Typed Handlers & Events)
                                                     ▼
+---------------------------------------------------------------------------------------------------------+
|                                         MAIN PROCESS (Node.js)                                          |
|                                                                                                         |
|  +-------------------------+    +----------------------------+    +----------------------------------+  |
|  |   Agent Orchestrator    |    |  Execution Engine & Tools  |    |     Web Chat Scraping Engine     |  |
|  | - Turn State Machine    |───▶| - run_command (node-pty)   |    | - Hidden Electron BrowserWindows |  |
|  | - Tool Protocol Parser  |    | - read_file / write_file   |    | - Chromium CDP (debugger attach) |  |
|  | - Permission Gateway    |    | - replace_file_content     |    | - Status Poller (1s debounce)    |  |
|  | - SQLite Store (Session)|    | - list_directory / ask_user|    | - Sentinel Clipboard & DOM Copy  |  |
|  | - Multi-Turn Loop       |    |                            |    | - Same-Thread Prompt Delivery    |  |
|  +-------------------------+    +----------------------------+    +----------------------------------+  |
+---------------------------------------------------------------------------------------------------------+
                                                                                    │ In-Page JS + CDP Automation
                                                                                    ▼
                                                                    +----------------------------------+
                                                                    |   External Web Chat Sessions     |
                                                                    | - DeepSeek (chat.deepseek.com)   |
                                                                    | - ChatGPT (chatgpt.com)          |
                                                                    | - Claude (claude.ai)             |
                                                                    +----------------------------------+
```

---

## 4. OpenCode-Style User Interface Blueprint

The interface directly reflects OpenCode's clean, developer-first layout:

```
+---------------------------------------------------------------------------------------------------------+
| [AppName]  Project: /workspace/my-app   | Target: [DeepSeek V3/R1 ▼ (Working ⚡)]   | [⚙ Settings] [_][□][✕] |
+------------------+-------------------------------------------------------------+------------------------+
| SESSIONS         | TIMELINE / AGENT COCKPIT                                    | WORKSPACE & DIFFS      |
|                  |                                                             |                        |
| + New Session    | 👤 User: Fix the failing tests in auth.test.ts              | Modified Files (2):    |
|                  | ----------------------------------------------------------- | • src/auth.ts (+12/-4) |
| • Refactor Auth  | 🧠 Thinking (12.4s) [Expand ▼]                              | • tests/auth.test.ts   |
|   14 mins ago    |                                                             |                        |
| • Add DarkMode   | 🛠️ Tool: run_command [Exit: 1 ✕]                           | Active File Diff:      |
|   Yesterday      |    $ npm test tests/auth.test.ts                            | ---------------------- |
|                  |    [Terminal Output: 4 tests passed, 1 failed...]           | @@ -45,7 +45,9 @@      |
| ---------------- |                                                             | -  return false;       |
| TARGETS          | 🛠️ Tool: replace_file_content (Pending Approval ⚠️)        | +  if (!token) return; |
|                  |    File: src/auth.ts                                        | +  return verify(tok); |
| [●] DeepSeek R1  |    [Diff Preview: +2 lines, -1 line]                        |                        |
| [○] ChatGPT 4o   |    [✔ Approve] [✖ Reject] [Auto-run this session]           | [Apply All] [Discard]  |
| [○] Claude 3.7   |                                                             |                        |
|                  | 💬 Agent: I identified that `token` validation was missing. | Git Status:            |
|                  |           Once approved, I will re-run the tests.           | Branch: main [Clean]   |
|                  | ----------------------------------------------------------- |                        |
|                  | [💬 Type instructions or feedback (@file, /plan)... ] [Send]| Quick Actions          |
+------------------+-------------------------------------------------------------+------------------------+
```

### Key UI Features:
1. **Collapsible Thinking Traces**: Native support for DeepSeek R1 / Claude 3.7 thinking blocks rendered inside clean, collapsible accordions with elapsed duration timers.
2. **Interactive Tool Execution Cards**:
   - **Terminal Tool (`run_command`)**: Shows status badge (Running / Exit 0 / Exit 1), execution duration, working directory, and embedded scrollable ANSI terminal box (`xterm.js`) with kill/cancel buttons.
   - **File Mutation Tools (`write_file`, `replace_file_content`)**: Renders inline diff previews directly in the conversation flow with immediate Approve / Reject controls.
   - **User Input Tool (`ask_user`)**: Renders interactive selectable options and text input fields when the agent requests user decisions.
3. **Permission Bar & Execution Controls**:
   - Global toggle: **Interactive (Default)** vs. **Full Auto (YOLO)** mode.
   - **Pause / Step-by-Step / Abort** buttons at the top of the timeline.
4. **Context Autocomplete**: Typing `@` opens a fuzzy-search popup over workspace files; typing `/` opens slash command shortcuts (`/plan`, `/compact`, `/undo`, `/diff-review`).

---

## 5. Web Chat Automation Engine (Scraping Core)

The web automation layer builds directly upon the proven scraper architecture from AnythingButProPlan:

### 5.1 Multi-Target Provider Definitions
Targets are defined with fallback selectors and site-specific DOM behaviors:

```typescript
export interface WebChatTarget {
  id: "deepseek" | "chatgpt" | "claude" | "gemini";
  label: string;
  url: string;
  inputSelectors: string[];
  sendSelectors: string[];
  responseSelectors: string[];
  stopSelectors: string[];
  copySelectors: string[];
}
```

- **DeepSeek**: Supports `textarea#chat-input`, custom send buttons, `.ds-markdown` response containers, square rect SVG stop button detection in the composer, and `.ds-thinking` reasoning blocks.
- **ChatGPT**: Supports `#prompt-textarea`, ProseMirror `div[contenteditable="true"]`, `button[data-testid="send-button"]`, and `button[data-testid="stop-button"]`.
- **Claude**: Supports ProseMirror editor, `.font-claude-message`, stop button, and copy action buttons.

### 5.2 Turn Delivery & In-Thread Loop
Unlike single-turn prompt generators, this agent harness conducts an ongoing dialogue inside the same web session:

1. **Turn 1 (Bootstrap Turn)**:
   - Delivers System Prompt (defining agent personality, XML tool call schemas, strict output rules).
   - Injects Workspace Context (directory map, key file outlines, project conventions).
   - Submits User Goal.
2. **Turn 2+ (Tool Response Turns)**:
   - Formats tool outputs into standard XML:
     ```xml
     <tool_result name="run_command">
     {
       "ExitCode": 0,
       "Stdout": "Tests: 12 passed, 12 total\nTime: 1.42s",
       "Stderr": ""
     }
     </tool_result>
     ```
   - Focuses the existing chat window, inputs the `<tool_result>` text into the composer, and clicks the Send button.
   - **Zero Context Re-inflation**: DeepSeek / ChatGPT maintains its own native context window!

### 5.3 Debounced Status Poller & Response Scraper
- **State Machine Debouncing**:
  - `working` detected immediately on active stop button, spinner, reasoning block, or streaming cursor.
  - Requires **2 consecutive 1000ms idle polls** (`IDLE_CONFIRMATION_THRESHOLD = 2`) to confirm that generation has truly halted.
- **Sentinel Clipboard & DOM Scraper**:
  - Plants a unique sentinel (`__sentinel_${Date.now()}__`) on the OS clipboard.
  - Clicks the assistant's message-level copy button.
  - Negative filters exclude elements inside user messages (`[data-message-author-role="user"]`, `.user-message`) and composer inputs (`form`, `textarea`, `#chat-input`).
  - Code-block controls are excluded (`isCodeBlockControl`) to prevent partial code snippet truncation.
  - Scraped text is validated against cleaned DOM content; truncated or corrupt fragments are automatically rejected in favor of full DOM text.

---

## 6. Agent Loop & Tool Execution Engine

### 6.1 Tool Protocol Specification
The LLM communicates via structured XML tags within its markdown text:

```markdown
I have analyzed the failing test. The issue is an unhandled null check in `src/auth.ts`.
Let me inspect lines 40-60 of `src/auth.ts`.

<thought>
Inspect auth.ts around verifyToken function to locate the missing check.
</thought>

<tool_call name="read_file">
{
  "AbsolutePath": "src/auth.ts",
  "StartLine": 40,
  "EndLine": 60
}
</tool_call>
```

### 6.2 Core Built-In Tools

1. **`run_command`**:
   - **Implementation**: Powered by `node-pty` allocating a real pseudo-terminal.
   - **Schema**: `{ "CommandLine": string, "Cwd"?: string, "WaitMsBeforeAsync"?: number }`
   - Streams live stdout/stderr chunks via IPC to the renderer `xterm.js` terminal card.
   - Supports process kill signals (`SIGINT`, `SIGTERM`).

2. **`read_file`**:
   - **Schema**: `{ "AbsolutePath": string, "StartLine"?: number, "EndLine"?: number }`
   - Reads files safely with encoding detection and line-number indexing.

3. **`write_file`**:
   - **Schema**: `{ "TargetFile": string, "CodeContent": string, "Overwrite"?: boolean }`
   - Creates parent directories automatically; computes before/after diffs for user review before writing.

4. **`replace_file_content`**:
   - **Schema**: `{ "TargetFile": string, "StartLine": number, "EndLine": number, "TargetContent": string, "ReplacementContent": string }`
   - Performs surgical string replacement with strict line-range verification and whitespace tolerance.

5. **`list_directory`**:
   - **Schema**: `{ "DirectoryPath": string, "Recursive"?: boolean, "Depth"?: number }`
   - Returns directory hierarchy respecting `.gitignore`.

6. **`ask_user`**:
   - **Schema**: `{ "Question": string, "Options"?: string[] }`
   - Suspends the agent loop, rendering interactive choice buttons or write-in inputs in the timeline.

### 6.3 Permission Gateway & Safety Controls
- **Permission Matrix**:
  - `read_file`, `list_directory`: Auto-approved by default (read-only).
  - `run_command`: Configurable (Default: prompts user with a "Run Command" button, or Auto if toggled).
  - `write_file`, `replace_file_content`: Generates inline diff; user can click "Apply Edit" or enable session-wide auto-apply.
- **Safety Safeguards**:
  - Commands matching destructive patterns (`rm -rf /`, `mkfs`, `dd`, `git reset --hard`) are strictly hard-blocked or always require explicit confirmation.

---

## 7. Project Structure & Code Layout

```
my-agent-harness/
├── electron-builder.yml            # Cross-platform packaging config
├── electron.vite.config.ts         # Multi-target Vite bundler config
├── package.json                    # Dependencies (React 19, Tailwind v4, node-pty, better-sqlite3)
├── src/
│   ├── main/
│   │   ├── index.ts                # App startup, window creation, lifecycle
│   │   ├── ipc.ts                  # Typed IPC bridge handlers
│   │   ├── services/
│   │   │   ├── agent/
│   │   │   │   ├── orchestrator.ts # Core agentic state machine loop
│   │   │   │   ├── parser.ts       # XML <tool_call> and <thought> parser
│   │   │   │   ├── permissions.ts  # Approval gateway & safety rules
│   │   │   │   └── prompt.ts       # System prompt & tool definitions
│   │   │   ├── tools/
│   │   │   │   ├── runner.ts       # node-pty terminal runner
│   │   │   │   ├── filesystem.ts   # read_file, write_file, replace_file_content
│   │   │   │   └── explorer.ts     # list_directory with .gitignore
│   │   │   ├── web-chat/
│   │   │   │   ├── targets.ts      # Provider definitions (DeepSeek, ChatGPT, Claude)
│   │   │   │   ├── window-pool.ts  # BrowserWindow manager with persistent sessions
│   │   │   │   ├── poller.ts       # Debounced status inspection engine
│   │   │   │   ├── scraper.ts      # Sentinel clipboard & clean DOM extractor
│   │   │   │   └── cdp.ts          # Chromium DevTools Protocol automation
│   │   │   └── db/
│   │   │       ├── database.ts     # better-sqlite3 connection manager
│   │   │       └── repository.ts   # Session & message persistence queries
│   ├── preload/
│   │   └── index.ts                # contextBridge exposing window.agentApi
│   ├── renderer/
│   │   ├── index.html              # App entry HTML
│   │   ├── src/
│   │   │   ├── App.tsx             # Main layout shell
│   │   │   ├── stores/
│   │   │   │   ├── session-store.ts # Active session, messages, timeline
│   │   │   │   ├── target-store.ts  # Web chat targets & live statuses
│   │   │   │   └── diff-store.ts    # Modified files & active diff review
│   │   │   ├── components/
│   │   │   │   ├── Sidebar/
│   │   │   │   │   ├── SessionList.tsx
│   │   │   │   │   ├── TargetSelector.tsx
│   │   │   │   │   └── WorkspaceTree.tsx
│   │   │   │   ├── Cockpit/
│   │   │   │   │   ├── Timeline.tsx
│   │   │   │   │   ├── ThinkingCard.tsx
│   │   │   │   │   ├── ToolCard.tsx
│   │   │   │   │   ├── TerminalWidget.tsx (xterm.js)
│   │   │   │   │   ├── InlineDiffCard.tsx
│   │   │   │   │   └── Composer.tsx
│   │   │   │   └── Inspector/
│   │   │   │       ├── DiffViewer.tsx (Monaco)
│   │   │   │       └── FileChangesList.tsx
│   │   │   └── styles/
│   │   │       └── globals.css     # Tailwind CSS v4 styling
│   └── shared/
│       ├── types.ts                # Shared types (TimelineEntry, ToolCall, etc.)
│       └── ipc-channels.ts         # IPC channel constants
└── tests/
    └── unit/
        ├── parser.test.ts          # XML tool parser tests
        ├── permissions.test.ts     # Safety & permission tests
        └── scraper.test.ts         # Status inspection & scraper tests
```

---

## 8. Step-by-Step Implementation Roadmap

### Phase 1: Repository Foundation & Shell (Days 1–2)
1. Initialize project using `npm create @quick-start/electron my-agent-harness -- --template react-ts`.
2. Configure Tailwind CSS v4, Lucide icons, Monaco editor, and Vitest.
3. Configure `electron-vite.config.ts` with source aliases (`@main`, `@renderer`, `@shared`).

### Phase 2: Web Chat Automation Engine (Days 3–4)
1. Port Electron hidden `BrowserWindow` manager with `persist:agent-webchat` partition.
2. Implement multi-target definitions (DeepSeek, ChatGPT, Claude) with resilient selectors.
3. Build the 1s debounced status inspection script (`STATUS_INSPECTION_SCRIPT`) detecting `working`, `paused`, and confirmed `idle`.
4. Implement action-bar copy button scraping with OS clipboard sentinels, DOM fallback, and code-block control exclusion.
5. Implement in-thread subsequent turn prompt delivery.

### Phase 3: Tool Execution & Safety Engine (Days 5–6)
1. Build `ProcessRunner` using `node-pty` supporting streaming stdout/stderr, cwd management, and process kill signals.
2. Build filesystem tools (`read_file`, `write_file`, `replace_file_content`, `list_directory`).
3. Build `ToolCallParser` to robustly extract `<thought>...</thought>` and `<tool_call name="...">...</tool_call>` from LLM text.
4. Build `PermissionGateway` with configurable approval policies (Safe vs. YOLO mode).
5. Set up `better-sqlite3` schema for session persistence.

### Phase 4: OpenCode-Style Renderer UI (Days 7–9)
1. Build three-column cockpit layout (Sessions Sidebar, Main Timeline, Context & Diffs Drawer).
2. Implement Timeline cards:
   - Collapsible thinking accordions with live elapsed counters.
   - Interactive Tool Cards with terminal stream boxes (`xterm.js`) and status badges.
   - Inline and Drawer diff viewers using `react-diff-viewer-continued` / Monaco diff.
   - User approval banners with keyboard shortcuts (Enter to Approve, Esc to Reject).
3. Build Composer with `@file` context autocomplete and slash command menu (`/plan`, `/compact`, `/undo`).

### Phase 5: Agent Loop Orchestration & Testing (Days 10–11)
1. Wire up the full multi-turn cycle: User Goal $\to$ Web Chat $\to$ Status Detection $\to$ Scrape $\to$ Parse $\to$ Tool Execution $\to$ Tool Result $\to$ Web Chat Next Turn.
2. Write unit tests for tool parsing, diff generation, status debounce, and permission rules.
3. Add end-to-end task test: give agent a repo with a failing unit test, verify it autonomously reads files, runs tests, applies fix, verifies test pass, and stops.

### Phase 6: Packaging & Distribution (Day 12)
1. Configure `electron-builder` for Linux (`AppImage`, `.deb`) and Windows (`NSIS`).
2. Add comprehensive documentation, quickstart guide, and keyboard shortcuts cheat sheet.

---

## 9. Verification & Success Criteria

1. **Scraping Integrity**:
   - Zero truncated responses; guaranteed capture of complete code blocks and markdown.
   - Zero accidental re-sends of past user prompts.
   - Browsing chat history never triggers spurious scraping.
2. **Autonomous Tool Loop**:
   - Successfully runs multi-turn loops (at least 5 consecutive tool turns) inside the **same web chat thread** without losing conversation context or hallucinating tool output.
3. **Developer Experience**:
   - Clean, dark-mode OpenCode aesthetic with smooth animations and sub-second UI responsiveness.
   - Interactive terminal displays ANSI color codes cleanly and handles long-running build commands without freezing the app shell.
