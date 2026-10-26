"use client";

import { useEffect, useState } from "react";

// Install button that ALWAYS gives feedback on click:
//  - if the browser offers install  -> installs the app
//  - if already installed / no offer -> shows a popup telling the user
export default function PwaClient() {
  const [deferred, setDeferred] = useState(null);
  const [runningAsApp, setRunningAsApp] = useState(false);
  const [knownInstalled, setKnownInstalled] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    if (standalone) setRunningAsApp(true);

    if (navigator.getInstalledRelatedApps) {
      navigator.getInstalledRelatedApps()
        .then((apps) => { if (apps && apps.length > 0) setKnownInstalled(true); })
        .catch(() => {});
    }

    const onPrompt = (e) => { e.preventDefault(); setDeferred(e); setKnownInstalled(false); };
    const onInstalled = () => { setKnownInstalled(true); setDeferred(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // running inside the installed app — no button needed
  if (runningAsApp) return null;

  async function onClick() {
    // 1) browser is offering install -> do it
    if (deferred) {
      deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice && choice.outcome === "accepted") {
        setKnownInstalled(true);
        setDeferred(null);
        window.alert("✅ PLC Tester install ho gaya. Ab ise desktop / Start menu se khol sakte ho.");
      } else {
        setDeferred(null);
      }
      return;
    }

    // 2) no offer — figure out why and tell the user (popup)
    const ua = navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua);

    if (!window.isSecureContext) {
      window.alert("Install sirf https ya localhost par milta hai. Website par daalne (https) ke baad ye button se install hoga.");
    } else if (knownInstalled) {
      window.alert("ℹ️ PLC Tester pehle se install hai. Ise apne desktop / Start menu se kholo.\n\nDobara install karna ho to pehle uninstall karo (chrome://apps → right-click → Remove).");
    } else if (isIos) {
      window.alert("iPhone/iPad par: niche Share (⬆️) → Add to Home Screen.");
    } else {
      window.alert("App shayad pehle se install hai, ya browser ne abhi install offer nahi kiya.\n\n• Agar installed hai: desktop / Start menu se kholo.\n• Install karna ho: address bar ke install icon par click karo, ya menu (⋮) → Install PLC Tester.");
    }
  }

  return (
    <button onClick={onClick} style={btn} aria-label="Install PLC Tester app">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
      {knownInstalled ? "App installed" : "Install app"}
    </button>
  );
}

const btn = {
  position: "fixed", right: "18px", bottom: "18px", zIndex: 50,
  display: "inline-flex", alignItems: "center", gap: "9px", height: "48px", padding: "0 18px",
  border: 0, borderRadius: "999px", background: "#2b4bf2", color: "#fff", fontSize: "15px",
  fontWeight: 700, fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
  boxShadow: "0 10px 24px -8px rgba(43,75,242,.7)", cursor: "pointer",
};
