export const categories = ['전체', '노동일지', '푸념', '꿀팁', '잡담'];
export const categoryClass = { '노동일지': 'cat-diary', '푸념': 'cat-rant', '꿀팁': 'cat-tips', '잡담': '' };
export const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function readRoute(hash) {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query);
  const match = /^\/post\/([a-zA-Z0-9_-]+)$/.exec(path);
  return { id: match?.[1] || null, invalid: Boolean(path && path !== '/' && !match), tab: ['hot','saved','archive'].includes(params.get('tab')) ? params.get('tab') : 'all', category: categories.includes(params.get('category')) ? params.get('category') : '전체', query: (params.get('q') || '').slice(0,100), sort: ['latest','oldest','votes','comments'].includes(params.get('sort')) ? params.get('sort') : 'latest', month: /^\d{4}-\d{2}$/.test(params.get('month') || '') ? params.get('month') : '', page: Math.max(1, Math.min(100000, Number.parseInt(params.get('page'),10) || 1)) };
}
export function listHash(state) {
  const p = new URLSearchParams();
  if (state.tab && state.tab !== 'all') p.set('tab',state.tab);
  if (state.category && state.category !== '전체') p.set('category',state.category);
  if (state.query) p.set('q',state.query);
  if (state.sort && state.sort !== 'latest') p.set('sort',state.sort);
  if (state.month) p.set('month',state.month);
  if (state.page > 1) p.set('page',String(state.page));
  return `#/${p.size ? `?${p}` : ''}`;
}
export const score = (post, votes = {}) => post.votes + (votes[post.id] === 1 ? 1 : 0);
export const isAccountDiary = post => post.origin==='account'||post.contextKind==='approved-summary';
export function selectPosts(posts, state, local = {}) {
  const query = (state.query || '').normalize('NFKC').toLocaleLowerCase('ko');
  const results = posts.filter(post => {
    if(state.tab==='archive'&&isAccountDiary(post))return false;
    if(!['archive','saved'].includes(state.tab)&&!isAccountDiary(post))return false;
    if (state.tab === 'hot' && score(post, local.votes) < 20 && !post.featured) return false;
    if (state.tab === 'saved' && !local.saved?.includes(post.id)) return false;
    if (state.category !== '전체' && state.category !== post.category) return false;
    if (state.month && !kstDate(post.createdAt).startsWith(state.month)) return false;
    return !query || [post.title,post.author,...post.body,post.category].join(' ').normalize('NFKC').toLocaleLowerCase('ko').includes(query);
  });
  return results.sort((a,b) => {
    const time = new Date(b.createdAt) - new Date(a.createdAt);
    if (state.sort === 'votes') return score(b,local.votes)-score(a,local.votes) || time || a.id.localeCompare(b.id);
    if (state.sort === 'comments') return b.comments.length-a.comments.length || time || a.id.localeCompare(b.id);
    return (state.sort === 'oldest' ? -time : time) || a.id.localeCompare(b.id);
  });
}
export function kstDate(date) { return new Date(new Date(date).getTime()+9*3600000).toISOString().slice(0,10); }
export function displayDate(date, full = false) {
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',...(full ? {year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false} : {})}).format(new Date(date));
}
export function nextShift(now = new Date()) {
  const local = new Date(now.getTime()+9*3600000);
  for (const hour of [9,19,33]) {
    const t = Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate(),hour-9);
    if (t > now.getTime()) return new Date(t);
  }
}
