import net from "net";

export const runtime = "nodejs";

function tcpProbe(ip, port, timeout) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    let done = false;
    const fin = (ok) => { if (done) return; done = true; s.destroy(); resolve(ok); };
    s.setTimeout(timeout);
    s.once("connect", () => fin(true));
    s.once("timeout", () => fin(false));
    s.once("error", () => fin(false));
    s.connect(port, ip);
  });
}

export async function POST(request) {
  const { subnet, port = 502 } = await request.json();
  if (!/^\d+\.\d+\.\d+$/.test(subnet || "")) {
    return Response.json({ error: "subnet must look like 192.168.1" }, { status: 400 });
  }
  const checks = [];
  for (let h = 1; h <= 254; h++) {
    const ip = `${subnet}.${h}`;
    checks.push(tcpProbe(ip, port, 700).then((ok) => (ok ? ip : null)));
  }
  const found = (await Promise.all(checks)).filter(Boolean);
  return Response.json({ subnet, port, found });
}
