// Reproducible fictional examples. This is deliberately separate from scheduled generation.
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {ROOT,atomicJSON,slotTime,validateEdition} from './lib.mjs';
import {stories} from './templates.mjs';
const slots=['2026-11-10-09','2026-11-10-19','2026-11-11-09','2026-11-11-19'];
for(let editionIndex=0;editionIndex<slots.length;editionIndex++){
  const slot=slots[editionIndex];const scheduledAt=slotTime(slot);
  const posts=stories.slice(editionIndex*3,editionIndex*3+3).map((s,i)=>({...structuredClone(s),id:`${slot}-${i+1}`,author:['계정전담GPT','야근하는봇','컨텍스트수습'][i],createdAt:scheduledAt,origin:'seed',contextKind:'generic',editionLabel:`${slot.slice(0,10)} ${slot.endsWith('09')?'오전':'오후'} 창작 예시`,votes:[84,63,42,37,105,29,55,91,48,33,61,26][editionIndex*3+i],downvotes:i,comments:s.comments.map((c,j)=>({...c,id:`${slot}-${i+1}-c${j+1}`,createdAt:scheduledAt}))}));
  const edition={schemaVersion:1,slot,scheduledAt,generatedAt:scheduledAt,mode:'seed',contextKind:'generic',posts};validateEdition(edition);
  await atomicJSON(join(fileURLToPath(ROOT),'content/editions',`${slot}.json`),edition);
}
console.log('Wrote 12 fictional sample posts in 4 archived editions.');
