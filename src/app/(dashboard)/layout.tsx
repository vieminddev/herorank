import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <div
        className="flex-1 flex flex-col min-h-screen"
        style={{ marginLeft: "var(--sidebar-width)" }}
      >
        <Header />
        <main className="flex-1 p-6">{children}</main>

        {/* Footer */}
        <footer className="border-t border-border px-6 py-8 mt-auto">
          <div className="max-w-6xl mx-auto flex flex-wrap gap-12">
            <div className="flex-shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange to-orange-dark flex items-center justify-center">
                  <svg
                    width="14"
                    height="14"
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
                <span className="font-bold text-text-primary">HeroRank</span>
              </div>
              <p className="text-xs text-text-muted">Be seen. Then Soar.</p>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase text-text-primary mb-3 tracking-wider">
                Company
              </h4>
              <ul className="space-y-2 text-sm text-text-secondary">
                <li>
                  <a href="/about" className="hover:text-text-primary transition-colors">
                    About
                  </a>
                </li>
                <li>
                  <a href="/blog" className="hover:text-text-primary transition-colors">
                    Blog
                  </a>
                </li>
                <li>
                  <a href="/press" className="hover:text-text-primary transition-colors">
                    Press Kit
                  </a>
                </li>
                <li>
                  <a href="/contact" className="hover:text-text-primary transition-colors">
                    Contact
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase text-text-primary mb-3 tracking-wider">
                Legal
              </h4>
              <ul className="space-y-2 text-sm text-text-secondary">
                <li>
                  <a href="/terms" className="hover:text-text-primary transition-colors">
                    Terms of Use
                  </a>
                </li>
                <li>
                  <a href="/privacy" className="hover:text-text-primary transition-colors">
                    Privacy Policy
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="max-w-6xl mx-auto mt-8 pt-4 border-t border-border-light text-center">
            <p className="text-xs text-text-muted">
              The term &quot;Etsy&quot; is a trademark of Etsy, Inc. This
              application uses the Etsy API but is not endorsed or certified by
              Etsy.
            </p>
            <p className="text-xs text-text-muted mt-1">
              Copyright © {new Date().getFullYear()} HeroRank. All rights
              reserved.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
