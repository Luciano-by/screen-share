import { defineConfig } from "@playwright/test";

// STEP-014: testes E2E com navegador real. Sobem backend e frontend sozinhos
// (ou reaproveitam se já estiverem rodando).
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    // Usa o Google Chrome JÁ INSTALADO (não precisa baixar o Chromium do
    // Playwright, que redes restritas costumam bloquear).
    channel: "chrome",
    launchOptions: {
      args: [
        // Sem isso o Chrome pode bloquear o autoplay COM som no espectador.
        "--autoplay-policy=no-user-gesture-required",
        // Candidatos ICE com IP real em vez de nomes mDNS (.local): evita
        // depender de mDNS, que redes/antivírus corporativos costumam barrar.
        "--disable-features=WebRtcHideLocalIpsWithMdns",
      ],
    },
  },
  webServer: [
    { command: "npm run dev", cwd: "../backend", url: "http://localhost:3001/health", reuseExistingServer: true, timeout: 60_000 },
    { command: "npm run dev", cwd: ".", url: "http://localhost:5173", reuseExistingServer: true, timeout: 60_000 },
  ],
});
