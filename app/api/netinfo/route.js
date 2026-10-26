import os from "os";

export const runtime = "nodejs";

export async function GET() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const i of ifaces[name]) {
      if (i.family === "IPv4" && !i.internal) {
        out.push({ iface: name, ip: i.address, mask: i.netmask });
      }
    }
  }
  return Response.json({ interfaces: out });
}
