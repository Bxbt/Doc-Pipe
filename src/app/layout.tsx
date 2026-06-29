import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Doc-Pipe — Document Pipeline",
  description: "Connected project documents with impact analysis and traceability.",
};

// Apply the saved theme before paint to avoid a flash of the wrong theme.
const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('theme');
    if (t === 'light') document.documentElement.classList.remove('dark');
    else document.documentElement.classList.add('dark');
  } catch (e) { document.documentElement.classList.add('dark'); }
})();
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-bg text-fg">
        <AppShell user={user}>{children}</AppShell>
      </body>
    </html>
  );
}
