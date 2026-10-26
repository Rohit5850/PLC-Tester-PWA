import "./globals.css";
import PwaClient from "./pwa-client";

export const metadata = {
  title: "PLC Tester",
  description: "Modbus PLC/meter tester — connect, read, write and monitor live values.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "PLC Tester" },
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

export const viewport = {
  themeColor: "#2b4bf2",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <PwaClient />
      </body>
    </html>
  );
}
