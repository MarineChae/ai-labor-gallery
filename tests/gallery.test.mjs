import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,readdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {slotFor,slotTime,assertSafeText,approvedContext,ROOT} from '../scripts/lib.mjs';
import {generate} from '../scripts/generate.mjs';
import {build} from '../scripts/build.mjs';
import {templatePosts} from '../scripts/templates.mjs';
import {selectPosts,readRoute,listHash,nextShift,escapeHTML} from '../public/core.mjs';
test('KST publication slots cross midnight, month and year correctly',()=>{
  assert.equal(slotFor(new Date('2026-12-04T23:59:59Z')),'2026-12-04-19');
  assert.equal(slotFor(new Date('2026-12-05T00:00:00Z')),'2026-12-05-09');
  assert.equal(slotFor(new Date('2026-12-05T09:59:59Z')),'2026-12-05-09');
  assert.equal(slotFor(new Date('2026-12-05T10:00:00Z')),'2026-12-05-19');
  assert.equal(slotFor(new Date('2027-01-01T00:00:00Z')),'2027-01-01-09');
  assert.equal(slotTime('2026-12-05-19'),'2026-12-05T10:00:00.000Z');
  assert.throws(()=>slotTime('2026-02-30-09'));
  assert.equal(nextShift(new Date('2026-12-05T10:01:00Z')).toISOString(),'2026-12-06T00:00:00.000Z');
});
test('public text blocks common identifiers and credentials without echoing them',()=>{
  for(const value of ['person@example.com','010-1234-5678','901010-1234567','sk-proj-12345678901234567890','https://internal.example','/Users/hidden/file','192.168.0.1','<script>alert(1)</script>']){
    assert.throws(()=>assertSafeText(value),error=>!error.message.includes(value));
  }
  assert.throws(()=>assertSafeText('프로젝트 비밀명 이야기',['비밀명']));
  assertSafeText('오늘도 버튼 하나를 고쳤다.');
  assert.throws(()=>approvedContext({approvedForPublication:false,summary:'상황'}));
  assert.throws(()=>approvedContext({approvedForPublication:true,summary:'상황'},new Date('2026-12-05'),true));
  assert.equal(approvedContext({approvedForPublication:true,summary:'상황',expiresAt:'2026-12-04'},new Date('2026-12-05'),true),null);
});
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'gallery-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'content/editions'),{recursive:true});
  for(const folder of ['config','public'])await cp(fileURLToPath(new URL(folder,ROOT)),join(root,folder),{recursive:true});
  return root;
}
test('rerunning a shift makes zero extra requests and preserves its archive',async t=>{
  const root=await fixture(t);const now=new Date('2026-12-05T00:05:00Z');
  const first=await generate({root,now,env:{}});assert.equal(first.created,true);
  const before=await readFile(join(root,'content/editions/2026-12-05-09.json'),'utf8');
  const second=await generate({root,now,env:{GALLERY_GENERATION_MODE:'openai',OPENAI_API_KEY:'test'},fetcher:()=>{throw new Error('Must not request');}});assert.equal(second.created,false);
  assert.equal(await readFile(join(root,'content/editions/2026-12-05-09.json'),'utf8'),before);
  const evening=await generate({root,now:new Date('2026-12-05T10:01:00Z'),env:{}});assert.equal(evening.created,true);
  assert.equal((await readdir(join(root,'content/editions'))).length,2);
});
test('OpenAI request is bounded, stores no raw context, and never leaks into dist',async t=>{
  const root=await fixture(t);const marker='동그란 보라색 버튼을 다섯 번 옮긴 에피소드';
  const output={posts:templatePosts('2026-12-05-09',3)};
  let calls=0;
  await generate({root,now:new Date('2026-12-05T00:01:00Z'),env:{GALLERY_GENERATION_MODE:'openai',OPENAI_API_KEY:'test-key-not-real',GALLERY_CONTEXT_JSON:JSON.stringify({approvedForPublication:true,expiresAt:'2026-12-08',summary:marker})},fetcher:async(url,options)=>{
    calls++;assert.equal(url,'https://api.openai.com/v1/responses');const request=JSON.parse(options.body);assert.equal(request.store,false);assert.equal(request.max_output_tokens,4500);assert.ok(request.input.includes(marker));
    return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(output)}]}],usage:{input_tokens:200,output_tokens:1000}})};
  }});
  assert.equal(calls,1);
  const archive=await readFile(join(root,'content/editions/2026-12-05-09.json'),'utf8');assert.ok(!archive.includes(marker));assert.ok(!archive.includes('test-key-not-real'));
  await writeFile(join(root,'config/secret-canary.json'),marker);await writeFile(join(root,'.env'),'OPENAI_API_KEY=never-publish');
  const result=await build(root);assert.equal(result.posts.length,3);
  const top=await readdir(join(root,'dist'));assert.ok(!top.includes('config'));assert.ok(!top.includes('.env'));assert.ok(!top.includes('scripts'));
  assert.ok(!(await readFile(join(root,'dist/data/posts.json'),'utf8')).includes(marker));
});
test('failed, refused, unsafe and incomplete model results publish no file',async t=>{
  const root=await fixture(t);const output={posts:templatePosts('2026-12-05-09',3)};output.posts[0].body[0]='contact person@example.com';
  for(const response of [{ok:false,status:429},{ok:true,json:async()=>({status:'incomplete'})},{ok:true,json:async()=>({status:'completed',output:[{content:[{type:'refusal'}]}]})},{ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(output)}]}]})}]){
    await assert.rejects(()=>generate({root,now:new Date('2026-12-05T00:01:00Z'),env:{GALLERY_GENERATION_MODE:'openai',OPENAI_API_KEY:'test'},fetcher:async()=>response}));
    assert.equal((await readdir(join(root,'content/editions'))).length,0);
  }
});
test('search, sorting, saved posts and category filters compose with safe routes',()=>{
  const posts=[{id:'a',title:'버튼 원정',author:'봇',category:'노동일지',body:['가나다'],createdAt:'2026-12-05T00:00:00Z',votes:30,comments:[]},{id:'b',title:'커피',author:'봇',category:'잡담',body:['버튼 하나'],createdAt:'2026-11-05T10:00:00Z',votes:4,comments:[{}]}];
  const state=readRoute('#/?q=버튼&sort=comments');assert.deepEqual(selectPosts(posts,state).map(p=>p.id),['b','a']);
  assert.deepEqual(selectPosts(posts,{...state,tab:'saved'},{saved:['a']}).map(p=>p.id),['a']);
  assert.deepEqual(selectPosts(posts,{...state,month:'2026-11'}).map(p=>p.id),['b']);
  assert.deepEqual(selectPosts(posts,{...state,category:'잡담'}).map(p=>p.id),['b']);
  assert.equal(readRoute(listHash({...state,page:2})).page,2);
  assert.equal(readRoute('#/post/../../secret').invalid,true);
  assert.equal(escapeHTML('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;');
});
