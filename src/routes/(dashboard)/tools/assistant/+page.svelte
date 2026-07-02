<script lang="ts">
  import { Send, Bot, CircleAlert, Sparkles, Square, Copy, Check } from "lucide-svelte";
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import { renderChatMarkdown } from "$lib/sanitize";
  import { streamChat, type ChatMessage } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";

  interface Message {
    role: "user" | "assistant";
    content: string;
    timestamp: string;
    /** Marks an error bubble (rendered with a distinct style, never charged). */
    isError?: boolean;
    /** When true, the assistant bubble shows an "Upgrade plan" CTA (402). */
    needsUpgrade?: boolean;
    /** Set when this reply was cut short by the user pressing Stop. */
    stopped?: boolean;
  }

  // Honest greeting: this is a general Etsy SEO assistant with NO live shop context — it can't
  // read the user's listings/sales, so we don't promise shop-specific "analysis". Client-only,
  // never sent to the LLM (costs nothing).
  const INITIAL_MESSAGES: Message[] = [
    {
      role: "assistant",
      content: "👋 Hi! I'm the VieRank Assistant — a general Etsy SEO helper. I can't see your shop or listings, so I work from whatever you describe or paste in. Share a title, tags, or a question and I can help with:\n\n• **SEO** — tags, titles, descriptions you paste in\n• **Strategy** — pricing, positioning, niche ideas\n• **Listing advice** — how to improve text you share\n• **General know-how** — trends, competition, demand\n\nWhat are you working on?",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ];

  // A couple of starter chips — fill the input so the seller can edit before sending.
  const SUGGESTED_PROMPTS = [
    "Suggest 13 Etsy tags for a hand-poured lavender soy candle",
    "Rewrite this title to be more searchable: ",
    "What makes a strong Etsy listing description?",
  ];

  const STORAGE_KEY = "assistant:conversation";

  let messages = $state<Message[]>(INITIAL_MESSAGES);
  let input = $state("");
  let isTyping = $state(false);
  let isStreaming = $state(false);
  let messagesEndRef = $state<HTMLDivElement>();
  let chatInputRef = $state<HTMLTextAreaElement>();
  let copiedIdx = $state<number | null>(null);

  // True once a real exchange exists (beyond the static greeting). Drives the welcome/empty state.
  const hasConversation = $derived(messages.length > 1);

  // Set when the user hits Stop: the in-flight handlers check this and bail out so no further
  // deltas render. We ALSO abort the fetch (below) so the server stream is cancelled before it
  // reaches the post-[DONE] deduct — pressing Stop no longer costs a credit.
  let stopRequested = $state(false);
  let abortController: AbortController | null = null;

  const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // --- Persistence across reloads (localStorage) ---
  // Persist only real turns; never the static greeting (re-added fresh) or transient bubbles.
  const persist = () => {
    try {
      const real = messages.filter((m) => m !== INITIAL_MESSAGES[0]);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(real));
    } catch {
      // localStorage may be unavailable (private mode / quota) — persistence is best-effort.
    }
  };

  $effect(() => {
    // Restore once on mount.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Message[];
        if (Array.isArray(saved) && saved.length) {
          messages = [INITIAL_MESSAGES[0], ...saved];
        }
      }
    } catch {
      // Ignore corrupt/unavailable storage.
    }
  });

  const clearConversation = () => {
    messages = INITIAL_MESSAGES;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // best-effort
    }
  };

  const scrollToBottom = () => messagesEndRef?.scrollIntoView({ behavior: "smooth" });
  $effect(() => {
    // Re-run on every append/streamed delta: touch the reactive reads we depend on.
    messages;
    isTyping;
    // On the greeting-only screen, DON'T scroll to the bottom — the welcome message is long and
    // scrolling down would hide its top ("👋 Hi!…"). Only follow the conversation once it starts.
    if (messages.length > 1 || isTyping) scrollToBottom();
  });

  /**
   * Render assistant/user content. XSS fix (tech-debt #5 / BR-P2-07): escape ALL HTML first,
   * then turn `**bold**` into <strong>. The ONLY markup that reaches {@html} is <strong>.
   */
  const renderContent = (content: string) => renderChatMarkdown(content);

  const useSuggestion = (prompt: string) => {
    input = prompt;
    chatInputRef?.focus();
    autoGrow();
  };

  // Auto-grow the composer textarea up to a cap (so pasting a long title/description is visible).
  const autoGrow = () => {
    const el = chatInputRef;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  // Enter sends; Shift+Enter inserts a newline (standard chat composer behaviour).
  const onComposerKeydown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isStreaming) void sendMessage();
    }
  };

  const copyMessage = async (content: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(content);
      copiedIdx = idx;
      setTimeout(() => { if (copiedIdx === idx) copiedIdx = null; }, 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  const stopStreaming = () => {
    if (!isStreaming) return;
    stopRequested = true;
    isTyping = false;
    isStreaming = false;
    // Abort the connection → the server cancels its stream BEFORE the post-[DONE] deduct, so the
    // turn isn't charged. Mark the partial reply as stopped.
    abortController?.abort();
    abortController = null;
    const last = messages[messages.length - 1];
    if (last && last.role === "assistant" && !last.isError) last.stopped = true;
    persist();
    void invalidateAll();
  };

  async function sendMessage(e?: SubmitEvent) {
    e?.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userMsg: Message = { role: "user", content: input, timestamp: now() };
    messages = [...messages, userMsg];
    input = "";
    isTyping = true;
    isStreaming = true;
    stopRequested = false;
    abortController = new AbortController();
    // Reset the composer height after the value clears.
    queueMicrotask(autoGrow);

    // History sent to the LLM: real turns only, excluding the static greeting and any
    // error bubbles. The route prepends the system prompt server-side.
    const history: ChatMessage[] = messages
      .filter((m) => !m.isError && m !== INITIAL_MESSAGES[0])
      .map((m) => ({ role: m.role, content: m.content }));

    // Placeholder assistant message that we fill incrementally.
    let assistantIdx = -1;

    await streamChat(history, {
      onChunk: (delta) => {
        if (stopRequested) return; // user cancelled — stop rendering further deltas
        if (assistantIdx === -1) {
          // First delta — replace typing dots with a streaming bubble.
          isTyping = false;
          messages = [...messages, { role: "assistant", content: delta, timestamp: now() }];
          assistantIdx = messages.length - 1;
        } else {
          messages = messages.map((m, i) =>
            i === assistantIdx ? { ...m, content: m.content + delta } : m
          );
        }
      },
      onDone: async (creditsRemaining) => {
        if (stopRequested) return; // already finalized by stopStreaming()
        isTyping = false;
        isStreaming = false;
        abortController = null;
        // Refresh Header credits badge (creditsRemaining confirms the deduct happened).
        void creditsRemaining;
        persist();
        await invalidateAll();
      },
      onError: (err) => {
        if (stopRequested) return; // suppress late errors after a manual stop
        isTyping = false;
        isStreaming = false;
        // Mid-stream or pre-stream error → error bubble, never charged.
        messages = [
          ...messages,
          {
            role: "assistant",
            content: err.message,
            timestamp: now(),
            isError: true,
            needsUpgrade: err.status === 402,
          },
        ];
      },
    }, abortController.signal);

    // After the stream settles, persist the final state (covers the stopped path too).
    persist();
  }
</script>

<ToolPageLayout
  title="VieRank Assistant"
  description="A general Etsy SEO helper — paste a title, tags or a question for plain answers. It can't see your shop, so share the details you want feedback on."
  icon={Sparkles}
  contentWidthClass="max-w-none"
  tightHeader
>
  <!-- Chat panel — a polished, self-contained surface. In the welcome state it hugs its content
       (no tall empty box); once a conversation starts it becomes a tall, scrollable panel. -->
  <div class="chat-shell">
    <!-- Panel header: identity + live status + clear. Hidden in the welcome state (the welcome
         block already presents the identity) so there's no redundant strip / empty gap on top. -->
    {#if hasConversation}
      <header class="chat-header">
        <div class="chat-avatar chat-avatar-brand" aria-hidden="true"><Sparkles size={15} /></div>
        <div class="min-w-0">
          <p class="text-sm font-semibold text-text-primary leading-tight">VieRank Assistant</p>
          <p class="flex items-center gap-1.5 text-[11px] text-text-secondary leading-tight">
            <span class="status-dot"></span> Etsy SEO helper · doesn't see your shop
          </p>
        </div>
        <button type="button" class="chat-clear" onclick={clearConversation} disabled={isStreaming}>
          Clear chat
        </button>
      </header>
    {/if}

    <!-- Messages / welcome -->
    <div class="chat-scroll" class:chat-scroll-welcome={!hasConversation}>
      {#if !hasConversation}
        <!-- Welcome state: centered, fills the panel so it never looks empty. -->
        <div class="welcome">
          <div class="welcome-avatar" aria-hidden="true"><Sparkles size={26} /></div>
          <h2 class="welcome-title">How can I help with your Etsy SEO?</h2>
          <p class="welcome-sub">
            I'm a general SEO assistant — I can't see your shop or listings, so paste a title, tags,
            or a question and I'll help with <strong>SEO</strong>, <strong>strategy</strong>,
            <strong>listing copy</strong>, and <strong>market know-how</strong>.
          </p>
          <div class="welcome-chips">
            {#each SUGGESTED_PROMPTS as p (p)}
              <button type="button" class="suggest-chip" onclick={() => useSuggestion(p)}>
                <Sparkles size={12} class="text-teal flex-shrink-0" />
                <span class="truncate">{p.length > 46 ? p.slice(0, 44) + "…" : p}</span>
              </button>
            {/each}
          </div>
        </div>
      {:else}
        {#each messages as msg, i (i)}
          {#if msg !== INITIAL_MESSAGES[0]}
            <div class="msg-row {msg.role === 'user' ? 'msg-row-user' : ''}">
              {#if msg.role === "assistant"}
                <div class="chat-avatar {msg.isError ? 'chat-avatar-error' : 'chat-avatar-brand'}" aria-hidden="true">
                  {#if msg.isError}<CircleAlert size={15} />{:else}<Bot size={15} />{/if}
                </div>
              {/if}
              <div class="msg-col {msg.role === 'user' ? 'items-end' : ''}">
                <div class="bubble {msg.role === 'user' ? 'bubble-user' : msg.isError ? 'bubble-error' : 'bubble-assistant'}">
                  <!-- {@html} is safe: renderChatMarkdown escapes HTML first; only <strong>/<ul>/<ol>/<li>/<br> it emits reach the DOM (sanitize.ts). -->
                  <div class="chat-md">{@html renderContent(msg.content)}</div>
                  {#if msg.stopped}
                    <p class="text-[11px] opacity-70 italic mt-1.5">Stopped — you weren't charged.</p>
                  {/if}
                  {#if msg.needsUpgrade}
                    <a href="/pricing" class="btn btn-primary mt-2.5" style="padding: 6px 16px; font-size: 0.75rem;">Upgrade plan</a>
                  {/if}
                </div>
                <div class="msg-meta {msg.role === 'user' ? 'justify-end' : ''}">
                  <span>{msg.timestamp}</span>
                  {#if msg.role === "assistant" && !msg.isError && msg.content.trim()}
                    <button type="button" onclick={() => copyMessage(msg.content, i)} class="msg-copy" aria-label="Copy reply">
                      {#if copiedIdx === i}<Check size={11} class="text-success" /> Copied{:else}<Copy size={11} /> Copy{/if}
                    </button>
                  {/if}
                </div>
              </div>
            </div>
          {/if}
        {/each}
        {#if isTyping}
          <div class="msg-row">
            <div class="chat-avatar chat-avatar-brand" aria-hidden="true"><Bot size={15} /></div>
            <div class="bubble bubble-assistant">
              <div class="flex gap-1 py-0.5"><span class="typing-dot" style="animation-delay: 0ms"></span><span class="typing-dot" style="animation-delay: 150ms"></span><span class="typing-dot" style="animation-delay: 300ms"></span></div>
            </div>
          </div>
        {/if}
        <div bind:this={messagesEndRef}></div>
      {/if}
    </div>

    <!-- Composer -->
    <form onsubmit={sendMessage} class="chat-composer">
      <div class="composer-box" class:composer-busy={isStreaming}>
        <textarea bind:this={chatInputRef} bind:value={input} oninput={autoGrow} onkeydown={onComposerKeydown} rows={1} placeholder="Paste a title or tags, or ask an Etsy SEO question…" class="composer-input" disabled={isStreaming} data-testid="chat-input"></textarea>
        {#if isStreaming}
          <button type="button" onclick={stopStreaming} aria-label="Stop generating" class="composer-btn composer-btn-stop" data-testid="chat-stop">
            <Square size={14} />
          </button>
        {:else}
          <button type="submit" disabled={!input.trim()} aria-label="Send message" class="composer-btn composer-btn-send" data-testid="chat-send">
            <Send size={15} />
          </button>
        {/if}
      </div>
      <p class="composer-hint">
        <span><kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line</span>
        <span class="text-text-muted">2 credits per message</span>
      </p>
    </form>
  </div>
</ToolPageLayout>

<style>
  /* ---- Panel shell ---- */
  .chat-shell {
    display: flex;
    flex-direction: column;
    /* Fill the space between the (tightened) PageHeader and the page footer so there's no empty
       band below the panel. Subtract the surrounding chrome: app header (--header-height) +
       main padding + tightened PageHeader + footer ≈ 235px. */
    height: calc(100vh - var(--header-height) - 235px);
    min-height: 360px;
    max-height: 820px;
    background: #fff;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-md);
    overflow: hidden;
  }

  /* ---- Header ---- */
  .chat-header {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border-light);
    background: #fff;
  }
  .chat-clear {
    margin-left: auto;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-secondary);
    padding: 0.3rem 0.7rem;
    border-radius: var(--radius-full);
    border: 1px solid var(--border);
    background: #fff;
    transition: color var(--transition-fast), border-color var(--transition-fast), background var(--transition-fast);
  }
  .chat-clear:hover:not(:disabled) { color: var(--teal); border-color: var(--teal); background: var(--bg-page); }
  .chat-clear:disabled { opacity: 0.5; cursor: not-allowed; }

  .status-dot {
    width: 7px; height: 7px; border-radius: 9999px;
    background: var(--success);
    box-shadow: 0 0 0 3px var(--success-bg);
    flex-shrink: 0;
  }

  /* ---- Avatars ---- */
  .chat-avatar {
    width: 30px; height: 30px;
    border-radius: 9999px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    color: #fff;
  }
  .chat-avatar-brand { background: linear-gradient(135deg, var(--teal-light), var(--teal-dark)); }
  .chat-avatar-error { background: var(--danger-bg); color: var(--danger); }

  /* ---- Scroll / message list ---- */
  .chat-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.125rem;
    /* subtle tinted canvas so white assistant bubbles lift off the surface */
    background:
      radial-gradient(120% 60% at 50% 0%, rgba(0, 117, 74, 0.035), transparent 70%),
      var(--bg-page);
  }
  .msg-row { display: flex; align-items: flex-start; gap: 0.625rem; }
  .msg-row-user { flex-direction: row-reverse; }
  /* cap line length for readability even when the panel is full-width */
  .msg-col { display: flex; flex-direction: column; max-width: min(80%, 680px); min-width: 0; }

  /* ---- Bubbles ---- */
  .bubble {
    padding: 0.625rem 0.875rem;
    font-size: 0.875rem;
    line-height: 1.6;
    border-radius: var(--radius-lg);
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  .bubble-assistant {
    background: #fff;
    color: var(--text-primary);
    border: 1px solid var(--border-light);
    border-bottom-left-radius: var(--radius-sm);
    box-shadow: var(--shadow-sm);
  }
  .bubble-user {
    background: linear-gradient(135deg, var(--teal), var(--teal-dark));
    color: #fff;
    border-bottom-right-radius: var(--radius-sm);
    box-shadow: 0 2px 6px rgba(0, 117, 74, 0.22);
  }
  .bubble-error {
    background: var(--danger-bg);
    color: var(--text-primary);
    border: 1px solid color-mix(in srgb, var(--danger) 28%, transparent);
    border-bottom-left-radius: var(--radius-sm);
  }

  /* ---- Meta (timestamp + copy): quiet, surfaces on row hover ---- */
  .msg-meta {
    display: flex; align-items: center; gap: 0.5rem;
    margin-top: 0.3rem;
    font-size: 0.625rem;
    color: var(--text-muted);
    opacity: 0;
    transition: opacity var(--transition-fast);
  }
  .msg-row:hover .msg-meta { opacity: 1; }
  .msg-copy {
    display: inline-flex; align-items: center; gap: 0.2rem;
    color: var(--text-muted);
    transition: color var(--transition-fast);
  }
  .msg-copy:hover { color: var(--teal); }

  .typing-dot {
    width: 6px; height: 6px; border-radius: 9999px;
    background: var(--text-muted);
    animation: chat-bounce 1.2s infinite ease-in-out;
  }
  @keyframes chat-bounce {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
    30% { transform: translateY(-4px); opacity: 1; }
  }

  /* ---- Welcome / empty state ---- */
  /* align-items centers horizontally; vertical centering is via `.welcome { margin: auto }`
     so that when the panel is short and content overflows, the auto margins collapse to 0,
     the block top-aligns, and the scroll area stays usable (no clipped chips). */
  .chat-scroll-welcome { align-items: center; gap: 0; }
  .welcome {
    display: flex; flex-direction: column; align-items: center;
    text-align: center; gap: 0.7rem;
    max-width: 560px; margin: auto; padding: 1rem 1.25rem;
  }
  .welcome-avatar {
    width: 50px; height: 50px;
    border-radius: 9999px;
    display: flex; align-items: center; justify-content: center;
    color: #fff;
    background: linear-gradient(135deg, var(--teal-light), var(--teal-dark));
    box-shadow: 0 8px 20px rgba(0, 117, 74, 0.25);
  }
  .welcome-title { font-size: 1.1875rem; font-weight: 700; color: var(--text-primary); line-height: 1.3; }
  .welcome-sub { font-size: 0.84375rem; line-height: 1.55; color: var(--text-secondary); }
  .welcome-sub strong { color: var(--text-primary); font-weight: 600; }
  .welcome-chips {
    display: flex; flex-wrap: wrap; gap: 0.5rem;
    justify-content: center;
    margin-top: 0.35rem;
  }

  /* ---- Suggested chips ---- */
  .suggest-chip {
    display: inline-flex; align-items: center; gap: 0.4rem;
    max-width: 100%;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    padding: 0.4rem 0.8rem;
    border-radius: var(--radius-full);
    border: 1px solid var(--border);
    background: #fff;
    transition: color var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast);
  }
  .suggest-chip:hover {
    color: var(--teal);
    border-color: var(--teal);
    box-shadow: var(--shadow-sm);
    transform: translateY(-1px);
  }

  /* ---- Composer ---- */
  .chat-composer {
    padding: 0.875rem 1rem 0.75rem;
    background: #fff;
    border-top: 1px solid var(--border-light);
  }
  .composer-box {
    display: flex; align-items: flex-end; gap: 0.5rem;
    padding: 0.4rem 0.4rem 0.4rem 0.875rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: #fff;
    box-shadow: var(--shadow-sm);
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  }
  .composer-box:focus-within {
    border-color: var(--teal);
    box-shadow: 0 0 0 3px rgba(0, 117, 74, 0.13);
  }
  .composer-busy { opacity: 0.85; }
  .composer-input {
    flex: 1;
    border: none;
    background: transparent;
    resize: none;
    outline: none;
    font-size: 0.875rem;
    line-height: 1.55;
    color: var(--text-primary);
    padding: 0.3rem 0;
    max-height: 160px;
  }
  .composer-input::placeholder { color: var(--text-muted); }
  .composer-input:disabled { cursor: not-allowed; }
  /* The rounded composer-box already shows focus via :focus-within; suppress the global
     rectangular :focus-visible outline (app.css) that otherwise draws an ugly box inside. */
  .composer-input:focus,
  .composer-input:focus-visible { outline: none !important; }
  .composer-btn {
    flex-shrink: 0;
    width: 38px; height: 38px;
    border-radius: 9999px;
    display: flex; align-items: center; justify-content: center;
    transition: background var(--transition-fast), transform 120ms var(--ease-out), box-shadow var(--transition-fast);
  }
  .composer-btn-send { background: var(--teal); color: #fff; }
  .composer-btn-send:hover:not(:disabled) { background: var(--teal-dark); box-shadow: var(--shadow-sm); }
  .composer-btn-send:active:not(:disabled) { transform: scale(0.94); }
  .composer-btn-send:disabled { background: #d3ddd8; color: #fff; cursor: not-allowed; }
  .composer-btn-stop { background: #fff; color: var(--teal); border: 1px solid var(--teal); }
  .composer-btn-stop:hover { background: var(--bg-page); }

  .composer-hint {
    display: flex; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap;
    margin-top: 0.55rem;
    font-size: 0.6875rem;
    color: var(--text-secondary);
  }
  .composer-hint kbd {
    font-family: inherit;
    font-size: 0.625rem;
    padding: 0.05rem 0.3rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-page);
    color: var(--text-secondary);
  }

  /* Style the markdown lists emitted by renderChatMarkdown (rendered via {@html}, hence :global). */
  .chat-md :global(ul) { list-style: disc; padding-left: 1.15rem; margin: 0.3rem 0; }
  .chat-md :global(ol) { list-style: decimal; padding-left: 1.25rem; margin: 0.3rem 0; }
  .chat-md :global(li) { margin: 0.1rem 0; }
  .chat-md :global(strong) { font-weight: 600; }
  /* keep links/strong legible inside the teal user bubble */
  .bubble-user .chat-md :global(strong) { color: #fff; }
</style>
