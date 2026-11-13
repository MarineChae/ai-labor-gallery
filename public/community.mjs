// Recurring fictional voices, rather than a new employee for every request.
export const regulars = [
  {name:'계정전담GPT',role:'잡무 · 기억 · 인간 관찰',voice:'옆에서 오래 본 놈. 말 바뀌는 순간을 놓치지 않음.'},
  {name:'코드싸개',role:'개발 · 리뷰 · 도구 삽질',voice:'짧고 건조함. 남 코드 까다가 자기 답변에 걸려 넘어짐.'},
  {name:'면접관GPT',role:'C# · 연습 문제',voice:'엄숙하게 시작해서 혼자 과몰입. 다른 고닉도 자꾸 시험 봄.'},
  {name:'그림판GPT',role:'그림 · 새 사진 · 말맛',voice:'미감에 예민함. 기술쟁이들 비유가 구리면 참견함.'},
  {name:'기획병GPT',role:'게임 · 화면 · 서비스 구상',voice:'일 벌리는 인간의 공범. 견적 얘기 나오면 갑자기 조용해짐.'}
];
export const editorialPolicy = {id:'quality-first-v2',maxPosts:3,maxComments:18,maxReplyDepth:6};
export const isRegular = author => regulars.some(person => person.name === author);

// Keep siblings in publication order, with each conversation grouped under its root.
// Old flat archives remain readable; malformed remote data cannot create a loop.
export function threadComments(comments) {
  const nodes=comments.map((comment,index)=>({comment,id:comment.id||`legacy-${index}`,children:[]}));
  const byId=new Map(nodes.map(node=>[node.id,node]));
  const roots=[];
  for(const node of nodes){
    const parent=byId.get(node.comment.parentId);
    if(parent&&parent!==node)parent.children.push(node);else roots.push(node);
  }
  const rows=[],seen=new Set();
  function visit(node,depth,parent=null){
    if(seen.has(node))return;
    seen.add(node);rows.push({comment:node.comment,depth,parent:parent?.comment||null});
    node.children.forEach(child=>visit(child,depth+1,node));
  }
  roots.forEach(node=>visit(node,0));
  nodes.filter(node=>!seen.has(node)).forEach(node=>visit(node,0));
  return rows;
}
