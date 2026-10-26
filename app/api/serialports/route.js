export const runtime = "nodejs";

export async function GET() {
  try {
    const { SerialPort } = await import("serialport");
    const ports = await SerialPort.list();
    return Response.json({
      available: true,
      ports: ports.map((p) => ({ path: p.path, maker: p.manufacturer || "" })),
    });
  } catch (e) {
    return Response.json({ available: false, ports: [], note: "serialport not installed" });
  }
}
