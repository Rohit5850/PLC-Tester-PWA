# PLC Tester (PWA)

Web-based Modbus PLC/meter tester. Ye ek **PWA** hai — website kholo, ek click
me **app ki tarah install** ho jaati hai (phone, laptop, desktop). Koi .exe nahi,
koi "unsafe app" warning nahi, koi certificate/Store zaroori nahi.

JavaScript (no TypeScript) · Next.js · Tailwind CSS.

## Chalana
```bash
npm install
npm run dev        # http://localhost:3000
```
Production:
```bash
npm run build
npm start
```

## Install "app" kaise dikhega
- Chrome/Edge (Windows/Android): address bar me **Install** icon, ya screen par
  neeche **"Install app"** button — click → app ban gayi.
- iPhone/iPad (Safari): **Share → Add to Home Screen**.
- Installed app full-screen khulti hai, bilkul normal app jaisi.

## ZAROORI — PLC reach karne ka rule
Ye app **jis server se chal rahi ho usi se PLC padhti hai**:
- Server us **PC/network par chale jahan PLC hai** → sab theek, us network ke kisi
  bhi device par app install karke PLC padh sakte ho.
- Agar app ko **internet se kahin bhi** khol kar PLC padhna hai, to server us plant
  wale PC par chale + ek **public link (Cloudflare Tunnel)** lagao, ya cloud + local
  agent architecture use karo. (Cloud se seedha local PLC nahi padha ja sakta —
  ye PLC ki physical reality hai, app ki kami nahi.)

## HTTPS note
PWA install sirf **HTTPS** par ya **localhost** par offer hota hai. Host karte
waqt HTTPS use karna (Vercel/Netlify/Cloudflare automatically dete hain).

## Features (desktop version jaisa hi)
TCP + RTU, read/write, all formats (16/32/float/double/hex/bin), scan, ping,
tag map, device save, live polling, error guidance, auto-save (localStorage).
