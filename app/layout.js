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

export const metadata = {
  title: "CRM Pro — Palmer",
  description: "Sistema interno de gestión comercial (ISO 27001)",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={`${syne.variable} ${ibmPlexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
