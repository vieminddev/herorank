<script lang="ts">
  import { Send, Bot, User, CircleAlert } from "lucide-svelte";
  import { renderBold } from "$lib/sanitize";
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
  }

  // Static UI greeting — client-only, never sent to the LLM (costs nothing).
  const INITIAL_MESSAGES: Message[] = [
    {
      role: "assistant",
      content: "👋 Hi! I'm the VieRank Assistant — here to help with your shop. I can help with:\n\n• **SEO optimization** — tags, titles, descriptions\n• **Shop strategy** — pricing, positioning, niche research\n• **Listing advice** — what to improve and how\n• **Market analysis** — trends, competition, demand\n\nWhat would you like help with today?",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ];

  let messages = $state<Message[]>(INITIAL_MESSAGES);
  let input = $state("");
  let isTyping = $state(false);
  let isStreaming = $state(false);
  let messagesEndRef = $state<HTMLDivElement>();

  const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const scrollToBottom = () => messagesEndRef?.scrollIntoView({ behavior: "smooth" });
  $effect(() => {
    // Re-run on every append/streamed delta: touch the reactive reads we depend on.
    messages;
    isTyping;
    scrollToBottom();
  });

  /**
   * Render assistant/user content. XSS fix (tech-debt #5 / BR-P2-07): escape ALL HTML first,
   * then turn `**bold**` into <strong>. The ONLY markup that reaches {@html} is <strong>.
   */
  const renderContent = (content: string) => renderBold(content);

  const sendMessage = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userMsg: Message = { role: "user", content: input, timestamp: now() };
    messages = [...messages, userMsg];
    input = "";
    isTyping = true;
    isStreaming = true;

    // History sent to the LLM: real turns only, excluding the static greeting and any
    // error bubbles. The route prepends the system prompt server-side.
    const history: ChatMessage[] = messages
      .filter((m) => !m.isError && m !== INITIAL_MESSAGES[0])
      .map((m) => ({ role: m.role, content: m.content }));

    // Placeholder assistant message that we fill incrementally.
    let assistantIdx = -1;

    await streamChat(history, {
      onChunk: (delta) => {
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
        isTyping = false;
        isStreaming = false;
        // Refresh Header credits badge (creditsRemaining confirms the deduct happened).
        void creditsRemaining;
        await invalidateAll();
      },
      onError: (err) => {
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
    });
  };
</script>

<div class="max-w-3xl mx-auto animate-fade-in flex flex-col" style="height: calc(100vh - var(--header-height) - 48px)">
  <!-- Header — editorial, no gradient chrome -->
  <header class="mb-5">
    <p class="section-kicker mb-1">VieRank Assistant</p>
    <h1 class="text-[1.75rem] font-semibold tracking-tight text-text-primary">Ask about your shop</h1>
    <p class="lead mt-1.5 text-sm max-w-xl">Tags, titles, pricing, what to fix — plain answers, no fluff.</p>
  </header>

  <!-- Chat container — a single quiet surface -->
  <div class="card flex flex-col flex-1 min-h-0">
    <!-- Messages -->
    <div class="flex-1 overflow-y-auto p-5 space-y-5">
      {#each messages as msg, i (i)}
        <div class="flex items-start gap-3 {msg.role === 'user' ? 'flex-row-reverse' : ''}">
          <div class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 {msg.role === 'assistant' ? (msg.isError ? 'bg-danger/10 text-danger' : 'bg-bg-page text-teal') : 'bg-teal text-white'}">
            {#if msg.role === "assistant"}
              {#if msg.isError}<CircleAlert size={15} />{:else}<Bot size={15} />{/if}
            {:else}<User size={15} />{/if}
          </div>
          <div class="max-w-[78%] {msg.role === 'user' ? 'text-right' : ''}">
            <div class="inline-block px-3.5 py-2.5 rounded-xl text-sm leading-relaxed text-left {msg.role === 'user' ? 'bg-teal text-white rounded-br-sm' : msg.isError ? 'bg-danger/5 border border-danger/20 text-text-primary rounded-bl-sm' : 'bg-bg-page text-text-primary rounded-bl-sm'}">
              <!-- {@html} is safe: renderContent escapes HTML before applying **bold** (sanitize.ts). -->
              <div class="whitespace-pre-wrap">{@html renderContent(msg.content)}</div>
              {#if msg.needsUpgrade}
                <a href="/pricing" class="btn btn-primary mt-2" style="padding: 6px 16px; font-size: 0.75rem;">Upgrade plan</a>
              {/if}
            </div>
            <div class="text-[10px] text-text-muted mt-1">{msg.timestamp}</div>
          </div>
        </div>
      {/each}
      {#if isTyping}
        <div class="flex items-start gap-3">
          <div class="w-7 h-7 rounded-full bg-bg-page text-teal flex items-center justify-center"><Bot size={15} /></div>
          <div class="px-3.5 py-2.5 bg-bg-page rounded-xl rounded-bl-sm">
            <div class="flex gap-1"><span class="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style="animation-delay: 0ms"></span><span class="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style="animation-delay: 150ms"></span><span class="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style="animation-delay: 300ms"></span></div>
          </div>
        </div>
      {/if}
      <div bind:this={messagesEndRef}></div>
    </div>

    <!-- Input -->
    <form onsubmit={sendMessage} class="border-t border-border p-3.5 flex gap-3">
      <input type="text" bind:value={input} placeholder="Ask about tags, pricing, SEO, what to fix…" class="field flex-1 disabled:opacity-60 disabled:cursor-not-allowed" disabled={isStreaming} data-testid="chat-input" />
      <button type="submit" disabled={!input.trim() || isStreaming} aria-label="Send message" class="btn btn-primary w-11 flex-shrink-0" style="padding: 0;" data-testid="chat-send">
        <Send size={16} />
      </button>
    </form>
  </div>
</div>
