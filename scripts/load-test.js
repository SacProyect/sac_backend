/**
 * Load test con autocannon.
 * Uso:
 *   1. Arranca el servidor en otro terminal: npm run dev
 *   2. Ejecuta: node scripts/load-test.js
 *   3. Opcional: BASE_URL=http://localhost:4000 CONNECTIONS=20 DURATION=10 node scripts/load-test.js
 *
 * Variables de entorno:
 *   BASE_URL  - base de la API (default: http://localhost:3000)
 *   CONNECTIONS - conexiones concurrentes (default: 10)
 *   DURATION - duración en segundos (default: 5)
 */

const autocannon = require("autocannon");

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const connections = parseInt(process.env.CONNECTIONS || "10", 10);
const duration = parseInt(process.env.DURATION || "5", 10);

const url = `${baseUrl.replace(/\/$/, "")}/`;

console.log(`Load test: ${url}`);
console.log(`Connections: ${connections}, Duration: ${duration}s\n`);

autocannon(
  {
    url,
    connections,
    duration,
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  },
  (err, result) => {
    if (err) {
      console.error("Error:", err);
      process.exit(1);
    }
    console.log(autocannon.printResult(result));
  }
);
