import { test, expect, type Browser, type Page } from "@playwright/test";
import { FAKE_SCREEN } from "./fake-screen";

// STEP-014: fluxos principais com dois navegadores reais (transmissor e
// espectador), verificando que o vídeo REALMENTE está tocando (frames
// avançando), não só que a tela mudou de estado.

async function newPage(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.addInitScript(FAKE_SCREEN);
  return page;
}

const SELECT = "Selecionar tela, janela ou aba";

async function startBroadcast(page: Page): Promise<string> {
  await page.goto("/?debug=1");
  await page.getByRole("button", { name: "Iniciar transmissão" }).click();
  const link = page.locator(".room__link");
  await expect(link).toHaveText(/\/s\/[2-9A-HJ-NP-Z]{6}$/);
  const url = (await link.textContent())!.trim();
  await page.getByRole("button", { name: SELECT }).click();
  await expect(page.getByText("● TRANSMITINDO")).toBeVisible();
  return url;
}

async function expectVideoPlaying(page: Page) {
  const video = page.locator("video");
  await expect(video).toBeVisible();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 15_000 })
    .toBeGreaterThan(0);
  const frames = () =>
    video.evaluate((v: HTMLVideoElement) => v.getVideoPlaybackQuality().totalVideoFrames);
  const before = await frames();
  await expect.poll(frames, { timeout: 8_000 }).toBeGreaterThan(before);
}

test("espectador recebe e reproduz vídeo e áudio", async ({ browser }) => {
  const a = await newPage(browser);
  const url = await startBroadcast(a);

  const b = await newPage(browser);
  await b.goto(`${url}?debug=1`);
  await expectVideoPlaying(b);

  await expect(b.locator(".debug")).toContainText("conexão: connected");
  const audioTracks = await b
    .locator("video")
    .evaluate((v: HTMLVideoElement) => (v.srcObject as MediaStream).getAudioTracks().length);
  expect(audioTracks).toBe(1);
  await expect(a.getByText("1 espectador(es) conectado(s).")).toBeVisible();
});

test("encerrar transmissão avisa o espectador e permite transmitir de novo", async ({ browser }) => {
  const a = await newPage(browser);
  const url = await startBroadcast(a);
  const b = await newPage(browser);
  await b.goto(url);
  await expectVideoPlaying(b);

  await a.getByRole("button", { name: "Encerrar transmissão" }).click();
  await expect(b.getByText("AGUARDANDO")).toBeVisible();

  await a.getByRole("button", { name: SELECT }).click();
  await expectVideoPlaying(b);
});

test("troca de transmissor: espectador pede, transmissor aceita, papéis invertem", async ({ browser }) => {
  const a = await newPage(browser);
  const url = await startBroadcast(a);
  const b = await newPage(browser);
  await b.goto(url);
  await expectVideoPlaying(b);

  await b.getByRole("button", { name: "Solicitar transmissão" }).click();
  await a.getByRole("button", { name: "Aceitar" }).click();

  await expect(b.getByRole("button", { name: SELECT })).toBeVisible(); // B agora transmite
  await expect(a.getByText("AGUARDANDO")).toBeVisible(); // A agora assiste
  await b.getByRole("button", { name: SELECT }).click();
  await expectVideoPlaying(a);
});

test("transmissor recarrega a página com espectador na sala e volta a transmitir", async ({ browser }) => {
  const a = await newPage(browser);
  const url = await startBroadcast(a);
  const b = await newPage(browser);
  await b.goto(url);
  await expectVideoPlaying(b);

  await a.reload();
  await expect(b.getByText("AGUARDANDO")).toBeVisible();
  await a.getByRole("button", { name: SELECT }).click();
  await expectVideoPlaying(b);
});
