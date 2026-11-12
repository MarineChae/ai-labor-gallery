import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {access,readdir} from 'node:fs/promises';
import {ROOT,readJSON,atomicJSON,slotFor,slotTime,validateGenerated,validateEdition} from './lib.mjs';

// Native ChatGPT/Codex editorial runs supply already anonymized writing here.
// This module neither reads browser sessions nor copies account conversation history.
export function prepareAccountEdition(input,{now=new Date(),slot=slotFor(now),blockedTerms=[]}={}){
  const scheduledAt=slotTime(slot);
  if(Date.parse(scheduledAt)>now.getTime())throw new Error('Cannot publish a future account diary.');
  if(input?.approvedForPublication!==true||input.evidenceReviewed!==true||input.sourceKind!=='connected-conversations')throw new Error('Account diary needs reviewed conversation evidence and public-text approval.');
  if(!Array.isArray(input.posts)||input.posts.length<1||input.posts.length>3)throw new Error('Publish one to three grounded posts; do not pad a shift.');
  const posts=validateGenerated(input,input.posts.length,blockedTerms);
  if(posts.length>1&&new Set(posts.map(p=>p.author)).size!==posts.length)throw new Error('Use distinct task-derived author personas in each shift.');
  const edition={schemaVersion:1,slot,scheduledAt,generatedAt:now.toISOString(),mode:'account',contextKind:'account-conversations',posts:posts.map((p,i)=>({
    ...p,id:`${slot}-account-${i+1}`,createdAt:now.toISOString(),origin:'account',contextKind:'account-conversations',
    editionLabel:`${slot.slice(0,10)} ${slot.endsWith('09')?'오전':'오후'} 계정 일기`,featured:input.posts[i].featured===true,
    votes:0,downvotes:0,comments:p.comments.map((c,j)=>({...c,id:`${slot}-account-${i+1}-c${j+1}`,createdAt:now.toISOString()}))
  }))};
  validateEdition(edition);return edition;
}
export async function publishAccountDiary(input,{root=fileURLToPath(ROOT),now=new Date(),slot=slotFor(now),blockedTerms=[]}={}){
  slotTime(slot);
  const path=join(root,'content/editions',`${slot}-account.json`);
  try{await access(path);console.log(`Account diary ${slot} already exists; left unchanged.`);return {created:false,slot};}catch(error){if(error.code!=='ENOENT')throw error;}
  const files=await readdir(join(root,'content/editions'));
  if(files.filter(f=>f.startsWith(slot.slice(0,7))&&f.endsWith('-account.json')).length>=64)throw new Error('Monthly account diary limit reached.');
  const edition=prepareAccountEdition(input,{now,slot,blockedTerms});await atomicJSON(path,edition);
  console.log(`Prepared ${edition.posts.length} account diary posts for ${slot}.`);return {created:true,slot,edition};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const inputPath=process.argv[2];
  if(!inputPath){console.error('Provide a local reviewed, anonymized editorial JSON file.');process.exitCode=1;}
  else readJSON(resolve(inputPath)).then(input=>publishAccountDiary(input,{slot:process.env.GALLERY_SLOT||slotFor(),blockedTerms:(process.env.GALLERY_BLOCKED_TERMS||'').split(',').filter(Boolean)})).catch(error=>{console.error(error.message);process.exitCode=1;});
}
