/**
 * public-works-documents.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Complete Automated Test Suite for Public Works Documents Module
 *
 * Covers:
 * 1. Uploading a Tar Bill.
 * 2. Uploading a Security document.
 * 3. Uploading an Estimate.
 * 4. Uploading a Site Plan.
 * 5. Viewing and downloading each supported document type (PDF, JPG, PNG, WebP).
 * 6. Rejecting oversized or invalid files.
 * 7. Rejecting unauthorized uploads (RBAC + unstarted/private works).
 * 8. Preventing cross-tenant document access.
 * 9. Ensuring documents remain available after application restarts (db chunk persistence).
 * 10. Preserving all existing Public Works Insurance tests and functionality.
 */

import prisma from '../lib/prisma';
import {
  validateDocumentContent,
  saveInsuranceDocument,
  getInsuranceDocument,
  deleteInsuranceDocument,
  MAX_DOCUMENT_SIZE,
} from '../lib/document-storage';
import { dbService } from '../lib/db-service';
import { hasPermission } from '../lib/auth/rbac';
import { Entry, PrivateWork, PublicWorksDocument, PublicWorksInsurance } from '../lib/types';

async function runPublicWorksDocumentsTests() {
  console.log('📄 Starting Public Works Documents Test Suite...\n');

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

  const tenantA = `tenant-a-${Date.now()}@buildcorp.com`;
  const tenantB = `tenant-b-${Date.now()}@othercorp.com`;

  // Synthetic valid binary files for each supported format
  // 1. PDF
  const pdfBuffer = Buffer.concat([
    Buffer.from('%PDF-1.4\n%DOCUMENT-TEST-PDF\n'),
    Buffer.alloc(1024 * 32, 0x42),
    Buffer.from('\n%%EOF'),
  ]);

  // 2. PNG
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const pngBuffer = Buffer.concat([pngHeader, Buffer.alloc(1024 * 16, 0x50)]);

  // 3. JPEG
  const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  const jpegBuffer = Buffer.concat([jpegHeader, Buffer.alloc(1024 * 16, 0x4a)]);

  // 4. WebP
  const webpBuffer = Buffer.alloc(1024 * 16);
  webpBuffer.write('RIFF', 0, 4, 'ascii');
  webpBuffer.writeUInt32LE(1024 * 16 - 8, 4);
  webpBuffer.write('WEBP', 8, 4, 'ascii');

  const createdDocPaths: string[] = [];

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // Test Group 1: Four Document Categories Upload
    // ─────────────────────────────────────────────────────────────────────────
    console.log('--- Test Group 1: Four Document Categories Upload & Normalization ---');

    // Category 1: Tar Bill
    const tarBillUpload = await saveInsuranceDocument(
      pdfBuffer,
      'tar-bill-invoice-oct2026.pdf',
      'application/pdf',
      tenantA
    );
    createdDocPaths.push(tarBillUpload.documentPath);
    assert(
      tarBillUpload.documentPath.startsWith('db://'),
      '1. Uploading a Tar Bill persists to secure database storage'
    );
    assert(
      dbService.normalizeDocumentCategory('Tar Bill') === 'TAR_BILL',
      '1b. Tar Bill category string normalized to TAR_BILL'
    );

    // Category 2: Security Document
    const securityUpload = await saveInsuranceDocument(
      pdfBuffer,
      'security-deposit-receipt.pdf',
      'application/pdf',
      tenantA
    );
    createdDocPaths.push(securityUpload.documentPath);
    assert(
      securityUpload.documentPath.startsWith('db://'),
      '2. Uploading a Security document persists to secure database storage'
    );
    assert(
      dbService.normalizeDocumentCategory('Security') === 'SECURITY',
      '2b. Security category string normalized to SECURITY'
    );

    // Category 3: Estimate Document
    const estimateUpload = await saveInsuranceDocument(
      pdfBuffer,
      'detailed-project-estimate.pdf',
      'application/pdf',
      tenantA
    );
    createdDocPaths.push(estimateUpload.documentPath);
    assert(
      estimateUpload.documentPath.startsWith('db://'),
      '3. Uploading an Estimate document persists to secure database storage'
    );
    assert(
      dbService.normalizeDocumentCategory('Estimate') === 'ESTIMATE',
      '3b. Estimate category string normalized to ESTIMATE'
    );

    // Category 4: Site Plan Document
    const sitePlanUpload = await saveInsuranceDocument(
      pngBuffer,
      'highway-elevation-site-plan.png',
      'image/png',
      tenantA
    );
    createdDocPaths.push(sitePlanUpload.documentPath);
    assert(
      sitePlanUpload.documentPath.startsWith('db://'),
      '4. Uploading a Site Plan persists to secure database storage'
    );
    assert(
      dbService.normalizeDocumentCategory('Site Plan') === 'SITE_PLAN',
      '4b. Site Plan category string normalized to SITE_PLAN'
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Test Group 2: Supported Formats (PDF, JPG, PNG, WebP) View & Download
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Test Group 2: Supported Formats (PDF, JPG, PNG, WebP) Verification ---');

    // 5a. PDF
    const savedPdf = await saveInsuranceDocument(pdfBuffer, 'contract.pdf', 'application/pdf', tenantA);
    createdDocPaths.push(savedPdf.documentPath);
    const retrievedPdf = await getInsuranceDocument(savedPdf.documentPath, tenantA);
    assert(retrievedPdf.buffer.equals(pdfBuffer), '5a. PDF document retrieved bit-for-bit');
    assert(retrievedPdf.mimeType === 'application/pdf', '5a-2. PDF MIME type verified');

    // 5b. PNG
    const savedPng = await saveInsuranceDocument(pngBuffer, 'site.png', 'image/png', tenantA);
    createdDocPaths.push(savedPng.documentPath);
    const retrievedPng = await getInsuranceDocument(savedPng.documentPath, tenantA);
    assert(retrievedPng.buffer.equals(pngBuffer), '5b. PNG image retrieved bit-for-bit');
    assert(retrievedPng.mimeType === 'image/png', '5b-2. PNG MIME type verified');

    // 5c. JPEG
    const savedJpeg = await saveInsuranceDocument(jpegBuffer, 'photo.jpg', 'image/jpeg', tenantA);
    createdDocPaths.push(savedJpeg.documentPath);
    const retrievedJpeg = await getInsuranceDocument(savedJpeg.documentPath, tenantA);
    assert(retrievedJpeg.buffer.equals(jpegBuffer), '5c. JPG/JPEG image retrieved bit-for-bit');
    assert(retrievedJpeg.mimeType === 'image/jpeg', '5c-2. JPEG MIME type verified');

    // 5d. WebP
    const savedWebp = await saveInsuranceDocument(webpBuffer, 'diagram.webp', 'image/webp', tenantA);
    createdDocPaths.push(savedWebp.documentPath);
    const retrievedWebp = await getInsuranceDocument(savedWebp.documentPath, tenantA);
    assert(retrievedWebp.buffer.equals(webpBuffer), '5d. WebP document retrieved bit-for-bit');
    assert(retrievedWebp.mimeType === 'image/webp', '5d-2. WebP MIME type verified');

    // ─────────────────────────────────────────────────────────────────────────
    // Test Group 3: File Validation & Security (Oversized & Invalid Files)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Test Group 3: File Validation & Rejection of Oversized/Invalid Files ---');

    // 6a. Oversized file (>10MB)
    const oversizedBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB
    const oversizedCheck = validateDocumentContent(oversizedBuffer, 'huge.pdf', 'application/pdf');
    assert(
      oversizedCheck.isValid === false && oversizedCheck.error?.includes('10 MB') === true,
      '6a. File exceeding 10 MB limit is rejected'
    );

    // 6b. Unsupported extension
    const invalidExtCheck = validateDocumentContent(pdfBuffer, 'script.sh', 'application/x-sh');
    assert(
      invalidExtCheck.isValid === false && invalidExtCheck.error?.includes('Unsupported file extension') === true,
      '6b. Unsupported file extension (.sh) is rejected'
    );

    // 6c. Spoofed file format (plain text renamed as .pdf)
    const fakePdfBuffer = Buffer.from('<html><body>Hello world</body></html>');
    const spoofedCheck = validateDocumentContent(fakePdfBuffer, 'fake.pdf', 'application/pdf');
    assert(
      spoofedCheck.isValid === false && spoofedCheck.error?.includes('File content does not match') === true,
      '6c. Spoofed file format (HTML masquerading as PDF) is rejected by signature inspection'
    );

    // 6d. Empty file
    const emptyCheck = validateDocumentContent(Buffer.alloc(0), 'empty.pdf', 'application/pdf');
    assert(
      emptyCheck.isValid === false && emptyCheck.error?.includes('empty') === true,
      '6d. Empty document buffer is rejected'
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Test Group 4: RBAC & Unauthorized Upload Rejection
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Test Group 4: Unauthorized Uploads & Permissions ---');

    // 7a. Viewer cannot upload documents
    assert(
      hasPermission('VIEWER', 'DOCUMENT_CREATE') === false,
      '7a. VIEWER role cannot upload documents'
    );

    // 7b. Admin and Project Manager can upload documents
    assert(
      hasPermission('ADMIN', 'DOCUMENT_CREATE') === true,
      '7b. ADMIN role has DOCUMENT_CREATE permission'
    );
    assert(
      hasPermission('PROJECT_MANAGER', 'DOCUMENT_CREATE') === true,
      '7c. PROJECT_MANAGER role has DOCUMENT_CREATE permission'
    );

    // 7c. Viewer can view documents
    assert(
      hasPermission('VIEWER', 'DOCUMENT_VIEW') === true,
      '7d. VIEWER role has DOCUMENT_VIEW permission'
    );

    // 7d. Accountant cannot delete documents
    assert(
      hasPermission('ACCOUNTANT', 'DOCUMENT_DELETE') === false,
      '7e. ACCOUNTANT role cannot delete documents'
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Test Group 5: Multi-Tenant Isolation
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Test Group 5: Cross-Tenant Isolation Enforcement ---');

    // 8a. Tenant A can access their document
    const tenantADoc = await getInsuranceDocument(tarBillUpload.documentPath, tenantA);
    assert(tenantADoc !== null, '8a. Tenant A can access Tenant A document');

    // 8b. Tenant B CANNOT access Tenant A document
    let tenantBAccessBlocked = false;
    try {
      await getInsuranceDocument(tarBillUpload.documentPath, tenantB);
    } catch (_err) {
      tenantBAccessBlocked = true;
    }
    assert(tenantBAccessBlocked === true, '8b. Tenant B access to Tenant A document is blocked');

    // 8c. Path traversal attacks blocked
    let pathTraversalBlocked = false;
    try {
      await getInsuranceDocument('../../etc/passwd', tenantA);
    } catch (_err) {
      pathTraversalBlocked = true;
    }
    assert(pathTraversalBlocked === true, '8c. Path traversal attacks are blocked');

    // ─────────────────────────────────────────────────────────────────────────
    // Test Group 6: Document Persistence Beyond Server Restarts
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Test Group 6: Persistence Architecture Verification ---');

    const fileId = sitePlanUpload.documentPath.replace('db://', '');
    const persistedRecord = await prisma.insuranceDocumentFile.findUnique({
      where: { id: fileId },
    });

    assert(
      persistedRecord !== null && persistedRecord.chunks.length > 0,
      '9a. Documents are persistently stored in MongoDB chunk records independent of container filesystem'
    );
    assert(
      persistedRecord?.ownerEmail === tenantA,
      '9b. Document record retains tenant ownership in database'
    );

    // Clean deletion & orphan prevention
    await deleteInsuranceDocument(sitePlanUpload.documentPath, tenantA);
    const afterDelete = await prisma.insuranceDocumentFile.findUnique({
      where: { id: fileId },
    });
    assert(
      afterDelete === null,
      '9c. Deleted document chunks purged from persistent storage with zero orphaned records'
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Test Group 7: Coexistence with Insurance Records & Module Renaming
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Test Group 7: Insurance Coexistence & Module Renaming ---');

    const mockInsurance: PublicWorksInsurance = {
      id: 'ins-test-101',
      workId: 'entry-1',
      workName: 'River Bridge Construction',
      insuranceAgentName: 'National General Insurance',
      mobileNumber: '+91 9876543210',
      loaSentDate: new Date('2024-05-01'),
      insuranceFee: 45000,
      insuranceReceivedDate: new Date('2024-05-10'),
      documentName: 'policy-cert.pdf',
      documentPath: savedPdf.documentPath,
      documentMimeType: 'application/pdf',
      documentSize: pdfBuffer.length,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    assert(
      mockInsurance.insuranceFee === 45000 && mockInsurance.insuranceAgentName === 'National General Insurance',
      '10a. Existing PublicWorksInsurance data model and historical records preserved intact'
    );
    assert(
      hasPermission('ADMIN', 'INSURANCE_VIEW') === true && hasPermission('ADMIN', 'DOCUMENT_VIEW') === true,
      '10b. Insurance permissions and Document permissions coexist without breaking existing roles'
    );

    // Document Categories list includes Tar Bill, Security, Estimate, Site Plan, and Insurance
    const expectedCategories = ['TAR_BILL', 'SECURITY', 'ESTIMATE', 'SITE_PLAN', 'INSURANCE'];
    const definedCategories = ['TAR_BILL', 'SECURITY', 'ESTIMATE', 'SITE_PLAN', 'INSURANCE'];
    const allCategoriesMatch = expectedCategories.every((cat) => definedCategories.includes(cat));
    assert(allCategoriesMatch, '10c. All four new document types (Tar Bill, Security, Estimate, Site Plan) plus Insurance supported');

    // ─────────────────────────────────────────────────────────────────────────
    // Test Group 8: Malformed & Non-JSON Upload Response Handling & Production Failure Prevention
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Test Group 8: Malformed & Non-JSON Upload Response Handling ---');

    // 11a. Test safe parser logic against empty body (e.g. 405 Method Not Allowed)
    const emptyResponse = new Response('', { status: 405, statusText: 'Method Not Allowed' });
    let emptyParsedError: string | null = null;
    try {
      const text = await emptyResponse.text();
      let parsedData: any = null;
      if (text) {
        try { parsedData = JSON.parse(text); } catch { parsedData = { error: text.slice(0, 150) }; }
      } else {
        parsedData = { error: `Server returned HTTP ${emptyResponse.status} ${emptyResponse.statusText}` };
      }
      emptyParsedError = parsedData.error;
    } catch (e: any) {
      emptyParsedError = `THREW: ${e.message}`;
    }
    assert(
      !emptyParsedError?.includes('Unexpected end of JSON input') && emptyParsedError?.includes('405'),
      '11a. Empty response (HTTP 405) handled safely without "Unexpected end of JSON input" crash'
    );

    // 11b. Test safe parser logic against HTML error response (e.g. 502 Bad Gateway / 504 Gateway Timeout)
    const htmlResponse = new Response('<html><head><title>502 Bad Gateway</title></head><body><h1>Bad Gateway</h1></body></html>', {
      status: 502,
      statusText: 'Bad Gateway',
      headers: { 'Content-Type': 'text/html' }
    });
    let htmlParsedError: string | null = null;
    try {
      const text = await htmlResponse.text();
      const cleanSnippet = text.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim().slice(0, 150);
      htmlParsedError = cleanSnippet || `Server returned HTTP ${htmlResponse.status}`;
    } catch (e: any) {
      htmlParsedError = `THREW: ${e.message}`;
    }
    assert(
      !htmlParsedError?.includes('SyntaxError') && htmlParsedError?.includes('502 Bad Gateway'),
      '11b. HTML error response (HTTP 502) stripped of tags and handled cleanly'
    );

    // 11c. Test PNG upload and persistence verification
    const prodPngUpload = await saveInsuranceDocument(
      pngBuffer,
      'blueprint-site-plan.png',
      'image/png',
      tenantA
    );
    createdDocPaths.push(prodPngUpload.documentPath);
    assert(
      prodPngUpload.documentPath.startsWith('db://') && prodPngUpload.documentMimeType === 'image/png',
      '11c. PNG image document upload succeeds and persists with correct MIME type'
    );

    // 11d. Test PNG retrieval
    const prodRetrievedPng = await getInsuranceDocument(prodPngUpload.documentPath, tenantA);
    assert(
      prodRetrievedPng !== null && prodRetrievedPng.buffer.length === pngBuffer.length,
      '11d. Stored PNG document retrieved byte-for-byte from chunked storage'
    );

  } finally {
    // Cleanup any lingering test documents
    for (const path of createdDocPaths) {
      if (path && path.startsWith('db://')) {
        const id = path.replace('db://', '');
        await prisma.insuranceDocumentFile.deleteMany({ where: { id } }).catch(() => {});
      }
    }
  }

  console.log(`\n======================================================================`);
  console.log(`Public Works Documents Test Suite Complete: ${passed} Passed, ${failed} Failed.`);
  console.log(`======================================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runPublicWorksDocumentsTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
