import { openClient, readValues } from "@/lib/modbus";

export const runtime = "nodejs";

export async function POST(request) {
  const { conn, unitId = 1, fnCode = 3, start = 0, count = 10 } = await request.json();
  let client;
  try {
    client = await openClient(conn, unitId);
    const { bits, values } = await readValues(client, fnCode, start, count);
    return Response.json({ ok: true, fnCode, start, bits, values });
  } catch (err) {
    return Response.json({ ok: false, error: err.message });
  } finally {
    if (client) { try { client.close(() => {}); } catch (e) {} }
  }
}
