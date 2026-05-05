import { IBM_Plex_Mono, Syne } from "next/font/google";
import "./globals.css";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export async function generateMetadata() {
  return {
    title: process.env.NEXT_PUBLIC_BRAND_NAME || "CRM Pro — Palmer",
    description: "Sistema interno de gestión comercial (ISO 27001)",
  };
}

export default function RootLayout({ children }) {
  const brandColor = process.env.NEXT_PUBLIC_BRAND_COLOR || "#0176D3"; // Default Navy

  return (
    <html lang="es" className={`${syne.variable} ${ibmPlexMono.variable}`}>
      <head>
        <style>{`
          :root {
            --navy: ${brandColor};
            --navy-light: ${brandColor}15;
            --navy-hover: ${brandColor}e6;
          }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
