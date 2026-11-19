// Change the admin password:  node set-admin-password.mjs "new password"
// Writes only the SHA-256 hash to admin-hash.js (public); the password itself is never stored in the repo.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const pw = process.argv[2];
if (!pw || pw.length < 10) { console.error('Usage: node set-admin-password.mjs "password of at least 10 characters"'); process.exit(1); }
const hash = createHash('sha256').update(pw, 'utf8').digest('hex');
writeFileSync(new URL('./admin-hash.js', import.meta.url), `// SHA-256 of the admin password. Change with: node set-admin-password.mjs "new password"\nexport const ADMIN_HASH = '${hash}';\n`);
console.log('admin-hash.js updated. Commit and push to apply.');
