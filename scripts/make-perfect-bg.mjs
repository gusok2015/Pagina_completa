import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

async function run() {
  console.log("Generando fondo limpio y continuo sin recuadro blanco para el QR...");

  const rightGraphicPath = resolve("public/certificate-assets/certificate-right-graphic.png");
  const rightBase64 = readFileSync(rightGraphicPath).toString("base64");
  const rightDataUri = `data:image/png;base64,${rightBase64}`;

  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome" });
  } catch {
    browser = await chromium.launch();
  }

  const page = await browser.newPage();

  const cleanBgBase64 = await page.evaluate(async (dataUri) => {
    // 1. Cargar la imagen base derecha que tiene la textura original
    const img = new Image();
    img.src = dataUri;
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
    });

    const canvas = document.createElement("canvas");
    // Tamaño completo de la plantilla del certificado: 2362 x 1670 (aprox A4 a 200dpi) o dimensiones nativas
    // Vamos a usar 2362 x 1670 (relación 297 x 210)
    canvas.width = 2362;
    canvas.height = 1670;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    // Fondo base blanco cálido del certificado
    ctx.fillStyle = "#FEFEFB";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dibujar el sector derecho gráfico
    // right-graphic tiene proporción 3:4 aprox, lo escalamos a la derecha
    const rightWidth = Math.round(canvas.height * (img.naturalWidth / img.naturalHeight));
    const rightX = canvas.width - rightWidth;
    ctx.drawImage(img, rightX, 0, rightWidth, canvas.height);

    // 2. Limpiar el sector del texto izquierdo (para que no queden restos de textos viejos)
    // El sector izquierdo (0 a 45% del ancho) es fondo liso #FEFEFB
    ctx.fillStyle = "#FEFEFB";
    ctx.fillRect(0, 0, canvas.width * 0.44, canvas.height);

    // 3. Limpiar también el sector donde estaba el QR en right-graphic para que la textura sea suave
    // Coordenadas del QR en el canvas completo:
    // QR está debajo de "TECNOLOGÍA PARA IDEAS REALES." y encima de "VALIDÁ ESTE CERTIFICADO"
    // Busquemos el área del QR anterior
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    // Detectar los módulos negros del QR anterior en el área (x > 80%, y > 75%)
    const qx1 = Math.floor(canvas.width * 0.81);
    const qx2 = Math.floor(canvas.width * 0.94);
    const qy1 = Math.floor(canvas.height * 0.755);
    const qy2 = Math.floor(canvas.height * 0.885);

    // En esa zona, reemplazar los píxeles oscuros (QR) por el color del fondo de la pared/piso circundante
    // La pared de concreto alrededor del QR es un gradiente suave muy claro de #F0EFEA a #E5E3DC
    for (let y = qy1; y <= qy2; y++) {
      const ty = (y - qy1) / (qy2 - qy1);
      // Gradiente sutil del concreto en esa zona vertical
      const baseR = Math.round(242 - ty * 12);
      const baseG = Math.round(241 - ty * 13);
      const baseB = Math.round(238 - ty * 14);

      for (let x = qx1; x <= qx2; x++) {
        const tx = (x - qx1) / (qx2 - qx1);
        const idx = (y * canvas.width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // Si es píxel del QR (oscuro) o si es parte de un artefacto blanco
        const brightness = (r + g + b) / 3;
        if (brightness < 200 || brightness > 252) {
          // Asignar el tono continuo de la pared de concreto
          data[idx] = baseR + Math.floor((Math.random() - 0.5) * 4); // micro textura de concreto
          data[idx + 1] = baseG + Math.floor((Math.random() - 0.5) * 4);
          data[idx + 2] = baseB + Math.floor((Math.random() - 0.5) * 4);
          data[idx + 3] = 255;
        }
      }
    }

    // 4. Limpiar también el código viejo "BPC-PYVC-2026-0008" en la esquina superior derecha
    const cx1 = Math.floor(canvas.width * 0.75);
    const cx2 = Math.floor(canvas.width * 0.98);
    const cy1 = Math.floor(canvas.height * 0.05);
    const cy2 = Math.floor(canvas.height * 0.12);

    for (let y = cy1; y <= cy2; y++) {
      for (let x = cx1; x <= cx2; x++) {
        const idx = (y * canvas.width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const brightness = (r + g + b) / 3;
        // Limpiar el texto oscuro del código viejo
        if (brightness < 180 && x > canvas.width * 0.8) {
          data[idx] = 250;
          data[idx + 1] = 249;
          data[idx + 2] = 247;
          data[idx + 3] = 255;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // Dibujar elementos fijos del diseño de Breakpoint con máxima nitidez:
    // Logo BREAKPOINT CREATIVA arriba a la izquierda
    ctx.font = "bold 58px Arial, sans-serif";
    ctx.fillStyle = "#11100e";
    ctx.fillText("BREAKPOINT", 136, 120);
    ctx.fillStyle = "#ff5500";
    ctx.fillText("A", 345, 120); // letra naranja en BREAKPOINT
    ctx.fillStyle = "#11100e";
    ctx.font = "300 24px Arial, sans-serif";
    ctx.letterSpacing = "14px";
    ctx.fillText("C R E A T I V A", 140, 160);

    // // CERTIFICADO DE FINALIZACIÓN
    ctx.letterSpacing = "0px";
    ctx.font = "bold 44px Arial, sans-serif";
    ctx.fillStyle = "#ff5500";
    ctx.fillText("//", 136, 260);
    ctx.fillStyle = "#11100e";
    ctx.fillText("CERTIFICADO DE FINALIZACIÓN", 200, 260);

    // Firmas abajo a la izquierda
    // Líneas de firma
    ctx.strokeStyle = "#a09d98";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(136, 1340);
    ctx.lineTo(520, 1340);
    ctx.moveTo(640, 1340);
    ctx.lineTo(1020, 1340);
    ctx.stroke();

    ctx.font = "bold 26px Arial, sans-serif";
    ctx.fillStyle = "#0f0e0c";
    ctx.fillText("Carolina Riveros", 136, 1380);
    ctx.fillText("Gustavo Rojas", 640, 1380);

    ctx.font = "400 22px Arial, sans-serif";
    ctx.fillStyle = "#55524c";
    ctx.fillText("Dirección / Capacitadora", 136, 1415);
    ctx.fillText("Dirección / Capacitador", 640, 1415);

    // // APRENDER · CREAR · TRANSFORMAR
    ctx.font = "bold 28px Arial, sans-serif";
    ctx.fillStyle = "#ff5500";
    ctx.fillText("//", 136, 1530);
    ctx.fillStyle = "#2b2824";
    ctx.font = "500 24px Arial, sans-serif";
    ctx.letterSpacing = "3px";
    ctx.fillText("APRENDER  ·  CREAR  ·  TRANSFORMAR", 185, 1530);

    return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
  }, rightDataUri);

  await browser.close();

  const bgPath = resolve("public/certificate-assets/certificate-template-bg.png");
  const newBuffer = Buffer.from(cleanBgBase64, "base64");
  writeFileSync(bgPath, newBuffer);
  console.log(`✓ Fondo nuevo generado sin recuadros blancos: ${bgPath} (${newBuffer.length} bytes)`);

  const templateBgTsPath = resolve("src/lib/certificates/template-bg-base64.ts");
  const tsContent = `export const TEMPLATE_BG_BASE64 = "${cleanBgBase64}";\n`;
  writeFileSync(templateBgTsPath, tsContent);
  console.log(`✓ Actualizado ${templateBgTsPath}`);
}

run().catch(console.error);
