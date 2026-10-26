// Shared Modbus helpers (server side only).
import ModbusRTU from "modbus-serial";

// conn = { type:"tcp", ip, port, timeout } | { type:"rtu", com, baud, parity, dataBits, stopBits, timeout }
export async function openClient(conn, unitId) {
  const client = new ModbusRTU();
  client.setTimeout((conn && conn.timeout) || 3000);
  if (conn && conn.type === "rtu") {
    await client.connectRTUBuffered(conn.com, {
      baudRate: conn.baud || 9600,
      parity: conn.parity || "none",
      dataBits: conn.dataBits || 8,
      stopBits: conn.stopBits || 1,
    });
  } else {
    await client.connectTCP(conn.ip, { port: (conn && conn.port) || 502 });
  }
  client.setID(unitId || 1);
  return client;
}

// fnCode: 1 coil, 2 discrete, 3 holding, 4 input
export async function readValues(client, fnCode, start, count) {
  let data;
  let bits = false;
  if (fnCode === 1) { data = (await client.readCoils(start, count)).data; bits = true; }
  else if (fnCode === 2) { data = (await client.readDiscreteInputs(start, count)).data; bits = true; }
  else if (fnCode === 4) { data = (await client.readInputRegisters(start, count)).data; }
  else { data = (await client.readHoldingRegisters(start, count)).data; }
  data = data.slice(0, count);
  return { bits, values: bits ? data.map((b) => (b ? 1 : 0)) : data };
}
