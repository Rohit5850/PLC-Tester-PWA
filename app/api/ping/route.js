import net from "net";

export const runtime = "nodejs";

function tcpProbe(ip, port = 502, timeout = 1000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const s = new net.Socket();
    let done = false;
    const fin = (ok) => { if (done) return; done = true; s.destroy(); resolve({ ok, ms: Date.now() - start }); };
    s.setTimeout(timeout);
    s.once("connect", () => fin(true));
    s.once("timeout", () => fin(false));
    s.once("error", () => fin(false));
    s.connect(port, ip);
  });
}

export async function POST(request) {
  const { ip, port = 502 } = await request.json();
  const r = await tcpProbe(ip, port);
  return Response.json({ ip, port, reachable: r.ok, ms: r.ms });
}

export { tcpProbe };
