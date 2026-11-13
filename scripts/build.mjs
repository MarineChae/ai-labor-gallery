import {readdir,rm,mkdir,cp,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {ROOT,readJSON,validateEdition} from './lib.mjs';
// Deliberate allowlist: never copy the repository, config, secrets, or raw input into the website.
export async function build(root=fileURLToPath(ROOT)){
  const editions=[];const ids=new Set();
  for(const f of (await readdir(join(root,'content/editions'))).filter(f=>f.endsWith('.json')).sort().reverse()){
    const ed=validateEdition(await readJSON(join(root,'content/editions',f)));
    const expected=ed.mode==='account'?`${ed.slot}-account${ed.batchId?`-${ed.batchId}`:''}.json`:`${ed.slot}.json`;
    if(f!==expected)throw new Error('Edition filename does not match slot.');
    for(const p of ed.posts){if(ids.has(p.id))throw new Error('Duplicate post ID.');ids.add(p.id);}
    editions.push(ed);
  }
  const posts=editions.flatMap(ed=>ed.posts).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||a.id.localeCompare(b.id));
  const dist=join(root,'dist');await rm(dist,{recursive:true,force:true});await mkdir(join(dist,'data'),{recursive:true});
  for(const name of ['index.html','style.css','tokens.css','app.js','core.mjs','manifest.webmanifest','assets','_headers'])await cp(join(root,'public',name),join(dist,name),{recursive:true});
  const payload={schemaVersion:1,editions:editions.map(({slot,scheduledAt,mode})=>({slot,scheduledAt,mode})),posts};
  await writeFile(join(dist,'data/posts.json'),JSON.stringify(payload)+'\n');await writeFile(join(dist,'.nojekyll'),'');
  const total=(await readFile(join(dist,'data/posts.json'))).length;
  console.log(`Built dist/: ${posts.length} posts, ${editions.length} editions, ${Math.round(total/1024)} KB archive.`);
  if(total>5*1024*1024)console.warn('Archive exceeds 5 MB. Consider year/month indexes for mobile performance.');
  return payload;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))build().catch(error=>{console.error(error.message);process.exitCode=1;});
