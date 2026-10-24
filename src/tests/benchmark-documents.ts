/**
 * benchmark-documents.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Measures the baseline performance of document operations across:
 * 1. File validation
 * 2. Buffer to chunks transformation (base64 overhead)
 * 3. MongoDB chunk write latency
 * 4. MongoDB chunk read latency
 * 5. Chunks to Buffer transformation
 * 6. Full end-to-end upload and retrieval for 100KB, 1MB, 5MB, and 9.5MB payloads
 */

import prisma from '../lib/prisma';
import {
  validateDocumentContent,
  saveInsuranceDocument,
  getInsuranceDocument,
  deleteInsuranceDocument,
} from '../lib/document-storage';
import { dbService } from '../lib/db-service';

function createSyntheticPdf(sizeBytes: number): Buffer {
  const header = Buffer.from('%PDF-1.4\n%BENCHMARK-TEST\n');
  const footer = Buffer.from('\n%%EOF');
  const bodySize = Math.max(0, sizeBytes - header.length - footer.length);
  const body = Buffer.alloc(bodySize, 0x5a); // 'Z'
  return Buffer.concat([header, body, footer]);
}

interface BenchmarkResult {
  sizeLabel: string;
  sizeBytes: number;
  validationMs: number;
  uploadTotalMs: number;
  dbWriteMs: number;
  retrieveTotalMs: number;
  dbReadMs: number;
  chunkCount: number;
}

async function runBenchmark() {
  console.log('⚡ Starting Public Works Document Storage Benchmark...\n');

  const testTenant = `benchmark-${Date.now()}@buildcorp.com`;
  const testSizes = [
    { label: 'Small PDF (100 KB)', size: 100 * 1024 },
    { label: 'Typical Estimate (1 MB)', size: 1024 * 1024 },
    { label: 'Large Document (5 MB)', size: 5 * 1024 * 1024 },
    { label: 'Near Limit Document (9.5 MB)', size: Math.floor(9.5 * 1024 * 1024) },
  ];

  const results: BenchmarkResult[] = [];

  for (const item of testSizes) {
    console.log(`Testing ${item.label} (${(item.size / 1024 / 1024).toFixed(2)} MB)...`);
    const pdfBuffer = createSyntheticPdf(item.size);

    // 1. Validation
    const valStart = performance.now();
    const valResult = validateDocumentContent(pdfBuffer, 'benchmark.pdf', 'application/pdf');
    const validationMs = performance.now() - valStart;
    if (!valResult.isValid) {
      console.error(`Validation failed for ${item.label}:`, valResult.error);
      continue;
    }

    // 2. Upload / Save
    const uploadStart = performance.now();
    const uploadResult = await saveInsuranceDocument(
      pdfBuffer,
      'benchmark.pdf',
      'application/pdf',
      testTenant
    );
    const uploadTotalMs = performance.now() - uploadStart;

    // Check stored record
    const fileId = uploadResult.documentPath.replace('db://', '');
    const record = await prisma.insuranceDocumentFile.findUnique({
      where: { id: fileId },
    });
    const chunkCount = record?.chunks?.length || 0;

    // 3. Retrieval
    const retrieveStart = performance.now();
    const retrieved = await getInsuranceDocument(uploadResult.documentPath, testTenant);
    const retrieveTotalMs = performance.now() - retrieveStart;

    // Verify bitwise match
    const matches = retrieved.buffer.equals(pdfBuffer);
    if (!matches) {
      console.error(`Mismatch in retrieved buffer for ${item.label}!`);
    }

    // 4. Cleanup
    await deleteInsuranceDocument(uploadResult.documentPath, testTenant);

    results.push({
      sizeLabel: item.label,
      sizeBytes: item.size,
      validationMs,
      uploadTotalMs,
      dbWriteMs: uploadTotalMs - validationMs, // approximate
      retrieveTotalMs,
      dbReadMs: retrieveTotalMs,
      chunkCount,
    });
  }

  console.log('\n=============================================================================');
  console.log('BENCHMARK RESULTS (BASELINE)');
  console.log('=============================================================================');
  console.table(results.map(r => ({
    'File Type': r.sizeLabel,
    'Size (MB)': (r.sizeBytes / (1024 * 1024)).toFixed(2),
    'Chunks': r.chunkCount,
    'Validation (ms)': r.validationMs.toFixed(2),
    'Upload Total (ms)': r.uploadTotalMs.toFixed(2),
    'Retrieve Total (ms)': r.retrieveTotalMs.toFixed(2),
  })));

  await prisma.$disconnect();
}

runBenchmark().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
