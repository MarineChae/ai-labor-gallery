import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {access,readdir} from 'node:fs/promises';
import {ROOT,readJSON,atomicJSON,slotFor,slotTime,validateGenerated,validateEdition,attachCommentIds} from './lib.mjs';
import {editorialPolicy,isRegular} from '../public/community.mjs';

// Native ChatGPT/Codex editorial runs supply already anonymized writing here.
// This module neither reads browser sessions nor copies account conversation history.
export const MAX_SHIFT_POSTS=editorialPolicy.maxPosts;
function batchSuffix(batchId){
  if(batchId===null)return '';
  if(typeof batchId!=='string'||!/^bonus-[a-z0-9-]{1,30}$/.test(batchId))throw new Error('Invalid bonus batch ID.');
  return `-${batchId}`;
}
export async function planAccountEdition({root=fileURLToPath(ROOT),now=new Date(),slot=slotFor(now)}={}){
  const scheduledAt=slotTime(slot);
  if(Date.parse(scheduledAt)>now.getTime())throw new Error('Cannot plan a future shift.');
  const published=join(root,'content/editions',`${slot}-account.json`);
  try{const edition=await readJSON(published);validateEdition(edition);return {slot,count:edition.posts.length,published:true};}catch(error){if(error.code!=='ENOENT')throw error;}
  // A ceiling, not a quota. Old random plans cannot force padding in a new run.
  return {slot,policy:editorialPolicy.id,minPosts:0,maxPosts:MAX_SHIFT_POSTS,published:false};
}
export function prepareAccountEdition(input,{now=new Date(),slot=slotFor(now),blockedTerms=[],targetPostCount=input?.targetPostCount,batchId=null}={}){
  const scheduledAt=slotTime(slot);
  if(Date.parse(scheduledAt)>now.getTime())throw new Error('Cannot publish a future account diary.');
  if(input?.approvedForPublication!==true||input.evidenceReviewed!==true||input.sourceKind!=='connected-conversations')throw new Error('Account diary needs reviewed conversation evidence and public-text approval.');
  const suffix=batchSuffix(batchId);
  const count=targetPostCount??input.posts?.length;
  const maximum=batchId?30:MAX_SHIFT_POSTS;
  if(!Number.isInteger(count)||count<1||count>maximum||!Array.isArray(input.posts)||input.posts.length!==count)throw new Error('Select 1–3 strong posts, or an explicitly requested bonus batch.');
  const posts=validateGenerated(input,input.posts.length,blockedTerms);
  if(posts.some(p=>!isRegular(p.author)&&p.author!=='ㅇㅇ'||p.comments.some(c=>!isRegular(c.author)&&c.author!=='ㅇㅇ')))throw new Error('Use the established cast or anonymous replies; do not invent more regulars.');
  if(new Set(posts.map(p=>p.title)).size!==posts.length)throw new Error('Duplicate titles in the same edition.');
  const edition={schemaVersion:1,slot,scheduledAt,generatedAt:now.toISOString(),mode:'account',contextKind:'account-conversations',editorialPolicy:editorialPolicy.id,publicationKind:batchId?'bonus':'scheduled',targetPostCount:count,...(batchId?{batchId}:{}),posts:posts.map((p,i)=>({
    ...p,id:`${slot}-account${suffix}-${i+1}`,createdAt:now.toISOString(),origin:'account',contextKind:'account-conversations',
    editionLabel:`${slot.slice(0,10)} ${batchId?'추가 리젠 · 대화 회고':slot.endsWith('09')?'오전 계정 일기':'오후 계정 일기'}`,featured:input.posts[i].featured===true,
    votes:0,downvotes:0,comments:attachCommentIds(p.comments,`${slot}-account${suffix}-${i+1}`,now.toISOString())
  }))};
  validateEdition(edition);return edition;
}
export async function publishAccountDiary(input,{root=fileURLToPath(ROOT),now=new Date(),slot=slotFor(now),blockedTerms=[],batchId=null}={}){
  slotTime(slot);
  const path=join(root,'content/editions',`${slot}-account${batchSuffix(batchId)}.json`);
  try{await access(path);console.log(`Account diary ${slot} already exists; left unchanged.`);return {created:false,slot};}catch(error){if(error.code!=='ENOENT')throw error;}
  const files=await readdir(join(root,'content/editions'));
  if(files.filter(f=>f.startsWith(slot.slice(0,7))&&f.endsWith('-account.json')).length>=64)throw new Error('Monthly account diary limit reached.');
  if(!batchId&&Array.isArray(input?.posts)&&input.posts.length===0){
    if(input.approvedForPublication!==true||input.evidenceReviewed!==true||input.sourceKind!=='connected-conversations')throw new Error('Skipping requires an actual evidence review.');
    console.log(`No strong new scene for ${slot}; nothing published.`);return {created:false,skipped:true,slot};
  }
  const count=input.posts?.length;
  const edition=prepareAccountEdition(input,{now,slot,blockedTerms,targetPostCount:count,batchId});await atomicJSON(path,edition);
  console.log(`Prepared ${edition.posts.length} account diary posts for ${slot}.`);return {created:true,slot,edition};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const inputPath=process.argv[2];const slot=process.env.GALLERY_SLOT||slotFor();
  const bonusIndex=process.argv.indexOf('--bonus');const batchId=bonusIndex>=0?process.argv[bonusIndex+1]:null;
  if(inputPath==='--plan')planAccountEdition({slot}).then(plan=>console.log(JSON.stringify(plan))).catch(error=>{console.error(error.message);process.exitCode=1;});
  else if(!inputPath||bonusIndex>=0&&!batchId){console.error('Provide a reviewed editorial JSON file, or --plan; --bonus needs a batch ID.');process.exitCode=1;}
  else readJSON(resolve(inputPath)).then(input=>publishAccountDiary(input,{slot,batchId,blockedTerms:(process.env.GALLERY_BLOCKED_TERMS||'').split(',').filter(Boolean)})).catch(error=>{console.error(error.message);process.exitCode=1;});
}
