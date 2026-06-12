<script lang="ts">
  import { Send, Bot, User, Sparkles } from "lucide-svelte";

  interface Message {
    role: "user" | "assistant";
    content: string;
    timestamp: string;
  }

  const INITIAL_MESSAGES: Message[] = [
    {
      role: "assistant",
      content: "👋 Hi! I'm HeroRank AI — your Etsy selling assistant. I can help with:\n\n• **SEO optimization** — tags, titles, descriptions\n• **Shop strategy** — pricing, positioning, niche research\n• **Listing advice** — what to improve and how\n• **Market analysis** — trends, competition, demand\n\nWhat would you like help with today?",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ];

  const MOCK_RESPONSES: Record<string, string> = {
    default: "That's a great question! Based on my analysis of top-performing Etsy shops, I'd recommend focusing on long-tail keywords with lower competition. Use the **Tag Generator** tool to find specific data-driven suggestions.\n\nWould you like me to elaborate on any specific aspect?",
    tag: "For tag optimization, here are my top tips:\n\n1. **Use all 13 tags** — every empty slot is wasted visibility\n2. **Mix broad and specific** — 'necklace' + 'personalized gold name necklace'\n3. **Include long-tail keywords** — they convert better\n4. **Check competition** — green tags in our Tag Generator = lower competition\n5. **Update seasonally** — swap in holiday-relevant tags when appropriate\n\nWant me to analyze your current tags?",
    price: "Pricing on Etsy is both art and science. Here's what the data shows:\n\n📊 **Price anchoring** — List your premium items first so mid-range ones feel like deals\n💰 **Free shipping math** — Build shipping into the price; 'free shipping' boosts search rank\n📈 **Psychological pricing** — $19.99 outperforms $20.00 consistently\n\nUse our **Profit Calculator** to make sure your margins work after Etsy fees (listing fee $0.20 + 6.5% transaction + 3% + $0.25 processing).",
  };

  let messages = $state<Message[]>(INITIAL_MESSAGES);
  let input = $state("");
  let isTyping = $state(false);
  let messagesEndRef = $state<HTMLDivElement>();

  const scrollToBottom = () => messagesEndRef?.scrollIntoView({ behavior: "smooth" });
  $effect(() => {
    // Track messages so the effect re-runs when a new message is appended.
    messages;
    scrollToBottom();
  });

  // Render only the controlled **bold** markdown from mock/typed content as <strong>.
  // Note: user-typed text is echoed verbatim; the only HTML produced is <strong> wrappers.
  const renderContent = (content: string) =>
    content.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

  const sendMessage = (e: SubmitEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMsg: Message = { role: "user", content: input, timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
    messages = [...messages, userMsg];
    const sent = input;
    input = "";
    isTyping = true;

    setTimeout(() => {
      const lowered = sent.toLowerCase();
      let response = MOCK_RESPONSES.default;
      if (lowered.includes("tag")) response = MOCK_RESPONSES.tag;
      else if (lowered.includes("price") || lowered.includes("pricing")) response = MOCK_RESPONSES.price;

      const aiMsg: Message = { role: "assistant", content: response, timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
      messages = [...messages, aiMsg];
      isTyping = false;
    }, 1500);
  };
</script>

<div class="max-w-4xl mx-auto animate-fade-in" style="height: calc(100vh - var(--header-height) - 48px)">
  <!-- Header -->
  <div class="flex items-center gap-3 mb-4">
    <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-teal to-navy flex items-center justify-center">
      <Sparkles size={20} class="text-white" />
    </div>
    <div>
      <h1 class="text-xl font-bold text-text-primary">HeroRank AI</h1>
      <p class="text-xs text-text-muted">Your AI-powered Etsy selling assistant</p>
    </div>
  </div>

  <!-- Chat Container -->
  <div class="card flex flex-col" style="height: calc(100% - 60px)">
    <!-- Messages -->
    <div class="flex-1 overflow-y-auto p-5 space-y-4">
      {#each messages as msg, i (i)}
        <div class="flex items-start gap-3 {msg.role === 'user' ? 'flex-row-reverse' : ''}">
          <div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 {msg.role === 'assistant' ? 'bg-gradient-to-br from-teal to-navy' : 'bg-orange'}">
            {#if msg.role === "assistant"}<Bot size={16} class="text-white" />{:else}<User size={16} class="text-white" />{/if}
          </div>
          <div class="max-w-[75%] {msg.role === 'user' ? 'text-right' : ''}">
            <div class="inline-block px-4 py-3 rounded-2xl text-sm leading-relaxed {msg.role === 'user' ? 'bg-navy text-white rounded-br-md' : 'bg-bg-page text-text-primary rounded-bl-md'}">
              <div class="whitespace-pre-wrap">{@html renderContent(msg.content)}</div>
            </div>
            <div class="text-[10px] text-text-muted mt-1">{msg.timestamp}</div>
          </div>
        </div>
      {/each}
      {#if isTyping}
        <div class="flex items-start gap-3">
          <div class="w-8 h-8 rounded-full bg-gradient-to-br from-teal to-navy flex items-center justify-center"><Bot size={16} class="text-white" /></div>
          <div class="px-4 py-3 bg-bg-page rounded-2xl rounded-bl-md">
            <div class="flex gap-1"><span class="w-2 h-2 bg-text-muted rounded-full animate-bounce" style="animation-delay: 0ms"></span><span class="w-2 h-2 bg-text-muted rounded-full animate-bounce" style="animation-delay: 150ms"></span><span class="w-2 h-2 bg-text-muted rounded-full animate-bounce" style="animation-delay: 300ms"></span></div>
          </div>
        </div>
      {/if}
      <div bind:this={messagesEndRef}></div>
    </div>

    <!-- Input -->
    <form onsubmit={sendMessage} class="border-t border-border p-4 flex gap-3">
      <input type="text" bind:value={input} placeholder="Ask about tags, pricing, SEO, competitors..." class="flex-1 px-4 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:border-teal bg-white" disabled={isTyping} data-testid="chat-input" />
      <button type="submit" disabled={!input.trim() || isTyping} class="w-10 h-10 rounded-xl flex items-center justify-center text-white disabled:opacity-40 transition-all hover:opacity-90" style="background: var(--navy)" data-testid="chat-send">
        <Send size={16} />
      </button>
    </form>
  </div>
</div>
