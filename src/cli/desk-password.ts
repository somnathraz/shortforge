#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { hashDeskPassword } from '../lib/deskAuth.js';

const supplied = process.argv[2];
const password = supplied || randomBytes(12).toString('base64url');
console.log(`DESK_AUTH_PASSWORD_HASH=${hashDeskPassword(password)}`);
if (!supplied) console.log(`# generated password (not stored anywhere): ${password}`);
console.log('# Put the HASH line in .env and remove DESK_AUTH_PASSWORD.');
