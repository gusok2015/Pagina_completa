import * as XLSX from "xlsx";
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseUploadedSpreadsheet } from "../src/lib/certificates/excel-template.ts";
import { validateImportBatch, confirmImportBatch, getCertificateBatches } from "../src/lib/certificates/batches.server.ts";
import { generateSingleCertificatePdf, generateCertificatesZip } from "../src/lib/certificates/pdf-generator.server.ts";
import { getCertificateValidationUrl, validateCertificateQrMatch, generateCertificateQrSvg } from "../src/lib/certificates/template.ts";

const outputDir = resolve("generated/test-import");
if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

async function runTest() {
  console.log("==================================================");
  console.log("PRUEBA AUTOMATIZADA DE IMPORTACIÓN MASIVA Y GENERACIÓN");
  console.log("==================================================");

  // 1. Crear archivo Excel de prueba con 3 alumnos ficticios
  const testStudents = [
    {
      Nombre: "Lucia",
      Apellido: "Maldonado",
      DNI: "35.111.222",
    },
    {
      Nombre: "Federico",
      Apellido: "Navarro",
      DNI: "38.333.444",
    },
    {
      Nombre: "Valeria",
      Apellido: "Soria",
      DNI: "41.555.666",
    },
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(testStudents);
  XLSX.utils.book_append_sheet(wb, ws, "Alumnos");

  const testFilePath = join(outputDir, "prueba_alumnos_3.xlsx");
  XLSX.writeFile(wb, testFilePath);
  console.log(`\n1. Archivo Excel de prueba creado en: ${testFilePath}`);

  // 2. Parsear el archivo Excel
  const fileBuffer = readFileSync(testFilePath);
  const parseResult = parseUploadedSpreadsheet(fileBuffer);
  console.log(`\n2. Parseo de hoja de cálculo: ${parseResult.rows.length} filas leídas, ${parseResult.errors.length} errores iniciales.`);
  if (parseResult.errors.length > 0) {
    console.error("Errores:", parseResult.errors);
    process.exit(1);
  }

  // 3. Validar lote y calcular códigos correlativos
  const defaultCourse = {
    name: "Python con Análisis de Datos y Vibe Coding",
    code: "PYVC",
    hours: 64,
    period: "abril – julio 2026",
    issueDate: "2026-09-18",
  };

  const validationSummary = await validateImportBatch(parseResult.rows, defaultCourse);
  console.log(`\n3. Resumen de validación del servidor:`);
  console.log(`- Válido: ${validationSummary.valid}`);
  console.log(`- Total alumnos: ${validationSummary.totalStudents}`);
  console.log(`- Duplicados en DB: ${validationSummary.duplicateDniInDbCount}`);
  console.log(`- Códigos asignados:`);
  validationSummary.items.forEach((item) => {
    console.log(`   * ${item.participantName} (DNI ${item.dni}) -> ${item.assignedCode}`);
  });

  // 4. Confirmar importación en la base de datos
  const importResult = await confirmImportBatch("Carolina Riveros (Admin)", validationSummary.items, { skipDuplicates: true });
  console.log(`\n4. Confirmación de importación:`);
  console.log(`- Lote ID: ${importResult.batchId}`);
  console.log(`- Registros insertados: ${importResult.insertedCount}`);
  console.log(`- Certificados: ${importResult.certificates.join(", ")}`);

  // 5. Verificar QRs y generación de PDFs individuales
  console.log(`\n5. Verificación de QR y generación de PDFs:`);
  const certDataList = [];

  for (const item of validationSummary.items) {
    const qrUrl = getCertificateValidationUrl(item.assignedCode);
    const qrSvg = generateCertificateQrSvg(item.assignedCode);
    const qrValid = validateCertificateQrMatch(item.assignedCode, qrSvg);
    console.log(`- ${item.assignedCode}: QR Match=${qrValid} | URL: ${qrUrl}`);

    const certData = {
      certificateCode: item.assignedCode,
      participantName: item.participantName,
      firstName: item.firstName,
      lastName: item.lastName,
      dni: item.dni,
      courseName: item.courseName,
      hours: item.hours,
      period: item.period,
      issueDate: item.issueDate,
    };
    certDataList.push(certData);

    const { buffer, filename } = await generateSingleCertificatePdf(certData);
    const pdfPath = join(outputDir, filename);
    writeFileSync(pdfPath, buffer);
    console.log(`  ✓ PDF generado: ${filename} (${buffer.length} bytes)`);
  }

  // 6. Generación de archivo ZIP con todo el lote
  console.log(`\n6. Empaquetado y generación del archivo ZIP:`);
  const { buffer: zipBuffer, filename: zipFilename } = await generateCertificatesZip(certDataList, `Certificados_Lote_${importResult.batchId}.zip`);
  const zipPath = join(outputDir, zipFilename);
  writeFileSync(zipPath, zipBuffer);
  console.log(`  ✓ Archivo ZIP generado con éxito: ${zipFilename} (${zipBuffer.length} bytes)`);

  // 7. Verificar listado de lotes
  const batches = await getCertificateBatches();
  console.log(`\n7. Historial de lotes en base de datos: ${batches.length} lote(s) registrado(s).`);
  batches.forEach((b) => {
    console.log(`   * Lote ${b.id}: ${b.courseName} (${b.processed} alumnos) - Estado: ${b.status} - Creado por: ${b.createdBy}`);
  });

  console.log("\n==================================================");
  console.log("¡TODAS LAS PRUEBAS DE IMPORTACIÓN Y GENERACIÓN COMPLETADAS CON ÉXITO!");
  console.log("==================================================");
}

runTest().catch((err) => {
  console.error("Error en la prueba:", err);
  process.exit(1);
});
