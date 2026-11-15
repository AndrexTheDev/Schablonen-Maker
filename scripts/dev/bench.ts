import { distanceTransform, dilateRect, dilateDisc, thickenThin } from '../../src/core/morphology';
import { labelComponents, mergeSmallRegions } from '../../src/core/components';
import { traceContours } from '../../src/core/trace';
import { bilateral, gradeTone, boxBlur } from '../../src/core/filters';
import { refineLabels } from '../../src/core/quantize';

const w=1558,h=1056,n=w*h;
const mask = new Uint8Array(n);
for (let i=0;i<n;i++) mask[i] = (Math.sin(i*0.013)+Math.sin((i%w)*0.05))>0.2?1:0;
const f = new Float32Array(n);
for (let i=0;i<n;i++) f[i]= (i*37)%255;

function t(name:string, fn:()=>unknown){ const a=Date.now(); fn(); console.log(`${name}: ${Date.now()-a} ms`); }
t('distanceTransform', ()=>distanceTransform(mask,w,h,1));
t('dilateRect r5', ()=>dilateRect(mask,w,h,5));
t('dilateDisc r5', ()=>dilateDisc(mask,w,h,5));
t('thickenThin 7px', ()=>thickenThin(mask,w,h,7));
t('labelComponents', ()=>labelComponents(mask,w,h,8));
t('traceContours', ()=>traceContours(mask,w,h,{tolerance:0.65,smooth:1,minArea:1}));
t('bilateral full r4', ()=>bilateral(f,w,h,4,40));
t('gradeTone', ()=>gradeTone(f,{contrast:58,brightness:0,invert:false,autoLevels:true}));
t('boxBlur r7', ()=>boxBlur(f,w,h,7));
const labels = new Uint8Array(n); for (let i=0;i<n;i++) labels[i]=i%4;
t('refineLabels r2', ()=>refineLabels(labels,w,h,4,2));
t('mergeSmallRegions', ()=>mergeSmallRegions(labels,w,h,4,100));
