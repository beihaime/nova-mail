#!/usr/bin/env node
/**
 * Generate the VAPID key pair Web Push needs.
 *
 * Run it once, then store the two values as Worker secrets:
 *
 *   node scripts/generate-vapid-keys.mjs
 *   npx wrangler secret put vapid_public_key    # paste VAPID_PUBLIC_KEY
 *   npx wrangler secret put vapid_private_key   # paste VAPID_PRIVATE_KEY
 *   npx wrangler secret put vapid_subject       # mailto:you@example.com
 *
 * Rotating the pair invalidates every existing subscription: browsers reject
 * pushes signed with a key that does not match the one they subscribed with, so
 * users have to re-enable notifications.
 */

import { generateVapidKeys } from '../src/lib/web-push.js';

const { publicKey, privateKey } = await generateVapidKeys();

console.log('');
console.log('VAPID keys generated. Store them as Worker secrets:');
console.log('');
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('');
console.log('  npx wrangler secret put vapid_public_key');
console.log('  npx wrangler secret put vapid_private_key');
console.log('  npx wrangler secret put vapid_subject       # mailto:admin@example.com');
console.log('');
console.log('The public key is also served to the browser through GET /api/push/config.');
