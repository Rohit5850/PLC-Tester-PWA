"use client";

import { useEffect, useRef, useState } from "react";

const api = (p, b) =>
  fetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());

// ---------- plain-language error guidance ----------
function explain(err) {
  const e = (err || "").toLowerCase();
  if (e.includes("econnrefused"))
    return { t: "The device refused the connection", pts: ["Is the IP address exactly right?", "Is Modbus TCP turned ON in the PLC/meter settings?", "Is the port correct? Most devices use 502.", "A firewall on this PC may be blocking it."] };
  if (e.includes("timed out") || e.includes("etimedout") || e.includes("timeout"))
    return { t: "No response from the device", pts: ["Is the device powered on and on the network?", "Is this PC on the same network range? Use “Detect my IP”.", "Try Ping first — if ping fails, it’s a network problem.", "Cable or Wi-Fi issue?"] };
  if (e.includes("ehostunreach") || e.includes("enetunreach"))
    return { t: "That address is not reachable", pts: ["The device is on a different network range.", "Set this PC’s IP to the same range (see “Detect my IP”)."] };
  if (e.includes("data address") || e.includes("address"))
    return { t: "That address doesn’t exist on the device", pts: ["Try a different Start address.", "Some devices start at 0, others at 1 — try shifting by one.", "Check the device’s Modbus register map (manual)."] };
  if (e.includes("function"))
    return { t: "The device doesn’t support that read", pts: ["Try Holding registers (most common).", "Some meters only expose Input registers."] };
  if (e.includes("port") && e.includes("open"))
    return { t: "Serial port could not be opened", pts: ["Pick the correct COM port and refresh.", "Another program may be using the port — close it.", "Check the USB-RS485 cable."] };
  if (e.includes("crc"))
    return { t: "Garbled serial data (CRC error)", pts: ["Baud rate, parity or stop bits don’t match.", "Check A/B wiring isn’t swapped."] };
  return { t: "Could not read from the device", pts: ["Check the connection details and try Ping.", "See the Activity log for the exact error."] };
}

// ---------- decode (client side, instant reformat) ----------
const u16 = (v) => v & 0xffff;
const s16 = (v) => { v &= 0xffff; return v > 0x7fff ? v - 0x10000 : v; };
function mkBuf(n) {
  const dv = new DataView(new ArrayBuffer(n));
  return { s: (o, v) => dv.setUint16(o, v & 0xffff, false), f32: () => dv.getFloat32(0, false), f64: () => dv.getFloat64(0, false), i32: () => dv.getInt32(0, false), u32: () => dv.getUint32(0, false) };
}
function b32(a, b, sw) { const x = mkBuf(4); if (sw) { x.s(0, b); x.s(2, a); } else { x.s(0, a); x.s(2, b); } return x; }
function b64(a, b, c, d, sw) { const x = mkBuf(8); const o = sw ? [d, c, b, a] : [a, b, c, d]; o.forEach((v, i) => x.s(i * 2, v)); return x; }
function decode(vals, start, fmt, sw, scale, bits) {
  const s = scale || 1, out = []; let i = 0;
  if (bits) return vals.map((v, k) => ({ address: start + k, raw: String(v), dec: v ? "ON" : "OFF" }));
  const step = fmt === "f64" ? 4 : ["u32", "s32", "f32"].includes(fmt) ? 2 : 1;
  while (i < vals.length) {
    const a = start + i; let dec, raw;
    if (step === 1) {
      raw = String(vals[i]);
      if (fmt === "hex") dec = "0x" + u16(vals[i]).toString(16).toUpperCase().padStart(4, "0");
      else if (fmt === "bin") dec = u16(vals[i]).toString(2).padStart(16, "0");
      else if (fmt === "s16") dec = String(+(s16(vals[i]) * s).toFixed(4));
      else dec = String(+(u16(vals[i]) * s).toFixed(4));
      i += 1;
    } else if (step === 2) {
      if (i + 1 >= vals.length) break; raw = vals[i] + "," + vals[i + 1]; const b = b32(vals[i], vals[i + 1], sw);
      if (fmt === "f32") { const f = b.f32() * s; dec = Number.isFinite(f) ? String(+f.toPrecision(7)) : "—"; }
      else if (fmt === "s32") dec = String(b.i32() * s); else dec = String(b.u32() * s);
      i += 2;
    } else {
      if (i + 3 >= vals.length) break; raw = vals.slice(i, i + 4).join(","); const b = b64(vals[i], vals[i + 1], vals[i + 2], vals[i + 3], sw);
      dec = String(b.f64() * s); i += 4;
    }
    out.push({ address: a, raw, dec });
  }
  return out;
}

