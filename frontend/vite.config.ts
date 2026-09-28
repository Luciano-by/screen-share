import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // STEP-012: testes unitários (jsdom). Os testes e2e ficam em e2e/ e
  // rodam com Playwright (npm run test:e2e), fora do vitest.
  // globals: true habilita a limpeza automática do DOM entre testes
  // (@testing-library/react só registra isso se enxergar um afterEach
  // global). Sem isso, o segundo teste de um arquivo "vê" o DOM do
  // teste anterior ainda montado.
  test: { environment: "jsdom", globals: true, include: ["src/**/*.test.{ts,tsx}"] },
});
