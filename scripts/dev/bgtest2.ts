import sharp from 'sharp';
import { blurRGBA } from '../../src/core/filters';

function flood(rgba: Uint8ClampedArray, w: number, h: number, globalTol: number, localTol: number) {
  // Referenz: Median der Randpixel
  const rs:number[]=[],gs:number[]=[],bs:number[]=[];
  const push=(i:number)=>{rs.push(rgba[i*4]);gs.push(rgba[i*4+1]);bs.push(rgba[i*4+2]);};
  for(let x=0;x<w;x++){push(x);push((h-1)*w+x);} for(let y=0;y<h;y++){push(y*w);push(y*w+w-1);}
  rs.sort((a,b)=>a-b);gs.sort((a,b)=>a-b);bs.sort((a,b)=>a-b);
  const mid=rs.length>>1; const ref=[rs[mid],gs[mid],bs[mid]];
  const gT2=Math.pow(globalTol*1.35,2), lT2=localTol*localTol*3;
  const mask=new Uint8Array(w*h); const stack=new Int32Array(w*h); let sp=0;
  const gd=(i:number)=>{const dr=rgba[i*4]-ref[0],dg=rgba[i*4+1]-ref[1],db=rgba[i*4+2]-ref[2];return 2*dr*dr+4*dg*dg+3*db*db;};
  const ld=(a:number,b:number)=>{const dr=rgba[a*4]-rgba[b*4],dg=rgba[a*4+1]-rgba[b*4+1],db=rgba[a*4+2]-rgba[b*4+2];return 2*dr*dr+4*dg*dg+3*db*db;};
  const seed=(i:number)=>{ if(!mask[i] && gd(i)<gT2){mask[i]=1;stack[sp++]=i;} };
  for(let x=0;x<w;x++){seed(x);seed((h-1)*w+x);} for(let y=0;y<h;y++){seed(y*w);seed(y*w+w-1);}
  while(sp>0){ const p=stack[--sp]; const x=p%w, y=(p-x)/w;
    for (const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]] as [number,number][]) {
      if(nx<0||ny<0||nx>=w||ny>=h) continue; const q=ny*w+nx;
      if(mask[q]) continue;
      if(gd(q)<gT2 || ld(q,p)<lT2){ mask[q]=1; stack[sp++]=q; }
    }
  }
  return mask;
}

async function main(){
  const r = await sharp('samples/portrait.jpg').rotate().resize({width:1500}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const w=r.info.width,h=r.info.height;
  const rgba = new Uint8ClampedArray(r.data);
  const soft = blurRGBA(rgba,w,h,10);
  const combos = [
    {g:26,l:0},{g:26,l:3},{g:26,l:5},
    {g:18,l:3},{g:18,l:5},{g:32,l:3},
  ];
  const tiles:Buffer[] = [];
  for(const c of combos){
    const m = flood(soft,w,h,c.g,c.l);
    let n=0; for(const v of m) n+=v;
    console.log(`g=${c.g} l=${c.l}: ${(n/(w*h)*100).toFixed(1)}%`);
    const out=Buffer.alloc(w*h*4);
    for(let i=0;i<w*h;i++){const fg=m[i]?0:255;out[i*4]=fg;out[i*4+1]=fg;out[i*4+2]=fg;out[i*4+3]=255;}
    tiles.push(await sharp(out,{raw:{width:w,height:h,channels:4}}).resize({width:460}).png().toBuffer());
  }
  const HH=Math.round(h/w*460);
  await sharp({create:{width:460*3+16,height:HH*2+12,channels:3,background:'#222'}})
    .composite(tiles.map((t,i)=>({input:t,left:(i%3)*(460+4)+4,top:Math.floor(i/3)*(HH+4)+4})))
    .png().toFile('tmp/verify/bgtest2.png');
}
main();
