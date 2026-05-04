import "dotenv/config";
import mqtt from "mqtt";

const MQTT_URL = process.env.MQTT_URL || "mqtt://localhost:1883";

const DEV_EUI = process.env.LPWAN_DEV_EUI || "70B3D57ED005A001";
const GATEWAY_ID = process.env.LPWAN_GATEWAY_ID || "GW-HANOI-01";
const INTERVAL_MS = Number(process.env.LPWAN_INTERVAL_MS || 5000);

function randomBetween(min: number, max: number, digits = 1) {
  const value = min + Math.random() * (max - min);
  return Number(value.toFixed(digits));
}

function randomInt(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`LoRaWAN-like simulator connecting to ${MQTT_URL}`);
  console.log(`DevEUI: ${DEV_EUI}`);
  console.log(`Gateway: ${GATEWAY_ID}`);

  const client = mqtt.connect(MQTT_URL, {
    reconnectPeriod: 2000,
  });

  let fCnt = 0;

  client.on("connect", async () => {
    console.log("LoRaWAN-like simulator connected");

    while (true) {
      const delay = randomInt(1000, 3000);
      await sleep(delay);

      fCnt += 1;

      const temperatureC = randomBetween(24, 38, 1);
      const humidityPct = randomBetween(45, 85, 1);
      const rssi = randomInt(-122, -82);
      const snr = randomBetween(-6, 12, 1);
      const spreadingFactor = randomInt(7, 12);
      const batteryPct = randomBetween(70, 100, 1);

      const topic = `lpwan/uplink/${DEV_EUI}`;
      const payload = {
        devEui: DEV_EUI,
        gatewayId: GATEWAY_ID,
        networkType: "LORAWAN",
        rssi,
        snr,
        spreadingFactor,
        fCnt,
        ts: new Date().toISOString(),
        payload: {
          temperatureC,
          humidityPct,
          batteryPct,
        },
      };

      client.publish(topic, JSON.stringify(payload), { qos: 0 }, (err) => {
        if (err) {
          console.error("Publish error:", err.message);
          return;
        }

        console.log(
          `LPWAN uplink #${fCnt} -> ${topic} | temp=${temperatureC}C hum=${humidityPct}% rssi=${rssi}dBm snr=${snr} SF${spreadingFactor}`,
        );
      });

      await sleep(Math.max(1000, INTERVAL_MS - delay));
    }
  });

  client.on("error", (err) => {
    console.error("MQTT error:", err.message);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
