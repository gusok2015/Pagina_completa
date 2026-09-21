import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

async function run() {
  console.log("Iniciando eliminación del recuadro blanco en la imagen de fondo...");
  const bgPath = resolve("public/certificate-assets/certificate-template-bg.png");
  const bgBase64 = readFileSync(bgPath).toString("base64");
  const bgDataUri = `data:image/png;base64,${bgBase64}`;

  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome" });
  } catch {
    browser = await chromium.launch();
  }

  const page = await browser.newPage();
  
  const resultBase64 = await page.evaluate(async (dataUri) => {
    const img = new Image();
    img.src = dataUri;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    // Detectar el bounding box del recuadro blanco en el sector inferior derecho
    // (x > 75%, y > 65%)
    let minX = canvas.width, maxX = 0, minY = canvas.height, maxY = 0;
    const startX = Math.floor(canvas.width * 0.75);
    const startY = Math.floor(canvas.height * 0.65);
    const endX = Math.floor(canvas.width * 0.98);
    const endY = Math.floor(canvas.height * 0.92);

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const idx = (y * canvas.width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        // Si es blanco puro (#ffffff o casi puro)
        if (r > 250 && g > 250 && b > 250) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    console.log("White box bounds:", { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY });

    if (maxX > minX && maxY > minY) {
      // Tomar una muestra del degradado natural de fondo justo a la izquierda del recuadro blanco
      // y pintar suavemente sobre el recuadro blanco
      const sampleWidth = maxX - minX;
      const sampleX = Math.max(0, minX - sampleWidth - 10);
      
      // Crear un gradiente lineal interpolando desde el fondo circundante
      // Obtener colores en los 4 bordes circundantes
      const getPixel = (px, py) => {
        const i = (py * canvas.width + px) * 4;
        return [data[i], data[i + 1], data[i + 2]];
      };

      // Rellenar pixel a pixel con interpolación bilineal de los bordes externos
      const pad = 4;
      const bx1 = Math.max(0, minX - pad);
      const bx2 = Math.min(canvas.width - 1, maxX + pad);
      const by1 = Math.max(0, minY - pad);
      const by2 = Math.min(canvas.height - 1, maxY + pad);

      for (let y = by1; y <= by2; y++) {
        const ty = (y - by1) / (by2 - by1);
        const topCol = getPixel(bx1, by1);
        const bottomCol = getPixel(bx1, by2);
        
        // Muestra de la izquierda a la misma altura
        const leftCol = getPixel(bx1, y);
        // Muestra de la derecha a la misma altura
        const rightCol = getPixel(bx2, y);

        for (let x = bx1; x <= bx2; x++) {
          const tx = (x - bx1) / (bx2 - bx1);
          
          // Interpolación bilineal suave
          const r = Math.round((1 - tx) * leftCol[0] + tx * rightCol[0]);
          const g = Math.round((1 - tx) * leftCol[1] + tx * rightCol[1]);
          const b = Math.round((1 - tx) * leftCol[2] + tx * rightCol[2]);

          const idx = (y * canvas.width + x) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        }
      }

      ctx.putImageData(imgData, 0, 0);
    }

    return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
  }, bgDataUri);

  await browser.close();

  if (resultBase64) {
    const newBuffer = Buffer.from(resultBase64, "base64");
    writeFileSync(bgPath, newBuffer);
    console.log(`✓ Imagen ${bgPath} actualizada sin el recuadro blanco (${newBuffer.length} bytes)`);

    // Actualizar también template-bg-base64.ts
    const templateBgTsPath = resolve("src/lib/certificates/template-bg-base64.ts");
    const tsContent = `export const TEMPLATE_BG_BASE64 = "${resultBase64}";\n`;
    writeFileSync(templateBgTsPath, tsContent);
    console.log(`✓ Actualizado ${templateBgTsPath}`);
  }
}

run().catch(console.error);
