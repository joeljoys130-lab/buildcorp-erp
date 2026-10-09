/**
 * document-persistence-e2e.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * End-to-end verification of persistent document uploads and authenticated
 * retrieval without ephemeral filesystem or /tmp dependence on Netlify.
 */

import prisma from '../lib/prisma';
import {
  saveInsuranceDocument,
  getInsuranceDocument,
  deleteInsuranceDocument,
  validateDocumentContent,
} from '../lib/document-storage';

async function runE2E() {
  console.log('🧪 Starting End-to-End Document Persistence & Security Verification...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASSED: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${testName}${detail ? ` - ${detail}` : ''}`);
      failed++;
    }
  }

  const tenantOwner = `e2e-tenant-${Date.now()}@buildcorp.com`;
  const attackerTenant = `attacker-${Date.now()}@othercorp.com`;

  // Synthetic valid PDF binary payload
  const pdfHeader = Buffer.from('%PDF-1.4\n%E2E-TEST-PERSISTENCE\n');
  const pdfBody = Buffer.alloc(1024 * 128, 0x41); // 128KB payload
  const testPdf = Buffer.concat([pdfHeader, pdfBody, Buffer.from('\n%%EOF')]);

  let savedDocPath = '';

  try {
    // 1. Validation check
    const validation = validateDocumentContent(testPdf, 'road-insurance.pdf', 'application/pdf');
    assert(validation.isValid && validation.detectedMimeType === 'application/pdf', '1. Document magic bytes validated as PDF');

    // 2. Persistent Document Upload (No local disk / /tmp)
    const uploadResult = await saveInsuranceDocument(
      testPdf,
      'road-insurance.pdf',
      'application/pdf',
      tenantOwner
    );
    savedDocPath = uploadResult.documentPath;

    assert(
      uploadResult.documentPath.startsWith('db://'),
      '2. Document persisted using database URI scheme (db://), decoupled from local filesystem'
    );

    const fileId = savedDocPath.replace('db://', '');
    const dbRecord = await prisma.insuranceDocumentFile.findUnique({
      where: { id: fileId },
    });

    assert(
      dbRecord !== null && dbRecord.ownerEmail === tenantOwner && dbRecord.chunks.length > 0,
      '3. Stored file record exists in MongoDB Atlas with binary chunks and correct tenant ownership'
    );

    // 4. Authenticated Document Retrieval (Owner)
    const retrieved = await getInsuranceDocument(savedDocPath, tenantOwner);
    assert(
      retrieved.buffer.equals(testPdf),
      '4. Authenticated document retrieval returns bit-for-bit exact original document buffer'
    );
    assert(
      retrieved.fileName === 'road-insurance.pdf' && retrieved.mimeType === 'application/pdf',
      '5. Stored document metadata (fileName, mimeType) preserved accurately'
    );

    // 6. Cross-Tenant Isolation / Security check
    let accessBlocked = false;
    try {
      await getInsuranceDocument(savedDocPath, attackerTenant);
    } catch (_err) {
      accessBlocked = true;
    }
    assert(
      accessBlocked === true,
      '6. Cross-tenant document retrieval denied for non-owner'
    );

    // 7. Document Replacement / Cleanup (Orphan prevention)
    await deleteInsuranceDocument(savedDocPath, tenantOwner);
    const postDeleteRecord = await prisma.insuranceDocumentFile.findUnique({
      where: { id: fileId },
    });
    assert(
      postDeleteRecord === null,
      '7. Stored file and binary chunks purged from database upon deletion (no orphaned files)'
    );

    let retrieveAfterDeleteBlocked = false;
    try {
      await getInsuranceDocument(savedDocPath, tenantOwner);
    } catch (_err) {
      retrieveAfterDeleteBlocked = true;
    }
    assert(
      retrieveAfterDeleteBlocked === true,
      '8. Subsequent retrieval of purged document rejected cleanly'
    );

  } finally {
    // Final cleanup if any record remains
    if (savedDocPath && savedDocPath.startsWith('db://')) {
      const fileId = savedDocPath.replace('db://', '');
      await prisma.insuranceDocumentFile.deleteMany({
        where: { id: fileId },
      }).catch(() => {});
    }
  }

  console.log(`\n======================================================================`);
  console.log(`E2E Document Persistence Verification: ${passed} Passed, ${failed} Failed.`);
  console.log(`======================================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runE2E().catch((err) => {
  console.error('E2E execution failure:', err);
  process.exit(1);
});