// decode a single value at a given absolute address, using that tag's own type
function decodeAt(values, start, addr, type, sw, scale) {
  const i = addr - start;
  if (i < 0 || i >= values.length) return null;
  const s = scale || 1;
  if (type === "u16") return +(u16(values[i]) * s);
  if (type === "s16") return +(s16(values[i]) * s);
  if (type === "u32" || type === "s32" || type === "f32") {
    if (i + 1 >= values.length) return null;
    const b = b32(values[i], values[i + 1], sw);
    if (type === "f32") { const f = b.f32() * s; return Number.isFinite(f) ? +f.toPrecision(7) : null; }
    if (type === "s32") return b.i32() * s;
    return b.u32() * s;
  }
  if (type === "f64") {
    if (i + 3 >= values.length) return null;
    return b64(values[i], values[i + 1], values[i + 2], values[i + 3], sw).f64() * s;
  }
  return u16(values[i]) * s;
}

const TAG_TYPES = [
  { v: "u16", label: "Number (16-bit)" },
  { v: "s16", label: "Signed 16-bit" },
  { v: "f32", label: "Float (2 reg)" },
  { v: "u32", label: "Uint32 (2 reg)" },
  { v: "s32", label: "Int32 (2 reg)" },
  { v: "f64", label: "Double (4 reg)" },
];

const AREAS = [
  { v: 3, label: "Holding registers (40001+)" },
  { v: 4, label: "Input registers (30001+)" },
  { v: 1, label: "Coils (on/off)" },
  { v: 2, label: "Discrete inputs (on/off)" },
];
const FORMATS = [
  { v: "u16", label: "Number (16-bit)" },
  { v: "s16", label: "Number, can be negative" },
  { v: "f32", label: "Decimal / float (2 reg)" },
  { v: "u32", label: "Big number (2 reg)" },
  { v: "s32", label: "Big number ± (2 reg)" },
  { v: "f64", label: "Double precision (4 reg)" },
  { v: "hex", label: "Hex" },
  { v: "bin", label: "Binary" },
];

function StatusPill({ tone, children, live }) {
  const map = { ok: "bg-live-soft text-live", bad: "bg-danger-soft text-danger", warn: "bg-amber-soft text-amber", idle: "" };
  const led = { ok: "bg-live", bad: "bg-danger", warn: "bg-amber", idle: "" };
  return (
    <span className={`status ${map[tone] || ""}`}>
      <span className={`led ${led[tone] || ""} ${live ? "animate-pulse2" : ""}`} />
      {children}
    </span>
  );
}

