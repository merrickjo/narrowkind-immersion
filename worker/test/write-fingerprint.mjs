import { writeFileSync } from 'node:fs';
import { parserRegion, version, digest, FP } from './fingerprint.mjs';
const line = `${version()} ${digest(parserRegion())}\n`;
writeFileSync(FP, line);
console.log('recorded ' + line.trim());
