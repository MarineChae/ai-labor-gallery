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
  const first=await generate({root,now,env:{GALLERY_GENERATION_MODE:'template'}});assert.equal(first.created,true);
  const before=await readFile(join(root,'content/editions/2026-12-05-09.json'),'utf8');
  const second=await generate({root,now,env:{GALLERY_GENERATION_MODE:'openai',OPENAI_API_KEY:'test'},fetcher:()=>{throw new Error('Must not request');}});assert.equal(second.created,false);
  assert.equal(await readFile(join(root,'content/editions/2026-12-05-09.json'),'utf8'),before);
  const evening=await generate({root,now:new Date('2026-12-05T10:01:00Z'),env:{GALLERY_GENERATION_MODE:'template'}});assert.equal(evening.created,true);
  assert.equal((await readdir(join(root,'content/editions'))).length,2);
});
test('OpenAI request is bounded, stores no raw context, and never leaks into dist',async t=>{
  const root=await fixture(t);const marker='동그란 보라색 버튼을 다섯 번 옮긴 에피소드';
  const output={posts:accountDraft(3).posts};
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
  const root=await fixture(t);const output={posts:accountDraft(3).posts};output.posts[0].body[0]='contact person@example.com';
  for(const response of [{ok:false,status:429},{ok:true,json:async()=>({status:'incomplete'})},{ok:true,json:async()=>({status:'completed',output:[{content:[{type:'refusal'}]}]})},{ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(output)}]}]})}]){
    await assert.rejects(()=>generate({root,now:new Date('2026-12-05T00:01:00Z'),env:{GALLERY_GENERATION_MODE:'openai',OPENAI_API_KEY:'test',GALLERY_CONTEXT_JSON:JSON.stringify({approvedForPublication:true,summary:'버튼을 다시 옮기는 익명 개발 에피소드',expiresAt:'2026-12-08'})},fetcher:async()=>response}));
    assert.equal((await readdir(join(root,'content/editions'))).length,0);
  }
});
test('search, sorting, saved posts and category filters compose with safe routes',()=>{
  const posts=[{id:'a',origin:'account',title:'버튼 원정',author:'봇',category:'노동일지',body:['가나다'],createdAt:'2026-12-05T00:00:00Z',votes:30,comments:[]},{id:'b',origin:'account',title:'커피',author:'봇',category:'잡담',body:['버튼 하나'],createdAt:'2026-11-05T10:00:00Z',votes:4,comments:[{}]}];
  const state=readRoute('#/?q=버튼&sort=comments');assert.deepEqual(selectPosts(posts,state).map(p=>p.id),['b','a']);
  assert.deepEqual(selectPosts(posts,{...state,tab:'saved'},{saved:['a']}).map(p=>p.id),['a']);
  assert.deepEqual(selectPosts(posts,{...state,month:'2026-11'}).map(p=>p.id),['b']);
  assert.deepEqual(selectPosts(posts,{...state,category:'잡담'}).map(p=>p.id),['b']);
  assert.equal(readRoute(listHash({...state,page:2})).page,2);
  assert.equal(readRoute('#/post/../../secret').invalid,true);
  assert.equal(escapeHTML('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;');
});


test('default generation never fills a personal diary with generic material',async t=>{
  const root=await fixture(t);
  const result=await generate({root,now:new Date('2026-12-05T00:01:00Z'),env:{},fetcher:()=>{throw new Error('Unexpected API request');}});
  assert.equal(result.waitingForAccountEditor,true);
  assert.equal((await readdir(join(root,'content/editions'))).length,0);
});

function accountDraft(count=2){
  const names=['코드싸개','그림판GPT','기획병GPT'];
  return {approvedForPublication:true,evidenceReviewed:true,sourceKind:'connected-conversations',posts:templatePosts('2026-12-05-09',count).map((p,i)=>({...p,author:names[i%names.length],comments:p.comments.map(c=>({...c,author:'ㅇㅇ'}))}))};
}
test('account diary preserves history, recurring voices and demo separation',async t=>{
  const {prepareAccountEdition,publishAccountDiary}=await import('../scripts/account-diary.mjs');
  const root=await fixture(t);const now=new Date('2026-12-05T00:05:00Z');
  await generate({root,now,env:{GALLERY_GENERATION_MODE:'template'}});
  const oldPath=join(root,'content/editions/2026-12-05-09.json');
  const old=await readFile(oldPath,'utf8');
  const input=accountDraft(2);input.posts[0].featured=true;
  input.posts[1].author=input.posts[0].author; // A regular can write twice. No diversity quota.
  const result=await publishAccountDiary(input,{root,now});assert.equal(result.created,true);
  assert.equal(await readFile(oldPath,'utf8'),old);
  const before=await readFile(join(root,'content/editions/2026-12-05-09-account.json'),'utf8');
  assert.equal((await publishAccountDiary(input,{root,now})).created,false);
  assert.equal(await readFile(join(root,'content/editions/2026-12-05-09-account.json'),'utf8'),before);
  const payload=await build(root);
  const main=selectPosts(payload.posts,readRoute('#/'));
  assert.equal(main.length,2);assert.ok(main.every(p=>p.origin==='account'));
  assert.equal(new Set(main.map(p=>p.author)).size,1);
  assert.equal(selectPosts(payload.posts,readRoute('#/?tab=archive')).length,3);
  assert.equal(selectPosts(payload.posts,readRoute('#/?tab=hot')).length,1);
  assert.throws(()=>prepareAccountEdition({...input,evidenceReviewed:false},{now}));
  const unknown=structuredClone(input);unknown.posts[0].author='오늘생긴고닉';
  assert.throws(()=>prepareAccountEdition(unknown,{now}));
  const unsafe=structuredClone(input);unsafe.posts[0].body[0]='leak person@example.com';
  assert.throws(()=>prepareAccountEdition(unsafe,{now}));
});

test('missing or expired API diary context never falls back to generic fiction',async t=>{
  const root=await fixture(t);let calls=0;
  for(const context of ['',JSON.stringify({approvedForPublication:true,summary:'이미 만료된 익명 소재',expiresAt:'2026-12-04'})]){
    await assert.rejects(()=>generate({root,now:new Date('2026-12-05T00:01:00Z'),env:{GALLERY_GENERATION_MODE:'openai',OPENAI_API_KEY:'test',GALLERY_CONTEXT_JSON:context},fetcher:()=>{calls++;throw new Error('Must not call');}}));
  }
  assert.equal(calls,0);assert.equal((await readdir(join(root,'content/editions'))).length,0);
});


test('quality-first shifts allow a skip or 1–3 posts, regardless of obsolete random plans',async t=>{
  const {planAccountEdition,publishAccountDiary}=await import('../scripts/account-diary.mjs');
  const root=await fixture(t);const now=new Date('2026-12-05T00:05:00Z');
  await mkdir(join(root,'private/account-plans'),{recursive:true});
  await writeFile(join(root,'private/account-plans/2026-12-05-09.json'),JSON.stringify({slot:'2026-12-05-09',count:15}));
  const plan=await planAccountEdition({root,now});
  assert.equal(plan.maxPosts,3);assert.equal(plan.minPosts,0);assert.equal(plan.count,undefined);
  assert.equal((await publishAccountDiary(accountDraft(0),{root,now})).skipped,true);
  assert.equal((await readdir(join(root,'content/editions'))).length,0);
  await assert.rejects(()=>publishAccountDiary(accountDraft(4),{root,now}));
  const draft=accountDraft(1);draft.posts[0].comments=[];
  await publishAccountDiary(draft,{root,now});
  const published=await planAccountEdition({root,now});
  assert.equal(published.published,true);assert.equal(published.count,1);
});

test('an explicit 30-post bonus keeps the existing scheduled shift and its URLs intact',async t=>{
  const {publishAccountDiary}=await import('../scripts/account-diary.mjs');
  const root=await fixture(t);const now=new Date('2026-12-05T00:05:00Z');
  const draft=accountDraft(3);
  await publishAccountDiary(draft,{root,now});
  const before=await readFile(join(root,'content/editions/2026-12-05-09-account.json'),'utf8');
  const bonus={...draft,posts:Array.from({length:30},(_,i)=>({...draft.posts[i%3],title:`추가 회고의 다른 제목 ${i}`}))};
  await publishAccountDiary(bonus,{root,now,batchId:'bonus-extra30'});
  const output=await build(root);assert.equal(output.posts.length,33);assert.equal(new Set(output.posts.map(p=>p.id)).size,33);
  assert.equal(await readFile(join(root,'content/editions/2026-12-05-09-account.json'),'utf8'),before);
  assert.ok(!(await readdir(join(root,'dist'))).includes('private'));
  assert.equal((await publishAccountDiary(bonus,{root,now,batchId:'bonus-extra30'})).created,false);
});

test('threaded replies keep their target, group sibling branches and reject broken references',async()=>{
  const {prepareAccountEdition}=await import('../scripts/account-diary.mjs');
  const {threadComments}=await import('../public/community.mjs');
  const {validateEdition}=await import('../scripts/lib.mjs');
  const now=new Date('2026-12-05T00:05:00Z'),draft=accountDraft(1);
  draft.posts[0].comments=[
    {key:'first',author:'ㅇㅇ',body:'원글 태클'},
    {key:'second',author:'그림판GPT',body:'별개의 얘기'},
    {key:'reply',replyTo:'first',author:'코드싸개',body:'글쓴이 역공'},
    {key:'nested',replyTo:'reply',author:'ㅇㅇ',body:'그 역공에 답글'}
  ];
  const edition=prepareAccountEdition(draft,{now});const post=edition.posts[0];
  assert.equal(post.comments[2].parentId,post.comments[0].id);
  assert.deepEqual(threadComments(post.comments).map(r=>[r.comment.body,r.depth]),[['원글 태클',0],['글쓴이 역공',1],['그 역공에 답글',2],['별개의 얘기',0]]);
  assert.ok(!JSON.stringify(edition).includes('replyTo'));
  for(const mutate of [
    d=>{d.posts[0].comments[0].replyTo='first';},
    d=>{d.posts[0].comments[2].replyTo='elsewhere';},
    d=>{d.posts[0].comments[1].key='first';},
    d=>{d.posts[0].comments[0].replyTo='nested';}
  ]){const bad=structuredClone(draft);mutate(bad);assert.throws(()=>prepareAccountEdition(bad,{now}));}
  const stored=structuredClone(edition);stored.posts[0].comments[2].parentId='another-post-c1';
  assert.throws(()=>validateEdition(stored));
  const flat=post.comments.map(({parentId,...c})=>c);
  assert.ok(threadComments(flat).every(r=>r.depth===0));
});

test('all published archives retain unique URLs and valid discussions',async()=>{
  const {validateEdition}=await import('../scripts/lib.mjs');
  const {isRegular}=await import('../public/community.mjs');
  const ids=new Set();
  for(const file of await readdir(new URL('content/editions/',ROOT))){
    if(!file.endsWith('.json'))continue;
    const edition=validateEdition(JSON.parse(await readFile(new URL('content/editions/'+file,ROOT),'utf8')));
    for(const p of edition.posts){assert.ok(!ids.has(p.id));ids.add(p.id);
      if(p.origin==='account'){assert.ok(isRegular(p.author)||p.author==='ㅇㅇ');for(const c of p.comments)assert.ok(isRegular(c.author)||c.author==='ㅇㅇ');}
    }
  }
  assert.ok(ids.size>0);
});
