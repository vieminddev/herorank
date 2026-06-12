"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Crown,
  TrendingUp,
  Compass,
  Store,
  FileText,
  UserCheck,
  BarChart3,
  Calculator,
  Tag,
  Type,
  AlignLeft,
  Wand2,
  Video,
  MessageSquare,
  Search,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navigation: NavGroup[] = [
  {
    title: "",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: Home },
    ],
  },
  {
    title: "BRAINSTORM",
    items: [
      { label: "Best Sellers", href: "/tools/etsy/best-sellers", icon: Crown },
      { label: "Etsy Trends", href: "/tools/etsy/etsy-trends", icon: TrendingUp },
      { label: "Niche Finder", href: "/tools/etsy/niche-finder", icon: Compass },
    ],
  },
  {
    title: "ANALYZE",
    items: [
      { label: "Shop Analyzer", href: "/tools/etsy/shop-analyzer", icon: Store },
      { label: "Listing Analyzer", href: "/tools/etsy/listing-analyzer", icon: FileText },
      { label: "Buyer Check", href: "/tools/etsy/buyer-check", icon: UserCheck },
      { label: "Rank Check", href: "/tools/etsy/rank-check", icon: BarChart3 },
      { label: "Calculator", href: "/tools/etsy/profit-calculator", icon: Calculator },
    ],
  },
  {
    title: "COMPOSE",
    items: [
      { label: "Tag Generator", href: "/tools/etsy/tag-generator", icon: Tag },
      { label: "Title Generator", href: "/tools/etsy/title-generator", icon: Type },
      { label: "Description Generator", href: "/tools/etsy/description-generator", icon: AlignLeft },
      { label: "Listing Studio", href: "/tools/etsy/listing-studio", icon: Wand2 },
      { label: "Video Generator", href: "/tools/etsy/video-generator", icon: Video },
    ],
  },
  {
    title: "OTHER TOOLS",
    items: [
      { label: "Keyword Generator", href: "/tools/keyword-generator", icon: Search },
      { label: "RankHero AI", href: "/tools/rankhero-ai", icon: MessageSquare },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 bg-white border-r border-border overflow-y-auto z-30"
      style={{ width: "var(--sidebar-width)" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 h-14 border-b border-border-light">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange to-orange-dark flex items-center justify-center">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <span
          className="text-lg font-bold"
          style={{ color: "var(--navy)" }}
        >
          HeroRank
        </span>
      </div>

      {/* Navigation */}
      <nav className="py-2 pb-8">
        {navigation.map((group) => (
          <div key={group.title || "main"}>
            {group.title && (
              <div className="sidebar-group-label">{group.title}</div>
            )}
            {group.items.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`sidebar-link ${isActive ? "active" : ""}`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