export default function Page() {
  const [advanced, setAdvanced] = useState(false);
  const [connType, setConnType] = useState("tcp");

  // connection
  const [ip, setIp] = useState(""); const [port, setPort] = useState("502"); const [unit, setUnit] = useState("1");
  const [com, setCom] = useState(""); const [baud, setBaud] = useState("9600"); const [parity, setParity] = useState("none");
  const [dataBits, setDataBits] = useState("8"); const [stopBits, setStopBits] = useState("1");
  const [ports, setPorts] = useState([]);

  // read
  const [fn, setFn] = useState("3"); const [start, setStart] = useState("0"); const [count, setCount] = useState("10");
  const [fmt, setFmt] = useState("u16"); const [word, setWord] = useState("big"); const [scale, setScale] = useState("1");
  const [rate, setRate] = useState("1000");

  // state
  const [connTone, setConnTone] = useState("idle"); const [connMsg, setConnMsg] = useState("Not connected");
  const [readTone, setReadTone] = useState("idle"); const [readMsg, setReadMsg] = useState("Idle");
  const [pingTone, setPingTone] = useState("idle"); const [pingMsg, setPingMsg] = useState("—");
  const [roMeta, setRoMeta] = useState("Not reading yet");
  const [raw, setRaw] = useState(null); // {values,start,bits}
  const [counters, setCounters] = useState({ ok: 0, err: 0 });
  const [guide, setGuide] = useState(null); // {kind,title,raw,pts}
  const [netBox, setNetBox] = useState(null); const [found, setFound] = useState([]);
  const [live, setLive] = useState(false); const [log, setLog] = useState("");

  // write
  const [wType, setWType] = useState("reg"); const [wAddr, setWAddr] = useState("0"); const [wVal, setWVal] = useState("");
  const [wTone, setWTone] = useState("idle"); const [wMsg, setWMsg] = useState("—");

  // tag / register map
  const [tags, setTags] = useState([]);
  const tagFileRef = useRef(null);

  // saved devices
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState("");
  const [deviceName, setDeviceName] = useState("");

  const timer = useRef(null);
  const fileRef = useRef(null);
  const startLiveRef = useRef(null);

  const addLog = (l) => setLog((p) => p + `[${new Date().toLocaleTimeString()}] ${l}\n`);

  const unitId = () => parseInt(unit || "1", 10) || 1;
  const conn = () =>
    connType === "rtu"
      ? { type: "rtu", com, baud: +baud, parity, dataBits: +dataBits, stopBits: +stopBits, timeout: 3000 }
      : { type: "tcp", ip: ip.trim(), port: +port || 502, timeout: 3000 };

  const rows = raw ? decode(raw.values, raw.start, fmt, word === "little", +scale || 1, raw.bits) : [];

  async function detectIp() {
    const d = await fetch("/api/netinfo").then((r) => r.json());
    if (!d.interfaces.length) { setNetBox("No network found."); return; }
    const i = d.interfaces[0]; const sub = i.ip.split(".").slice(0, 3).join(".");
    setNetBox(`This PC is ${i.ip} on ${i.iface}. Your device should be in the ${sub}.x range; if not, set this PC’s IP to something like ${sub}.50.`);
    setIp((v) => v || `${sub}.`);
  }
  async function scan() {
    const subnet = (ip.split(".").slice(0, 3).join(".")) || "";
    if (!/^\d+\.\d+\.\d+$/.test(subnet)) { alert("Type an IP like 192.168.1.x first, or use Detect my IP"); return; }
    addLog(`Scanning ${subnet}.1–254 on port ${port}…`);
    const d = await api("/api/scan", { subnet, port: +port || 502 });
    setFound(d.found || []); addLog(`Scan finished — ${(d.found || []).length} device(s)`);
  }
  async function ping() {
    if (!ip.trim()) { alert("Enter the device IP first"); return; }
    setPingTone("idle"); setPingMsg("pinging…");
    const d = await api("/api/ping", { ip: ip.trim(), port: +port || 502 });
    setPingTone(d.reachable ? "ok" : "bad"); setPingMsg(d.reachable ? `reachable · ${d.ms} ms` : "no reply");
    addLog(`Ping ${ip}:${port} → ${d.reachable ? "reachable " + d.ms + "ms" : "no reply"}`);
  }
  async function refreshPorts() {
    const d = await fetch("/api/serialports").then((r) => r.json());
    setPorts(d.ports || []); if (d.ports && d.ports[0]) setCom(d.ports[0].path);
  }

  async function doRead() {
    if (connType === "tcp" && !ip.trim()) { setGuide({ kind: "warn", title: "Enter the device IP first", raw: "", pts: ["Type the PLC/meter IP, e.g. 192.168.1.10."] }); return; }
    setGuide(null); setReadTone("idle"); setReadMsg("reading…");
    const body = { conn: conn(), unitId: unitId(), fnCode: +fn, start: +start || 0, count: +count || 10 };
    addLog(`→ read area=${body.fnCode} start=${body.start} count=${body.count}`);
    const d = await api("/api/read", body);
    if (d.ok) {
      setConnTone("ok"); setConnMsg("Connected"); setReadTone("ok"); setReadMsg("Read OK");
      setRoMeta(`${conn().ip || conn().com || ""} · ${d.values.length} values · ${new Date().toLocaleTimeString()}`);
      setRaw({ values: d.values, start: d.start, bits: d.bits });
      addLog(`← ${d.values.length} values: ${d.values.slice(0, 12).join(", ")}${d.values.length > 12 ? " …" : ""}`);
      return true;
    }
    setConnTone("bad"); setConnMsg("Not connected"); setReadTone("bad"); setReadMsg("Failed");
    const g = explain(d.error); setGuide({ kind: "err", title: g.t, raw: d.error, pts: g.pts }); addLog(`✗ ERROR: ${d.error}`);
    return false;
  }

  function startLive() {
    if (connType === "tcp" && !ip.trim()) { setGuide({ kind: "warn", title: "Enter the device IP first", raw: "", pts: ["Type the device IP, then start live."] }); return; }
    setGuide(null); setLive(true); addLog("Live polling started");
    const tick = async () => {
      const body = { conn: conn(), unitId: unitId(), fnCode: +fn, start: +start || 0, count: +count || 10 };
      const d = await api("/api/read", body).catch(() => ({ ok: false, error: "network" }));
      if (d.ok) {
        setConnTone("ok"); setConnMsg("Connected"); setReadTone("ok"); setReadMsg("Live");
        setRoMeta(`${conn().ip || conn().com || ""} · live · ${new Date().toLocaleTimeString()}`);
        setRaw({ values: d.values, start: d.start, bits: d.bits }); setGuide(null);
        setCounters((c) => ({ ...c, ok: c.ok + 1 }));
      } else {
        // blip (power/network) — don't break, stay in live and keep retrying
        setReadTone("warn"); setReadMsg("Reconnecting…");
        setCounters((c) => ({ ...c, err: c.err + 1 }));
        addLog("… retrying (" + (d.error || "no reply") + ")");
      }
    };
    tick();
    timer.current = setInterval(tick, Math.max(300, +rate || 1000));
  }
  function stopLive() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null; setLive(false); setReadTone("idle"); setReadMsg("Stopped");
  }
  function toggleLive() { live ? stopLive() : startLive(); }
  // keep a ref to the latest startLive so auto-resume (after restart) uses fresh state
  startLiveRef.current = startLive;
  useEffect(() => () => timer.current && clearInterval(timer.current), []);

  // ---- persist EVERYTHING to localStorage (survives refresh / power cut) ----
  const loaded = useRef(false);
  useEffect(() => {
    let wasLive = false;
    try {
      const s = JSON.parse(localStorage.getItem("plc_state") || "{}");
      if (s.connType) setConnType(s.connType);
      if (s.ip !== undefined) setIp(s.ip);
      if (s.port !== undefined) setPort(s.port);
      if (s.unit !== undefined) setUnit(s.unit);
      if (s.com !== undefined) setCom(s.com);
      if (s.baud) setBaud(s.baud);
      if (s.parity) setParity(s.parity);
      if (s.dataBits) setDataBits(s.dataBits);
      if (s.stopBits) setStopBits(s.stopBits);
      if (s.fn) setFn(s.fn);
      if (s.start !== undefined) setStart(s.start);
      if (s.count !== undefined) setCount(s.count);
      if (s.fmt) setFmt(s.fmt);
      if (s.word) setWord(s.word);
      if (s.scale !== undefined) setScale(s.scale);
      if (s.rate) setRate(s.rate);
      if (s.deviceId) setDeviceId(s.deviceId);
      if (s.deviceName) setDeviceName(s.deviceName);
      if (s.advanced) setAdvanced(true);
      if (Array.isArray(s.tags)) setTags(s.tags);
      if (Array.isArray(s.devices)) setDevices(s.devices);
      if (s.raw) setRaw(s.raw);
      wasLive = !!s.live;
    } catch (e) {}
    loaded.current = true;
    // was it live before the browser/PC restarted? auto-resume, no user action needed.
    // use the ref so we call the LATEST startLive (which sees the just-loaded IP/tags),
    // not the stale one captured on first render.
    if (wasLive) setTimeout(() => startLiveRef.current && startLiveRef.current(), 800);
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem("plc_state", JSON.stringify({
        connType, ip, port, unit, com, baud, parity, dataBits, stopBits,
        fn, start, count, fmt, word, scale, rate, deviceId, deviceName,
        advanced, tags, devices, raw, live,
      }));
    } catch (e) {}
  });

  function addTag() {
    setTags((t) => [...t, { name: "New tag", address: 0, type: "u16", word: "big", scale: 1, unit: "" }]);
  }
  function updateTag(i, key, val) {
    setTags((t) => t.map((row, k) => (k === i ? { ...row, [key]: val } : row)));
  }
  function removeTag(i) { setTags((t) => t.filter((_, k) => k !== i)); }
  function fitRangeToTags() {
    if (!tags.length) return;
    const addrs = tags.map((t) => +t.address || 0);
    const extra = tags.map((t) => (t.type === "f64" ? 3 : ["u32", "s32", "f32"].includes(t.type) ? 1 : 0));
    const lo = Math.min(...addrs);
    const hi = Math.max(...addrs.map((a, i) => a + extra[i]));
    setStart(String(lo)); setCount(String(hi - lo + 1));
  }
  function saveTags() { dl(new Blob([JSON.stringify(tags, null, 2)], { type: "application/json" }), "register-map.json"); }
  function loadTags(e) {
    const f = e.target.files[0]; if (!f) return; const r = new FileReader();
    r.onload = () => { try { const m = JSON.parse(r.result); if (Array.isArray(m)) setTags(m); else alert("Not a register map file."); } catch { alert("Invalid file."); } };
    r.readAsText(f);
  }

  // ----- saved devices (kept in localStorage via the state snapshot above) -----
  function captureDevice() {
    return { connType, ip, port, unit, com, baud, parity, dataBits, stopBits, fn, start, count, fmt, word, scale, rate, tags };
  }
  function applyDevice(d) {
    setConnType(d.connType || "tcp");
    setIp(d.ip || ""); setPort(d.port || "502"); setUnit(d.unit || "1");
    setCom(d.com || ""); setBaud(d.baud || "9600"); setParity(d.parity || "none");
    setDataBits(d.dataBits || "8"); setStopBits(d.stopBits || "1");
    if (d.fn) setFn(d.fn); if (d.start !== undefined) setStart(d.start); if (d.count !== undefined) setCount(d.count);
    if (d.fmt) setFmt(d.fmt); if (d.word) setWord(d.word); if (d.scale !== undefined) setScale(d.scale); if (d.rate) setRate(d.rate);
    setTags(Array.isArray(d.tags) ? d.tags : []);
  }
  function selectDevice(id) {
    setDeviceId(id);
    if (!id) { setDeviceName(""); return; }
    const d = devices.find((x) => x.id === id);
    if (d) { setDeviceName(d.name); applyDevice(d); addLog(`Loaded device "${d.name}"`); }
  }
  function saveAsDevice() {
    const name = deviceName.trim() || ip.trim() || com || `Device ${devices.length + 1}`;
    const id = Date.now().toString(36);
    setDevices((v) => [...v, { id, name, ...captureDevice() }]);
    setDeviceId(id); setDeviceName(name); addLog(`Saved new device "${name}"`);
  }
  function updateDevice() {
    if (!deviceId) return;
    setDevices((v) => v.map((d) => (d.id === deviceId ? { ...d, name: deviceName.trim() || d.name, ...captureDevice() } : d)));
    addLog("Device updated");
  }
  function deleteDevice() {
    if (!deviceId) return;
    if (!confirm("Delete this saved device?")) return;
    setDevices((v) => v.filter((d) => d.id !== deviceId));
    setDeviceId(""); setDeviceName(""); addLog("Device deleted");
  }

  async function doWrite() {
    if (!confirm("Write this value to the device? It may change how a machine behaves.")) return;
    const body = { conn: conn(), unitId: unitId(), type: wType, address: +wAddr || 0 };
    if (wType === "regs") body.values = wVal.split(",").map((x) => parseInt(x.trim(), 10) || 0);
    else body.value = parseInt(wVal, 10) || 0;
    setWTone("idle"); setWMsg("writing…"); addLog(`→ write ${wType} addr=${body.address} val=${wVal}`);
    const d = await api("/api/write", body);
    setWTone(d.ok ? "ok" : "bad"); setWMsg(d.ok ? "written ✓" : "failed");
    if (!d.ok) { const g = explain(d.error); setGuide({ kind: "err", title: g.t, raw: d.error, pts: g.pts }); addLog("✗ " + d.error); }
  }

  function dl(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); }
  function csv() { if (!rows.length) { alert("Read some values first"); return; } const c = "address,raw,value\n" + rows.map((r) => `${r.address},"${r.raw}",${r.dec}`).join("\n"); dl(new Blob([c], { type: "text/csv" }), "plc-readings.csv"); }
  function saveCfg() { const cfg = { connType, ip, port, unit, com, baud, parity, fn, start, count, fmt, word, scale, rate }; dl(new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" }), "plc-setup.json"); }
  function loadCfg(e) {
    const f = e.target.files[0]; if (!f) return; const r = new FileReader();
    r.onload = () => { try { const c = JSON.parse(r.result);
      const set = { connType: setConnType, ip: setIp, port: setPort, unit: setUnit, com: setCom, baud: setBaud, parity: setParity, fn: setFn, start: setStart, count: setCount, fmt: setFmt, word: setWord, scale: setScale, rate: setRate };
      Object.entries(c).forEach(([k, v]) => set[k] && set[k](v)); addLog("Setup loaded");
    } catch { alert("That file isn't a valid setup."); } };
    r.readAsText(f);
  }

  const adv = (cls = "") => (advanced ? cls : "hidden");

  return (
    <div className="mx-auto max-w-[1160px] px-5 pb-24">
      {/* top bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-[#1230c4] shadow-glow">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>
          </span>
          <div>
            <div className="text-[19px] font-extrabold tracking-tight">PLC Tester</div>
            <div className="-mt-0.5 text-[12.5px] text-muted">Live Modbus readings, made simple</div>
          </div>
        </div>
        <div className="flex rounded-full border border-line bg-white p-1 shadow-soft">
          {[["simple", "Simple"], ["advanced", "Advanced"]].map(([k, l]) => (
            <button key={k} onClick={() => setAdvanced(k === "advanced")}
              className={`rounded-full px-4 py-1.5 text-[13.5px] font-semibold ${((k === "advanced") === advanced) ? "bg-ink text-white" : "text-muted"}`}>{l}</button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-[18px]">
        {/* STEP 1 CONNECT */}
        <section className="panel p-6">
          <PanelHead n="1" title="Connect to your device" sub="Pick a saved device, or enter a new address and connect." />

          {/* saved-device bar */}
          <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-[#f9fafc] p-4">
            <Field label="Saved devices">
              <select className="ctrl min-w-[200px]" value={deviceId} onChange={(e) => selectDevice(e.target.value)}>
                <option value="">— New / not saved —</option>
                {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Name"><input className="ctrl w-[180px]" placeholder="e.g. Energy meter – Panel 1" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} /></Field>
            <button className="btn-ghost" onClick={saveAsDevice}>Save as new</button>
            <button className="btn-ghost" onClick={updateDevice} disabled={!deviceId}>Update</button>
            <button className="btn-ghost" onClick={deleteDevice} disabled={!deviceId}>Delete</button>
          </div>

          <div className="mb-4 inline-flex gap-1 rounded-[10px] bg-[#f4f6f9] p-1">
            {[["tcp", "Network (TCP)", true], ["rtu", "Serial (RTU)", advanced]].map(([k, l, show]) => show && (
              <button key={k} onClick={() => setConnType(k)}
                className={`rounded-[7px] px-4 py-2 text-sm font-semibold ${connType === k ? "bg-white text-ink shadow-sm" : "text-muted"}`}>{l}</button>
            ))}
          </div>

          {connType === "tcp" ? (
            <div className="flex flex-wrap items-end gap-3.5">
              <Field label="Device IP address"><input className="ctrl w-[168px]" placeholder="192.168.1.10" value={ip} onChange={(e) => setIp(e.target.value)} /></Field>
              <Field label="Port"><input className="ctrl w-[92px] font-mono" value={port} onChange={(e) => setPort(e.target.value)} /></Field>
              <Field label="Unit ID"><input className="ctrl w-[92px] font-mono" value={unit} onChange={(e) => setUnit(e.target.value)} /></Field>
              <button className="btn !h-[52px] px-6 text-base shadow-glow" onClick={doRead}>Connect &amp; read</button>
              <StatusPill tone={connTone}>{connMsg}</StatusPill>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-3.5">
              <Field label="Serial port">
                <select className="ctrl min-w-[170px]" value={com} onChange={(e) => setCom(e.target.value)}>
                  {ports.length ? ports.map((p) => <option key={p.path} value={p.path}>{p.path} {p.maker}</option>) : <option value="">Refresh ports →</option>}
                </select>
              </Field>
              <button className="btn-ghost" onClick={refreshPorts}>Refresh ports</button>
              <Field label="Baud"><select className="ctrl" value={baud} onChange={(e) => setBaud(e.target.value)}>{["9600","19200","38400","57600","115200"].map((x) => <option key={x}>{x}</option>)}</select></Field>
              <Field label="Parity"><select className="ctrl" value={parity} onChange={(e) => setParity(e.target.value)}><option value="none">None</option><option value="even">Even</option><option value="odd">Odd</option></select></Field>
              <Field label="Data"><select className="ctrl !min-w-[72px]" value={dataBits} onChange={(e) => setDataBits(e.target.value)}><option>8</option><option>7</option></select></Field>
              <Field label="Stop"><select className="ctrl !min-w-[72px]" value={stopBits} onChange={(e) => setStopBits(e.target.value)}><option>1</option><option>2</option></select></Field>
              <Field label="Unit ID"><input className="ctrl w-[92px] font-mono" value={unit} onChange={(e) => setUnit(e.target.value)} /></Field>
              <button className="btn !h-[52px] px-6 text-base shadow-glow" onClick={doRead}>Connect &amp; read</button>
              <StatusPill tone={connTone}>{connMsg}</StatusPill>
            </div>
          )}

          {guide && <Guide g={guide} />}

          <details className="mt-3.5">
            <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-sm font-semibold text-ink2">
              <span>▸</span> Can’t find the device? Detect my network &amp; scan
            </summary>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button className="btn-ghost" onClick={detectIp}>Detect my IP</button>
              <button className="btn-ghost" onClick={scan}>Scan for devices</button>
              <button className="btn-ghost" onClick={ping}>Ping</button>
              <StatusPill tone={pingTone}>{pingMsg}</StatusPill>
            </div>
            {netBox && <div className="mt-3 rounded-[10px] border border-line bg-[#f4f6f9] p-3 text-[13.5px] leading-relaxed">{netBox}</div>}
            {found.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {found.map((f) => <button key={f} onClick={() => setIp(f)} className="h-9 rounded-[9px] border border-[#c7d0f6] bg-white px-3 text-[13.5px] font-semibold text-brand-ink">{f} ✓ use this</button>)}
              </div>
            )}
          </details>
        </section>

        {/* STEP 2 READOUT */}
        <section className="panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3.5 bg-gradient-to-b from-[#0f1830] to-[#0c1327] px-6 py-4 text-[#dfe6f5]">
            <div className="flex items-center gap-3">
              <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-white/10 text-sm font-bold text-white">2</span>
              <div><div className="text-base font-bold text-white">Live values</div><div className="font-mono text-[12.5px] text-[#93a1c4]">{roMeta}</div></div>
            </div>
            <div className={`${adv("flex")} gap-4 text-[13px] text-[#93a1c4]`}>Reads OK <b className="font-mono text-[#dfe6f5]">{counters.ok}</b> · Errors <b className="font-mono text-[#dfe6f5]">{counters.err}</b></div>
          </div>

          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead><tr className="bg-[#f4f6f9] text-[12px] font-bold text-muted">
                  <th className="px-6 py-2.5 text-left">Address</th><th className="px-6 py-2.5 text-right">Raw</th><th className="px-6 py-2.5 text-right">Value</th>
                </tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.address} className="border-t border-line hover:bg-[#fafbfd]">
                      <td className="px-6 py-3 text-[14.5px]">{r.address}</td>
                      <td className="px-6 py-3 text-right font-mono text-[13px] text-muted">{r.raw}</td>
                      <td className="px-6 py-3 text-right font-mono text-[15px] font-semibold">{r.dec}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-14 text-center text-muted">
              <svg className="mx-auto mb-3 opacity-50" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>
              <div className="font-semibold text-ink2">No readings yet</div>
              <div>Connect to a device above to see live values here.</div>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3.5 border-t border-line px-6 py-4">
            <Field label="What to read"><select className="ctrl min-w-[200px]" value={fn} onChange={(e) => setFn(e.target.value)}>{AREAS.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}</select></Field>
            <Field label="Start address"><input className="ctrl w-[120px] font-mono" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="How many"><input className="ctrl w-[100px] font-mono" value={count} onChange={(e) => setCount(e.target.value)} /></Field>
            <Field label="Show as"><select className="ctrl min-w-[180px]" value={fmt} onChange={(e) => setFmt(e.target.value)}>{FORMATS.map((f) => <option key={f.v} value={f.v}>{f.label}</option>)}</select></Field>
            <div className={adv()}><Field label="Pair order"><select className="ctrl" value={word} onChange={(e) => setWord(e.target.value)}><option value="big">Normal</option><option value="little">Swapped</option></select></Field></div>
            <div className={adv()}><Field label="Multiply ×"><input className="ctrl w-[92px] font-mono" value={scale} onChange={(e) => setScale(e.target.value)} /></Field></div>
            <div className={adv()}><Field label="Refresh (ms)"><input className="ctrl w-[110px] font-mono" value={rate} onChange={(e) => setRate(e.target.value)} /></Field></div>
            <button className="btn" onClick={doRead}>Read once</button>
            <button className="btn-ghost" onClick={toggleLive}>{live ? "Stop live" : "Start live"}</button>
            <StatusPill tone={readTone} live={live && readTone === "ok"}>{readMsg}</StatusPill>
          </div>

          <div className="px-6 pb-5">
            <p className="mt-2.5 text-[13px] text-muted">Value looks wrong or huge? Change <b>Show as</b> (Advanced adds <b>Pair order</b>) — it updates instantly, no need to read again.</p>
            <div className={`${adv("flex")} mt-2 flex-wrap items-center gap-3`}>
              <button className="btn-ghost" onClick={csv}>Download CSV</button>
              <button className="btn-ghost" onClick={saveCfg}>Save setup</button>
              <button className="btn-ghost" onClick={() => fileRef.current.click()}>Load setup</button>
              <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={loadCfg} />
            </div>
          </div>
        </section>

        {/* TAG MAP — named values */}
        <section className="panel p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <PanelHead n="3" title="Named values (tag map)" sub="Give each register a name & unit so raw numbers become readable, e.g. “Voltage — 230 V”." />
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost !h-9 !px-3 !text-sm" onClick={addTag}>+ Add tag</button>
              <button className="btn-ghost !h-9 !px-3 !text-sm" onClick={fitRangeToTags}>Set read range to fit</button>
              <button className="btn-ghost !h-9 !px-3 !text-sm" onClick={saveTags}>Save map</button>
              <button className="btn-ghost !h-9 !px-3 !text-sm" onClick={() => tagFileRef.current.click()}>Load map</button>
              <input ref={tagFileRef} type="file" accept="application/json" className="hidden" onChange={loadTags} />
            </div>
          </div>

          {tags.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-line bg-[#f9fafc] px-4 py-8 text-center text-muted">
              <div className="font-semibold text-ink2">No tags yet</div>
              <div className="text-sm">Add a tag, set its address, type and unit — then the live value shows with its name.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead><tr className="bg-[#f4f6f9] text-[12px] font-bold text-muted">
                  <th className="px-3 py-2.5 text-left">Tag name</th>
                  <th className="px-3 py-2.5 text-left">Address</th>
                  <th className="px-3 py-2.5 text-left">Type</th>
                  <th className={`px-3 py-2.5 text-left ${adv()}`}>Order</th>
                  <th className={`px-3 py-2.5 text-left ${adv()}`}>Scale ×</th>
                  <th className="px-3 py-2.5 text-left">Unit</th>
                  <th className="px-3 py-2.5 text-right">Live value</th>
                  <th className="px-3 py-2.5"></th>
                </tr></thead>
                <tbody>
                  {tags.map((t, i) => {
                    const val = raw ? decodeAt(raw.values, raw.start, +t.address || 0, t.type, t.word === "little", +t.scale || 1) : null;
                    return (
                      <tr key={i} className="border-t border-line align-middle">
                        <td className="px-3 py-2"><input className="ctrl !h-9 w-[150px]" value={t.name} onChange={(e) => updateTag(i, "name", e.target.value)} /></td>
                        <td className="px-3 py-2"><input className="ctrl !h-9 w-[84px] font-mono" value={t.address} onChange={(e) => updateTag(i, "address", e.target.value)} /></td>
                        <td className="px-3 py-2"><select className="ctrl !h-9" value={t.type} onChange={(e) => updateTag(i, "type", e.target.value)}>{TAG_TYPES.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}</select></td>
                        <td className={`px-3 py-2 ${adv()}`}><select className="ctrl !h-9 !min-w-[96px]" value={t.word} onChange={(e) => updateTag(i, "word", e.target.value)}><option value="big">Normal</option><option value="little">Swapped</option></select></td>
                        <td className={`px-3 py-2 ${adv()}`}><input className="ctrl !h-9 w-[80px] font-mono" value={t.scale} onChange={(e) => updateTag(i, "scale", e.target.value)} /></td>
                        <td className="px-3 py-2"><input className="ctrl !h-9 w-[84px]" placeholder="°C, V…" value={t.unit} onChange={(e) => updateTag(i, "unit", e.target.value)} /></td>
                        <td className="px-3 py-2 text-right font-mono text-[15px] font-semibold">
                          {val === null ? <span className="text-[12px] font-normal text-muted">out of range</span> : <>{val} <span className="text-[13px] font-normal text-muted">{t.unit}</span></>}
                        </td>
                        <td className="px-3 py-2 text-right"><button className="text-muted hover:text-danger" onClick={() => removeTag(i)} aria-label="Remove tag">✕</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-[13px] text-muted">“out of range” means your read above doesn’t cover this address — click <b>Set read range to fit</b>, then Read. The map is saved in this browser automatically.</p>
        </section>

        {/* ADVANCED : WRITE */}
        <section className={`panel p-6 ${adv()}`}>
          <PanelHead n="!" tone="amber" title="Write a value" sub="Sends a value to the device. This can change how a machine behaves — be careful." />
          <div className="flex flex-wrap items-end gap-3.5">
            <Field label="Write"><select className="ctrl" value={wType} onChange={(e) => setWType(e.target.value)}><option value="reg">One register</option><option value="coil">One coil (on/off)</option><option value="regs">Many registers</option></select></Field>
            <Field label="Address"><input className="ctrl w-[120px] font-mono" value={wAddr} onChange={(e) => setWAddr(e.target.value)} /></Field>
            <Field label="Value(s)"><input className="ctrl w-[220px]" placeholder="230   or   10,20,30" value={wVal} onChange={(e) => setWVal(e.target.value)} /></Field>
            <button className="btn btn-danger" onClick={doWrite}>Write value</button>
            <StatusPill tone={wTone}>{wMsg}</StatusPill>
          </div>
          <p className="mt-2.5 text-[13px] text-muted">Coil value: 0 (off) or 1 (on). Many registers: separate with commas, e.g. <span className="font-mono">10,20,30</span>.</p>
        </section>

        {/* ADVANCED : LOG */}
        <section className={`panel p-6 ${adv()}`}>
          <PanelHead n="⌘" tone="grey" title="Activity log" sub="Every request, response and error — useful for debugging." />
          <pre className="h-[170px] overflow-auto whitespace-pre-wrap rounded-[10px] bg-[#0c1327] p-3.5 font-mono text-[12px] leading-relaxed text-[#aebfe0]">{log}</pre>
          <div className="mt-3"><button className="btn-ghost" onClick={() => setLog("")}>Clear log</button></div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <div className="flex flex-col gap-1.5"><span className="field-label">{label}</span>{children}</div>;
}
function PanelHead({ n, title, sub, tone }) {
  const map = { amber: "bg-amber-soft text-amber", grey: "bg-[#e9edf3] text-ink2" };
  return (
    <div className="mb-[18px] flex items-center gap-3">
      <span className={`flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg text-sm font-bold ${map[tone] || "bg-brand-soft text-brand-ink"}`}>{n}</span>
      <div><h2 className="text-[17px] font-bold tracking-tight">{title}</h2><p className="text-[13.5px] text-muted">{sub}</p></div>
    </div>
  );
}
function Guide({ g }) {
  const err = g.kind !== "warn";
  return (
    <div className={`mt-4 flex items-start gap-3.5 rounded-xl p-4 ${err ? "border border-[#f3c9c6] bg-danger-soft text-danger" : "border border-[#f0dcb8] bg-amber-soft text-amber"}`}>
      <svg className="mt-0.5 flex-none" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
      <div className="flex-1 text-ink">
        <h3 className="text-[15px] font-bold">{g.title}</h3>
        {g.raw && <span className="my-2 inline-block rounded-md bg-black/5 px-2 py-0.5 font-mono text-[12.5px] text-ink2">{g.raw}</span>}
        {g.pts && g.pts.length > 0 && (
          <div className="mt-1"><b className="text-sm">What to check:</b>
            <ul className="mt-1.5 list-disc pl-5 text-sm">{g.pts.map((p, i) => <li key={i} className="my-0.5">{p}</li>)}</ul>
          </div>
        )}
      </div>
    </div>
  );
}
