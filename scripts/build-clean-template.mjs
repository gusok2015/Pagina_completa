import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

async function run() {
  console.log("Construyendo plantilla base perfecta desde media_1789841227777.png...");

  const sourcePath = resolve("C:/Users/PC/.gemini/antigravity-ide/brain/dd549024-a6ca-48a3-b962-da20b47c60cc/.tempmediaStorage/media_1789841227777.png");
  const sourceBase64 = readFileSync(sourcePath).toString("base64");
  const sourceDataUri = `data:image/png;base64,${sourceBase64}`;

  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome" });
  } catch {
    browser = await chromium.launch();
  }

  const page = await browser.newPage();

  const cleanBgBase64 = await page.evaluate(async (dataUri) => {
    const img = new Image();
    img.src = dataUri;
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
    });

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);

    const w = canvas.width;
    const h = canvas.height;

    // 1. Limpiar el sector dinámico del cuerpo de texto a la izquierda
    // Fondo base #FEFEFB
    ctx.fillStyle = "#FEFEFB";

    // Nombre del alumno
    ctx.fillRect(Math.round(w * 0.05), Math.round(h * 0.29), Math.round(w * 0.48), Math.round(h * 0.09));

    // DNI text (a la derecha de la barra naranja)
    ctx.fillRect(Math.round(w * 0.14), Math.round(h * 0.36), Math.round(w * 0.38), Math.round(h * 0.04));

    // Descripción "ha completado..."
    ctx.fillRect(Math.round(w * 0.05), Math.round(h * 0.39), Math.round(w * 0.48), Math.round(h * 0.045));

    // Título del curso
    ctx.fillRect(Math.round(w * 0.05), Math.round(h * 0.435), Math.round(w * 0.48), Math.round(h * 0.14));

    // Duración y período
    ctx.fillRect(Math.round(w * 0.05), Math.round(h * 0.575), Math.round(w * 0.48), Math.round(h * 0.075));

    // Fecha y ubicación
    ctx.fillRect(Math.round(w * 0.05), Math.round(h * 0.65), Math.round(w * 0.48), Math.round(h * 0.05));

    // 2. Limpiar el código en la esquina superior derecha
    ctx.fillRect(Math.round(w * 0.81), Math.round(h * 0.06), Math.round(w * 0.17), Math.round(h * 0.035));

    // 3. Limpiar el QR viejo para que quede el fondo limpio y continuo sin marcas ni marcos
    // El área del QR está entre y: 76.5% y 88.5%, x: 83.5% y 94.5%
    const qx1 = Math.round(w * 0.84);
    const qy1 = Math.round(h * 0.762);
    const qw = Math.round(w * 0.10);
    const qh = Math.round(h * 0.125);

    // Rellenar suavemente con el color de fondo exacto del panel (#FAF9F6)
    ctx.fillStyle = "#FAF9F6";
    ctx.fillRect(qx1, qy1, qw, qh);

    return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
  }, sourceDataUri);

  await browser.close();

  const bgPath = resolve("public/certificate-assets/certificate-template-bg.png");
  const newBuffer = Buffer.from(cleanBgBase64, "base64");
  writeFileSync(bgPath, newBuffer);
  console.log(`✓ Fondo limpio guardado en: ${bgPath} (${newBuffer.length} bytes)`);

  const templateBgTsPath = resolve("src/lib/certificates/template-bg-base64.ts");
  const tsContent = `export const TEMPLATE_BG_BASE64 = "${cleanBgBase64}";\n`;
  writeFileSync(templateBgTsPath, tsContent);
  console.log(`✓ Actualizado ${templateBgTsPath}`);
}

run().catch(console.error);
