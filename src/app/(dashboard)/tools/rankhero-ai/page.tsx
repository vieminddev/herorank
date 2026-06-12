"use client";
import React, { useState, useRef, useEffect } from "react";
import { MessageSquare, Send, Bot, User, Sparkles } from "lucide-react";

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

export default function RankHeroAIPage() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollToBottom(); }, [messages]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMsg: Message = { role: "user", content: input, timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      const lowered = input.toLowerCase();
      let response = MOCK_RESPONSES.default;
      if (lowered.includes("tag")) response = MOCK_RESPONSES.tag;
      else if (lowered.includes("price") || lowered.includes("pricing")) response = MOCK_RESPONSES.price;

      const aiMsg: Message = { role: "assistant", content: response, timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
      setMessages(prev => [...prev, aiMsg]);
      setIsTyping(false);
    }, 1500);
  };

  return (
    <div className="max-w-4xl mx-auto animate-fade-in" style={{ height: "calc(100vh - var(--header-height) - 48px)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal to-navy flex items-center justify-center">
          <Sparkles size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">HeroRank AI</h1>
          <p className="text-xs text-text-muted">Your AI-powered Etsy selling assistant</p>
        </div>
      </div>

      {/* Chat Container */}
      <div className="card flex flex-col" style={{ height: "calc(100% - 60px)" }}>
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex items-start gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === "assistant" ? "bg-gradient-to-br from-teal to-navy" : "bg-orange"}`}>
                {msg.role === "assistant" ? <Bot size={16} className="text-white" /> : <User size={16} className="text-white" />}
              </div>
              <div className={`max-w-[75%] ${msg.role === "user" ? "text-right" : ""}`}>
                <div className={`inline-block px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.role === "user" ? "bg-navy text-white rounded-br-md" : "bg-bg-page text-text-primary rounded-bl-md"}`}>
                  <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: msg.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                </div>
                <div className="text-[10px] text-text-muted mt-1">{msg.timestamp}</div>
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal to-navy flex items-center justify-center"><Bot size={16} className="text-white" /></div>
              <div className="px-4 py-3 bg-bg-page rounded-2xl rounded-bl-md">
                <div className="flex gap-1"><span className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "0ms" }} /><span className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "150ms" }} /><span className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "300ms" }} /></div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={sendMessage} className="border-t border-border p-4 flex gap-3">
          <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder="Ask about tags, pricing, SEO, competitors..." className="flex-1 px-4 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:border-teal bg-white" disabled={isTyping} />
          <button type="submit" disabled={!input.trim() || isTyping} className="w-10 h-10 rounded-xl flex items-center justify-center text-white disabled:opacity-40 transition-all hover:opacity-90" style={{ background: "var(--navy)" }}>
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
