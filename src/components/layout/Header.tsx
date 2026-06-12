"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, Sun, ChevronDown, User } from "lucide-react";
import { useState } from "react";

export default function Header() {
  const pathname = usePathname();
  const [showDropdown, setShowDropdown] = useState(false);

  // Generate breadcrumb from pathname
  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs = segments.map((seg, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const label = seg
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return { label, href };
  });

  return (
    <header
      className="sticky top-0 bg-white border-b border-border z-20 flex items-center justify-between px-6"
      style={{ height: "var(--header-height)" }}
    >
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm">
        <Link
          href="/dashboard"
          className="text-text-secondary hover:text-text-primary transition-colors"
        >
          Home
        </Link>
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.href} className="flex items-center gap-1.5">
            <span className="text-text-muted">/</span>
            {i === breadcrumbs.length - 1 ? (
              <span className="text-text-primary font-medium">
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="text-text-secondary hover:text-text-primary transition-colors"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

      {/* Right side actions */}
      <div className="flex items-center gap-3">
        {/* Upgrade button */}
        <Link
          href="/pricing"
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all hover:shadow-md"
          style={{
            background: "var(--orange)",
            color: "white",
          }}
        >
          <Sparkles size={14} />
          Upgrade
        </Link>

        {/* Theme toggle */}
        <button
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-bg-page transition-colors"
          aria-label="Toggle theme"
        >
          <Sun size={18} className="text-text-secondary" />
        </button>

        {/* Divider */}
        <div className="w-px h-6 bg-border" />

        {/* Account dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-bg-page transition-colors"
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
              style={{ background: "var(--teal)" }}
            >
              HR
            </div>
            <span className="text-sm font-medium text-text-primary">
              Account
            </span>
            <ChevronDown size={14} className="text-text-muted" />
          </button>

          {showDropdown && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowDropdown(false)}
              />
              <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-border rounded-lg shadow-lg z-50 py-1">
                <Link
                  href="/account"
                  className="flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:bg-bg-page hover:text-text-primary transition-colors"
                  onClick={() => setShowDropdown(false)}
                >
                  <User size={14} />
                  My Account
                </Link>
                <Link
                  href="/pricing"
                  className="flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:bg-bg-page hover:text-text-primary transition-colors"
                  onClick={() => setShowDropdown(false)}
                >
                  <Sparkles size={14} />
                  Upgrade Plan
                </Link>
                <hr className="my-1 border-border" />
                <button
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-danger hover:bg-danger-bg transition-colors"
                  onClick={() => setShowDropdown(false)}
                >
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
