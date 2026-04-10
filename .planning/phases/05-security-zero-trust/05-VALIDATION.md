# Validation Protocol: Phase 05 - Advanced Security

This protocol defines the verification steps required to certify the security hardening of the PDF Unlocker application.

## 🏁 Success Criteria

| ID | Truth | Verification Method |
|----|-------|---------------------|
| SC-5.1 | All local assets have valid SRI hashes in `index.html`. | Automated: Script verification + Browser check. |
| SC-5.2 | CSP v3 blocks unsafe-eval and restricted origins. | Automated: Playwright network audit. |
| SC-5.3 | Audit Log persists processing events across sessions. | Manual/Automated: IndexedDB inspection. |
| SC-5.4 | Processed files include SHA-256 verification hashes. | Automated: Vitest comparison with Web Crypto. |

## 🛠️ Automated Verification Suite

### A-5.1: SRI Check
Validates that every `<script>` and `<link>` in `index.html` has an `integrity` attribute matching the actual file content.
- **Command:** `node scripts/verifySri.js`

### A-5.2: CSP Audit
Checks the Content Security Policy for violations and ensures strict source enforcement.
- **Command:** `npx playwright test tests/security.spec.js --grep "@csp"`

### A-5.3: Hashing Integration Test
Verifies that the `pdfWorker` calculates and returns a correct SHA-256 hash.
- **Command:** `npm test tests/pdfWorker.test.js`

## 🧪 Sampling Plan
- **Audit Log:** Verify ≥5 processing events (success, failure, batch) are recorded.
- **Hashing:** Verify hashes for 3 file sizes: <1MB, 10MB, 100MB+.
