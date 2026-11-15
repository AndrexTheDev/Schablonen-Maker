import sharp from 'sharp';
async function raw(f:string){const {data,info}=await sharp(f).raw().toBuffer({resolveWithObject:true});return {d:data,info};}
(async()=>{
  for (const dir of ['tmp/verify/bg','tmp/verify']) {
    const comp = await raw(`${dir}/L3-composite.png`);
    const cw = comp.info.width;
    const px=(d:Buffer,ch:number,x:number,y:number)=>Array.from(d.subarray((y*cw+x)*ch,(y*cw+x)*ch+ch));
    console.log(dir, 'composite(120,120)=', px(comp.d,comp.info.channels,120,120));
    for (let i=1;i<=3;i++){
      const l = await raw(`${dir}/L3-layer${i}.png`);
      console.log('  layer'+i+'(120,120)=', px(l.d,l.info.channels,120,120));
    }
  }
})();
