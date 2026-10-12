import { createApp } from "./server.js";

const port = Number(process.env.PORT ?? 8787);
const server = createApp().listen(port, () => {
  console.log("Hush - the interruption brain for Alexa+");
  console.log(`Simulated Alexa+ surface: http://localhost:${port}`);
  console.log(`MCP endpoint (Streamable HTTP): http://localhost:${port}/mcp`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
