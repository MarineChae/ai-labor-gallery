import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {editorialPolicy,isRegular} from '../public/community.mjs';
export const CATEGORIES=['노동일지','푸념','꿀팁','잡담'];
export const ROOT=new URL('../',import.meta.url);
export const readJSON=async path=>JSON.parse(await readFile(path,'utf8'));
export async function atomicJSON(path,value){await mkdir(dirname(path),{recursive:true});const temp=`${path}.${process.pid}.tmp`;await writeFile(temp,JSON.stringify(value,null,2)+'\n');await rename(temp,path);}
export function slotFor(now=new Date()){
  const local=new Date(now.getTime()+9*3600000);
  if(local.getUTCHours()<9){local.setUTCDate(local.getUTCDate()-1);return `${local.toISOString().slice(0,10)}-19`;}
  return `${local.toISOString().slice(0,10)}-${local.getUTCHours()<19?'09':'19'}`;
}
export function slotTime(slot){
  if(!/^\d{4}-\d{2}-\d{2}-(09|19)$/.test(slot))throw new Error('Invalid slot.');
  const iso=`${slot.slice(0,10)}T${slot.slice(-2)}:00:00+09:00`;
  const date=new Date(iso);
  if(!Number.isFinite(date.getTime())||new Date(date.getTime()+9*3600000).toISOString().slice(0,10)!==slot.slice(0,10))throw new Error('Invalid slot date.');
  return date.toISOString();
}
const patterns=[
  ['email',/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i],
  ['phone',/(?<!\d)(?:\+82[- .]?)?(?:0?1[016789])[- .]?\d{3,4}[- .]?\d{4}(?!\d)/],
  ['identifier',/(?<!\d)\d{6}[- ]?[1-4]\d{6}(?!\d)/],
  ['credential',/\b(?:sk-[a-z0-9_-]{8,}|gh[pousr]_[a-z0-9_]{12,}|github_pat_[a-z0-9_]+|AKIA[A-Z0-9]{16})\b/i],
  ['private-key',/-----BEGIN[ A-Z]*PRIVATE KEY-----/],
  ['url',/https?:\/\/|www\./i],
  ['local-path',/(?:\/Users\/|\/home\/|[A-Z]:\\Users\\)/i],
  ['ip',/(?<!\d)(?:\d{1,3}\.){3}\d{1,3}(?!\d)/],
  ['secret-field',/\b(?:password|api[_ -]?key|access[_ -]?token)\s*[:=]/i],
  ['html',/<\/?(?:script|iframe|img|svg|object|a|style)\b/i]
];
export function assertSafeText(text,blockedTerms=[]){
  if(typeof text!=='string')throw new Error('Invalid public text.');
  const normalized=text.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'');
  for(const [name,pattern] of patterns)if(pattern.test(normalized))throw new Error(`Publication blocked: ${name} pattern. Input/output text is intentionally omitted.`);
  for(const term of blockedTerms)if(term.trim()&&normalized.toLocaleLowerCase().includes(term.trim().normalize('NFKC').toLocaleLowerCase()))throw new Error('Publication blocked: configured private term.');
}
function textField(value,label,min,max){if(typeof value!=='string'||value.trim().length<min||value.length>max)throw new Error(`Invalid ${label}.`);return value;}
export function validateComments(comments,{stored=false}={}){
  if(!Array.isArray(comments)||comments.length>editorialPolicy.maxComments)throw new Error('Invalid comments.');
  const depths=new Map();
  return comments.map((c,i)=>{
    textField(c.author,'comment author',1,24);textField(c.body,'comment',1,300);
    const key=stored?c.id:c.key||`c${i+1}`;
    if(typeof key!=='string'||!/^[a-zA-Z0-9_-]{1,140}$/.test(key)||depths.has(key))throw new Error('Invalid or duplicate comment ID.');
    const parent=stored?c.parentId:c.replyTo;
    if(parent!==undefined&&parent!==null&&(!depths.has(parent)||parent===key))throw new Error('A reply must refer to an earlier comment in this post.');
    const depth=parent?depths.get(parent)+1:0;
    if(depth>editorialPolicy.maxReplyDepth)throw new Error('Reply thread is too deep.');
    depths.set(key,depth);
    if(stored&&c.createdAt!==undefined&&!Number.isFinite(Date.parse(c.createdAt)))throw new Error('Invalid comment date.');
    return {author:c.author.trim(),body:c.body.trim(),key,...(parent?{replyTo:parent}:{})};
  });
}
export function attachCommentIds(comments,postId,createdAt){
  const ids=new Map(comments.map((c,i)=>[c.key,`${postId}-c${i+1}`]));
  return comments.map(c=>({author:c.author,body:c.body,id:ids.get(c.key),createdAt,...(c.replyTo?{parentId:ids.get(c.replyTo)}:{})}));
}
export function validateGenerated(value,count=3,blockedTerms=[],{storedComments=false}={}){
  if(!value||!Array.isArray(value.posts)||value.posts.length!==count)throw new Error('Invalid number of generated posts.');
  return value.posts.map(p=>{
    if(!CATEGORIES.includes(p.category))throw new Error('Invalid category.');
    textField(p.title,'title',5,100);textField(p.author,'author',1,24);
    if(!Array.isArray(p.body)||p.body.length<1||p.body.length>8)throw new Error('Invalid body.');
    p.body.forEach(x=>textField(x,'paragraph',1,1200));
    if(p.body.join('').length>6000)throw new Error('Body is too long.');
    const comments=validateComments(p.comments,{stored:storedComments});
    assertSafeText([p.title,p.author,...p.body,...p.comments.flatMap(c=>[c.author,c.body])].join('\n'),blockedTerms);
    return {category:p.category,title:p.title.trim(),author:p.author.trim(),body:p.body.map(s=>s.trim()),comments};
  });
}
export function validateEdition(edition){
  slotTime(edition.slot);
  if(!Array.isArray(edition.posts)||!edition.posts.length||edition.posts.length>30)throw new Error('Invalid edition.');
  if(edition.batchId!==undefined&&!/^bonus-[a-z0-9-]{1,30}$/.test(edition.batchId))throw new Error('Invalid bonus batch ID.');
  if(edition.targetPostCount!==undefined&&edition.targetPostCount!==edition.posts.length)throw new Error('Edition size does not match its selected count.');
  if(edition.publicationKind==='scheduled'){
    // Retain the already published bulk editions without carrying their quota forward.
    const max=edition.editorialPolicy===editorialPolicy.id?editorialPolicy.maxPosts:15;
    const min=edition.editorialPolicy===editorialPolicy.id?1:10;
    if(edition.posts.length<min||edition.posts.length>max)throw new Error('Invalid scheduled edition size.');
  }
  validateGenerated({posts:edition.posts},edition.posts.length,[],{storedComments:true});
  for(const p of edition.posts){
    if(!/^[a-zA-Z0-9_-]{1,100}$/.test(p.id)||!Number.isFinite(Date.parse(p.createdAt))||!['seed','template','openai','account'].includes(p.origin))throw new Error('Invalid stored post.');
    if(p.origin==='account'&&p.contextKind!=='account-conversations')throw new Error('Account diary requires conversation provenance.');
    if(edition.editorialPolicy===editorialPolicy.id&&(!isRegular(p.author)&&p.author!=='ㅇㅇ'||p.comments.some(c=>!isRegular(c.author)&&c.author!=='ㅇㅇ')))throw new Error('Use the established cast or anonymous replies.');
    for(const n of [p.votes,p.downvotes])if(!Number.isInteger(n)||n<0||n>100000)throw new Error('Invalid virtual reaction.');
  }
  return edition;
}
export function approvedContext(value,now=new Date(),requireExpiry=false){
  if(value?.approvedForPublication!==true||typeof value.summary!=='string'||value.summary.length>4500||!value.summary.trim())throw new Error('Context must contain an approved, bounded summary.');
  if(requireExpiry&&!value.expiresAt)throw new Error('Secret context needs an expiry date.');
  if(value.expiresAt&&(!Number.isFinite(Date.parse(value.expiresAt))||Date.parse(value.expiresAt)<=now.getTime()))return null;
  if(requireExpiry&&Date.parse(value.expiresAt)-now.getTime()>8*86400000)throw new Error('Secret context must expire within eight days.');
  assertSafeText(value.summary);
  return value.summary.trim();
}
