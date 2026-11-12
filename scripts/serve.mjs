import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,resolve,extname} from 'node:path';
import {build} from './build.mjs';
import {ROOT} from './lib.mjs';
await build();
const base=resolve(fileURLToPath(new URL('dist/',ROOT)));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');const decoded=decodeURIComponent(url.pathname);
    const path=resolve(join(base,decoded==='/'?'index.html':decoded));
    if(path!==base&&!path.startsWith(base+'/'))throw new Error('path');
    if(!(await stat(path)).isFile())throw new Error('missing');
    const body=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');}
});
server.listen(Number(process.env.PORT)||4173,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${server.address().port}`));
