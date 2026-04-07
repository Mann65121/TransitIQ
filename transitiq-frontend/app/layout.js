import "./globals.css";

export const metadata = {
  title: "TransitIQ",
  description: "Plan routes, review delivery conditions, and travel with more confidence.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <body className="min-h-full bg-[var(--background)] text-[var(--foreground)] antialiased">
        {children}
      </body>
    </html>
  );
}
