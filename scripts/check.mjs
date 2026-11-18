import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
for(const file of readdirSync('extension').filter(f=>f.endsWith('.js')))execFileSync(process.execPath,['--check',`extension/${file}`],{stdio:'inherit'});
const manifest=JSON.parse(readFileSync('extension/manifest.json'));
for(const path of [manifest.background.service_worker,...manifest.content_scripts.flatMap(s=>s.js),...manifest.web_accessible_resources.flatMap(r=>r.resources)])if(!existsSync(`extension/${path}`))throw new Error(`Missing manifest file: ${path}`);
console.log('JavaScript syntax and extension manifest files verified.');
