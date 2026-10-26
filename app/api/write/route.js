import { openClient } from "@/lib/modbus";

export const runtime = "nodejs";

export async function POST(request) {
  const { conn, unitId = 1, type, address, value, values } = await request.json();
  let client;
  try {
    client = await openClient(conn, unitId);
    if (type === "coil") await client.writeCoil(address, !!value);
    else if (type === "reg") await client.writeRegister(address, value | 0);
    else if (type === "regs") await client.writeRegisters(address, (values || []).map((v) => v | 0));
    else throw new Error("unknown write type");
    return Response.json({ ok: true, type, address });
  } catch (err) {
    return Response.json({ ok: false, error: err.message });
  } finally {
    if (client) { try { client.close(() => {}); } catch (e) {} }
  }
}
