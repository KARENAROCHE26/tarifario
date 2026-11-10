(function(root){
'use strict';
const norm=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/(\d)[,.](\d)/g,'$1.$2').replace(/[^a-z0-9.]+/g,' ').replace(/\b(de|del|mts|mt|metros|m|vertical|esc)\b/g,' ').replace(/\s+/g,' ').trim();
const isService=s=>/\b(?:servicios? (?:de )?(?:desmontaje|montaje)|fletes? (?:de )?(?:entrega|devolucion))\b/.test(norm(s));
const nums=s=>(norm(s).match(/\d+(?:\.\d+)?/g)||[]).map(Number);
function oneLetter(a,b){
 if(a===b)return true;if(Math.max(a.length,b.length)<4||Math.abs(a.length-b.length)>1)return false;
 let i=0,j=0,edits=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++edits>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}
 return edits+(a.length-i)+(b.length-j)<=1;
}
// Nombre de Capacidad + medida D: los números de modelo no son medidas.
const measureNums=s=>nums(String(s).replace(/\bh\s*20\b|\bf[0-3]\b/ig,' '));
const cleanName=s=>norm(s).replace(/\.(?!\d)/g,'').replace(/(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])/g,' ').replace(/\b(mts|mt|metros|metro|cms|cm|m)\b/g,' ').replace(/\s+/g,' ').trim();
function sameMeasure(input,expected){
 if(input.length!==expected.length)return false;
 return input.every((v,i)=>Math.abs(v-expected[i])<1e-8||(!String(v).includes('.')&&(String(expected[i]).includes('.')||(v>=100&&expected[i]<=10))&&Math.abs(v/100-expected[i])<1e-8));
}
function nameScore(input,name){
 const tokens=[...new Set(cleanName(input).split(' ').filter(x=>x.length>1&&!/^\d/.test(x)))],want=[...new Set(cleanName(name).split(' ').filter(x=>x.length>1&&!/^\d/.test(x)))];
 const used=new Set();let hits=0;for(const token of tokens){const i=want.findIndex((w,j)=>!used.has(j)&&oneLetter(token,w));if(i>=0){used.add(i);hits++;}}
 return {similarity:hits/Math.max(1,tokens.length+want.length-hits),coverage:hits/Math.max(1,want.length),extra:tokens.length-hits};
}
function match(text,catalog){
 if(isService(text))return {product:null,score:0,ambiguous:false,candidates:[]};
 const weight=norm(text).match(/(\d+(?:\.\d+)?)\s*(kg|kgs|lb|lbs|libras)\b/);
 const description=weight?norm(text).replace(weight[0],' '):text,tn=measureNums(description),ranked=[];
 const hasEscotilla=cleanName(description).split(' ').some(t=>oneLetter(t,'escotilla'));
 for(const p of catalog){
  const isEscotilla=[p.name,p.alternateName,...(p.aliases||[])].filter(Boolean).some(name=>cleanName(name).split(' ').includes('escotilla'));
  // La clave distintiva evita confundir la plataforma con otras sin escotilla.
  if(hasEscotilla&&!isEscotilla)continue;
  if(weight&&p.kg!=null){const kg=Number(weight[1])/(weight[2].startsWith('lb')||weight[2]==='libras'?2.2:1);if(Math.abs(kg-p.kg)>.02)continue;}
  const canonicalNumbers=measureNums(p.name),dn=p.referenceMeasure==null?canonicalNumbers:measureNums(p.referenceMeasure);
  // La medida D distingue variantes incluso si dos filas repiten Nombre.
  const missingMeasure=!tn.length&&dn.length>0;
  const escotillaMeasure=hasEscotilla&&tn.length===1&&dn.some(n=>sameMeasure(tn,[n]));
  const escotillaReversed=hasEscotilla&&tn.length===2&&sameMeasure([...tn].sort((a,b)=>a-b),[...dn].sort((a,b)=>a-b));
  if(tn.length&&!sameMeasure(tn,dn)&&!(canonicalNumbers.length>1&&sameMeasure(tn,canonicalNumbers))&&!escotillaMeasure&&!escotillaReversed)continue;
  const keywords=p.name.replace(/\b(?:andamio|multidireccional(?:es)?|equipo)\b/ig,' ');
  const substitutions=p.alternateName==='Paral/Puntal'?['Paral','Puntal'].map(base=>p.name.replace(/^(?:paral|puntal)/i,base)):[];
  const collarinKeyword=cleanName(p.name).split(' ').includes('collarin')?['collarin']:[];
  const names=[p.name,keywords,...(isEscotilla?['escotilla']:[]),...collarinKeyword,...substitutions,...(p.alternateName==='Paral/Puntal'?['Paral','Puntal']:[p.alternateName||'']),...(p.aliases||[])].filter(Boolean);
  let productScore=0;
  for(const name of names){const n=nameScore(description,name);if(n.coverage===1){
   const specificity=cleanName(name).split(' ').filter(t=>t.length>1&&!/^\d/.test(t)).length;
   const exact=n.similarity===1?1:.92+Math.min(.06,specificity*.015)-Math.min(.04,n.extra*.004);
   productScore=Math.max(productScore,exact);
  }}
  if(!tn.length&&norm(description).includes('madera')&&p.name==='Calzas')productScore=Math.max(productScore,.8);
  // El grupo del Excel distingue equipos homónimos de familias distintas.
  if(p.group&&nameScore(description,p.group).coverage===1)productScore+=.03;
  // Si D contiene un error compartido por dos filas, el nombre completo y sus
  // medidas explícitas resuelven la variante; un alias genérico conserva dudas.
  if(tn.length&&sameMeasure(tn,canonicalNumbers)&&nameScore(description,p.name).coverage===1)productScore+=.04;
  if(productScore>=.72)ranked.push({product:p,score:missingMeasure?Math.min(.85,productScore):productScore,missingMeasure});
 }
 ranked.sort((a,b)=>b.score-a.score);
 const first=ranked[0],score=first?.score||0,candidates=ranked.filter(r=>score-r.score<.015).map(r=>r.product);
 // Solo una ficha con escotilla: el alias basta, aunque no se escriban medidas.
 // Si aparecen varias medidas/variantes en el futuro, se conserva la elección.
 if(hasEscotilla&&ranked.length===1)return {product:first.product,score,ambiguous:false,candidates:[first.product],keyword:'Escotilla'};
 // Collarín es una clave explícita del usuario. Las filas homónimas no bloquean
 // su asignación: preferir la ficha completa, sin mezclar familias o medidas.
 if(candidates.length>1&&!first.missingMeasure&&cleanName(description).split(' ').some(t=>oneLetter(t,'collarin'))&&
  candidates.every(p=>cleanName(p.name)===cleanName(candidates[0].name)&&norm(p.group||'')===norm(candidates[0].group||'')&&String(p.referenceMeasure??'')===String(candidates[0].referenceMeasure??''))){
  const completeness=p=>Number(p.kg>0)+Number(p.dims?.length===3&&p.dims.every(v=>v>0))+Number(p.rack>0);
  const ordered=[...candidates].sort((a,b)=>completeness(b)-completeness(a)||String(a.id).localeCompare(String(b.id),'en',{numeric:true}));
  return {product:ordered[0],score,ambiguous:false,candidates:[ordered[0]],defaultVariant:true};
 }
 // Huella Esc. identifica la única huella del catálogo aunque falte su medida.
 // Con medidas incompatibles o nuevas variantes se conserva la revisión.
 if(!tn.length&&ranked.length===1&&score>=.82&&cleanName(description).split(' ').some(t=>oneLetter(t,'huella'))&&norm(first.product.name).startsWith('huella '))return {product:first.product,score,ambiguous:false,candidates:[first.product],keyword:'Huella'};
 const ambiguous=candidates.length>1||!!first?.missingMeasure;
 return {product:first&&!ambiguous?first.product:null,score,ambiguous,candidates};
}
function parse(text,catalog){const lines=text.split(/\r?\n/),out=[],skipped=[],ignored=[];
 for(const raw of lines){if(isService(raw)){ignored.push(raw);continue;}let line=raw.replace(/\|/g,' ').replace(/\b(?:ASUB|AND)\s*\d+\b/ig,' ').trim();if(!line)continue;
 const missingQuantity=line.match(/^\?\s+(.+)/);
 let m=line.match(/^\s*([\d]+(?:[,\s]\d{3})*)\s+(.+)/),qty,desc;
 if(missingQuantity){qty=null;desc=missingQuantity[1];}
 else if(m){qty=Number(m[1].replace(/[,\s]/g,''));desc=m[2];}else{m=line.match(/^(.+?)\s+(\d+(?:,\d{3})*)\s*$/);if(m){desc=m[1];qty=Number(m[2].replace(/,/g,''));}}
 if((!qty&&!missingQuantity)||!desc||!/[a-zA-Z]/.test(desc)){if(/multidirecc|clamp|viga|formaleta|rodapie|baranda|alambre|calza|bracket/i.test(line)||match(line,catalog).product)skipped.push(raw);continue;}
 if(qty>1000000){skipped.push(raw);continue;}const found=match(desc,catalog);
 out.push({qty,description:desc,productId:found.product?.id||'',candidateIds:found.ambiguous?found.candidates.map(p=>p.id):[],detectedName:found.candidates[0]?.name||'',matchNote:found.keyword?'Identificado por palabra clave: '+found.keyword:found.defaultVariant?'Identificado por collarín: ficha con datos más completos del Excel':found.ambiguous?'Equipo reconocido por palabras clave: selecciona la variante o medida del catálogo':found.product?'Identificado por nombre, alias y medida del Excel':'Sin coincidencia en el catálogo'});
 }return {rows:out,skipped,ignored};
}
const permutations=d=>[[d[0],d[1],d[2]],[d[0],d[2],d[1]],[d[1],d[0],d[2]],[d[1],d[2],d[0]],[d[2],d[0],d[1]],[d[2],d[1],d[0]]];
const rowKey=r=>JSON.stringify([r.productId||norm(r.name),r.mode,r.kg,r.dims,r.rack,r.technical||null]);
function groupRows(rows){
 const groups=[],byKey=new Map();
 for(const r of rows){
  if(!Number.isSafeInteger(r.qty)||r.qty<=0){groups.push({...r,rowKey:rowKey(r),sourceCount:1});continue;}
  const key=rowKey(r),found=byKey.get(key);
  if(found){found.qty+=r.qty;found.sourceCount++;}
  else{const group={...r,rowKey:key,sourceCount:1};groups.push(group);byKey.set(key,group);}
 }return groups;
}
function basketCapacity(d,h){return Math.floor((1+1e-9)/d[0])*Math.floor((1+1e-9)/d[1])*Math.floor((h+1e-9)/d[2]);}
const isCollar=r=>/\bcol+arin\b/.test(norm(r.name));
// La columna O es el valor por defecto; una elección explícita del usuario
// cambia solo la carga de esa partida, sin editar el catálogo.
const loadMode=(r,settings={})=>settings.mode==='bulk'?'bulk':settings.mode==='rack'?'rack':r.modeOverride==='bulk'?'bulk':r.modeOverride==='rack'?'rack':Number.isSafeInteger(r.rack)&&r.rack>0?'rack':'bulk';
function loadState(r,product,settings={}){
 if(!product)return {status:'unknown',label:'Sin identificar',defaultLabel:'Pendiente',hint:'Selecciona el equipo del catálogo'};
 const expected=Number.isSafeInteger(product.rack)&&product.rack>0?'rack':'bulk';
 const actual=loadMode({...r,rack:product.rack},settings);
 const label=actual==='rack'?'Rack / canasta':'A granel',defaultLabel=expected==='rack'?'Rack / canasta':'A granel';
 return {status:actual===expected?'match':'changed',label,defaultLabel,hint:actual===expected?(expected==='rack'?`Excel · ${product.rack} piezas por contenedor`:'Excel · carga a granel'):`Cambio manual · Excel: ${defaultLabel}`};
}
function rebaseRows(rows,previousCatalog,nextCatalog){
 const previous=new Map(previousCatalog.map(p=>[p.id,p])),next=new Map(nextCatalog.map(p=>[p.id,p]));
 return rows.map(r=>{
  const p=next.get(r.productId),old=previous.get(r.productId);
  if(!p)return {...r};
  return {...r,name:p.name,rack:p.rack??null,mode:p.rack?'rack':'bulk',
   kg:old&&r.kg===old.kg?p.kg:r.kg,
   dims:old&&JSON.stringify(r.dims)===JSON.stringify(old.dims)?(p.dims?[...p.dims]:null):r.dims,
   referenceMeasure:p.referenceMeasure??null,technical:p.technical||null,bulkByTruck:p.bulkByTruck||null};
 });
}
function prepareBase(rows,settings){let equipmentKg=0,tareKg=0,pieces=0,racks=0,baskets=0;const pending=[],excluded=[],notes=new Set(),units=[];
 const selected=Object.values(settings.trucks),maxCap=Math.min(...selected.map(t=>t.cap)),maxWidth=Math.min(...selected.map(t=>t.width)),packHeight=Math.min(settings.height,...selected.map(t=>t.height??settings.height));
 for(const r of rows){if(isService(r.name)||isService(r.description)){excluded.push({name:r.name,reason:'Partida de servicio'});continue;}if(settings.catalogIds&&!settings.catalogIds.includes(r.productId)){excluded.push({name:r.name,reason:'Sin identificar en la base Calculadora Peso.xlsm'});continue;}if(!Number.isSafeInteger(r.qty)||r.qty<=0){pending.push(`${r.name}: cantidad inválida`);continue;}pieces+=r.qty;
 const kg=Number(r.kg);if(r.kg===null||r.kg===''||!Number.isFinite(kg)||kg<=0){pending.push(`${r.name}: falta peso unitario válido`);continue;}equipmentKg+=kg*r.qty;
 const d=r.dims;if(!d||d.length!==3||d.some(x=>!Number.isFinite(x)||x<=0)){pending.push(`${r.name}: faltan dimensiones`);continue;}
 const unitStart=units.length;
 let mode=loadMode(r,settings);
 if(/^bidon(?:es)?$/.test(norm(r.name))){
  // Un bidón es un contenedor físico, tanto en modo granel como en racks.
  for(let q=0;q<r.qty;q++)units.push({name:r.name,qty:1,kind:'Bidón',kg,dims:[...d],stackable:settings.stack});
 }else if(mode==='rack'){
  if(!Number.isSafeInteger(r.rack)||r.rack<=0){pending.push(`${r.name}: faltan piezas por rack`);continue;}
  for(let q=r.qty;q>0;q-=r.rack){const count=Math.min(q,r.rack);racks++;tareKg+=settings.rackKg;units.push({name:r.name,qty:count,kind:'Rack',kg:count*kg+settings.rackKg,dims:[Math.max(1.12,...d),1.12,.9],stackable:settings.stack});}
 }else if(/viga de madera h20/i.test(r.name)&&maxWidth>=.4&&packHeight>=.08){
  // Patrón del usuario: 11, 10, 11...; sección Pfeifer de 80 mm y alma de 27 mm.
  const columns=Math.min(settings.h20Columns||11,Math.floor((maxWidth+1e-8)/.2)),firstHeight=d[2],rowStep=(d[2]+(r.technical?.webThickness||.027))/2,maxRows=Math.floor((packHeight-firstHeight+1e-9)/rowStep)+1;
  const physical=Math.floor(maxRows/2)*(columns*2-1)+(maxRows%2?columns:0),weightLimit=Math.floor((maxCap+1e-9)/kg),cap=Math.min(physical,weightLimit);
  if(cap<1){pending.push(`${r.name}: no cabe con la altura y peso elegidos`);continue;}
  for(let q=r.qty;q>0;q-=cap){const count=Math.min(q,cap);let placed=0,n=0;while(placed<count){placed+=n%2===0?columns:columns-1;n++;}units.push({name:r.name,qty:count,kind:'Granel',kg:count*kg,dims:[Math.max(...d),Math.min(columns,count)*.2,firstHeight+(n-1)*rowStep],stackable:false});}
  notes.add(`Vigas H20 sin capacidad a granel para la unidad: pilas con filas alternadas de ${columns}/${columns-1}, según el espacio disponible; sección Pfeifer de 20 × 8 cm y alma de 2.7 cm. Sin soportes ni holguras.`);
 }else{
  const [l,w,h]=[...d].sort((a,b)=>b-a);
  // Paquetes homogéneos rectangulares. Sin descuento por traslape o material hueco.
  const wide=Math.max(1,Math.floor(Math.min(1.12,maxWidth)/w)),layers=Math.max(1,Math.floor(Math.min(.5,packHeight)/h));
  const countMax=Math.max(1,Math.min(wide*layers,Math.floor(maxCap*.75/kg)));
  for(let q=r.qty;q>0;q-=countMax){const count=Math.min(q,countMax),nw=Math.min(wide,count),nh=Math.ceil(count/nw);units.push({name:r.name,qty:count,kind:'Granel',kg:count*kg,dims:[l,nw*w,nh*h],stackable:true});}
 }
 if(r.geometry&&/estimad|interpretada|confirmar/.test(r.geometry))notes.add(r.geometry);
 for(let i=unitStart;i<units.length;i++){units[i].productId=r.productId;units[i].rowKey=r.rowKey||rowKey(r);if(mode==='bulk'){units[i].bulkByTruck=r.bulkByTruck;units[i].pieceDims=[...d];}}
 }
 return {equipmentKg,tareKg,totalKg:equipmentKg+tareKg,pieces,racks,baskets,pending,excluded,notes:[...notes],units};
}
function rowIssues(r,settings={}){
 if(r.omit)return [];
 const issues=[];
 if(settings.catalogIds&&!settings.catalogIds.includes(r.productId))issues.push('Sin identificar en la base del Excel');
 if(!Number.isSafeInteger(r.qty)||r.qty<=0)issues.push('Cantidad pendiente');
 if(r.kg===null||r.kg===''||!Number.isFinite(Number(r.kg))||Number(r.kg)<=0)issues.push('Peso unitario pendiente');
 if(!r.dims||r.dims.length!==3||r.dims.some(x=>!Number.isFinite(x)||x<=0))issues.push('Dimensiones pendientes');
 if(loadMode(r,settings)==='rack'&&(!Number.isSafeInteger(r.rack)||r.rack<=0))issues.push('Piezas por rack pendientes');
 return issues;
}
const isPost=r=>/^poste multidireccional\b/.test(norm(r.name));
const isAnchoredConnector=r=>norm(r.name)==='conector multidireccional';
// Ocupación equivalente: cada pieza utiliza 1/capacidad de su ficha.
// La columna O reúne racks/canastas; el granel conserva su método.
function combinePartialRacks(result,rows,settings){
 const byKey=new Map(rows.map(r=>[r.rowKey,r])),full=[],sources=[],bins=[];
 const content=(u,r)=>({rowKey:u.rowKey,productId:r.productId,name:r.name,qty:u.qty,capacity:r.rack,kg:u.qty*Number(r.kg),dims:[...r.dims],bundleSize:isCollar(r)?10:1});
 const compatible=(b,c)=>b.contents.every(a=>!(a.productId===c.productId&&a.rowKey!==c.rowKey)&&[a,c].every(p=>[...p.dims].sort((x,y)=>y-x).slice(1).every(x=>x<=1+1e-8)));
 const envelope=c=>[Math.max(1.12,...c.dims,isCollar(c)?Math.min(10,c.qty)*Math.max(...c.dims):0),1.12,.9];
 const kgLimit=(b,c)=>{
  const l=Math.max(b.dims[0],envelope(c)[0]),w=1.12,h=.9;
  const fitting=Object.values(settings.trucks).filter(t=>h<=Math.min(settings.height,t.height??settings.height)+1e-8&&(l<=(t.length??Infinity)+1e-8&&w<=(t.width??Infinity)+1e-8));
  return fitting.length?Math.max(...fitting.map(t=>t.cap)):-Infinity;
 };
 for(const u of result.units){if(u.kind!=='Rack')continue;
  const r=byKey.get(u.rowKey),c=content(u,r);u.contents=[c];u.fill=u.qty/r.rack;
  u.dims=envelope(c);
  if(u.fill>=1-1e-8)full.push(u);else sources.push({...u,contents:[c]});
 }
 const add=(b,source,count)=>{
  const c=source.contents[0],part={...c,qty:count,kg:count*Number(byKey.get(c.rowKey).kg)};
  const existing=b.contents.find(a=>a.rowKey===c.rowKey);
  if(existing){existing.qty+=count;existing.kg+=part.kg;}else b.contents.push(part);
  b.qty+=count;b.kg+=part.kg;b.fill+=count/c.capacity;
  b.dims[0]=Math.max(b.dims[0],envelope(part)[0]);
  // Los conectores anclados siguen a los postes del paquete original.
  let attachedSlots=count;
  for(const a of source.attachments||[]){const n=Math.min(attachedSlots,a.qty);if(!n)continue;
   const kg=n*a.kg/a.qty;b.attachments.push({...a,qty:n,kg});b.kg+=kg;a.qty-=n;a.kg-=kg;attachedSlots-=n;
  }
 };
 sources.sort((a,b)=>b.fill-a.fill||b.dims[0]-a.dims[0]||a.rowKey.localeCompare(b.rowKey));
 for(const source of sources){const c=source.contents[0];let left=c.qty;
  while(left>0){let chosen=null;
   for(const b of bins){if(!compatible(b,c))continue;
    const attachedKg=(source.attachments||[]).reduce((n,a)=>n+a.kg,0)/left;
    let count=Math.min(left,Math.floor((1-b.fill+1e-9)*c.capacity),Math.floor((kgLimit(b,c)-b.kg+1e-8)/(Number(byKey.get(c.rowKey).kg)+attachedKg)));
    if(c.bundleSize===10&&count<left)count=Math.floor(count/10)*10;
    if(count<1)continue;
    const score=[count===left?0:1,Math.max(0,source.dims[0]-b.dims[0]),1-b.fill-count/c.capacity];
    if(!chosen||score.some((v,i)=>v<chosen.score[i]&&score.slice(0,i).every((x,j)=>x===chosen.score[j])))chosen={b,count,score};
   }
   if(!chosen){const b={kind:'Rack',qty:0,kg:settings.rackKg,dims:[1.12,1.12,.9],stackable:settings.stack,fill:0,contents:[],attachments:[]};bins.push(b);chosen={b,count:left};}
   add(chosen.b,source,chosen.count);left-=chosen.count;
  }
 }
 result.racksSeparate=result.racks;
 const packed=[...full,...bins];let index=0;
 for(const u of packed){u.containerId=`R${++index}`;u.mixed=u.contents.length>1;u.full=u.fill>=1-1e-8;
  u.name=u.mixed?`Rack mixto ${u.containerId}`:u.contents[0].name;
  if(u.mixed){delete u.rowKey;delete u.productId;}else{u.rowKey=u.contents[0].rowKey;u.productId=u.contents[0].productId;}
  u.freeFraction=Math.max(0,1-u.fill);
  // Opciones alternativas: el máximo de cada equipo no se suma al de los demás.
  u.completion=rows.filter(r=>loadMode(r,settings)==='rack'&&rowIssues(r,settings).length===0&&!isService(r.name)).map(r=>{
   const c={...r,rowKey:r.rowKey,bundleSize:isCollar(r)?10:1};if(!compatible(u,c))return null;
   let max=Math.min(Math.floor((u.freeFraction+1e-9)*r.rack),Math.floor((kgLimit(u,c)-u.kg+1e-8)/Number(r.kg)));
   if(c.bundleSize===10)max=Math.floor(max/10)*10;
   return max>0?{productId:r.productId,rowKey:r.rowKey,name:r.name,min:c.bundleSize,max,bundleSize:c.bundleSize,extendsLength:envelope({...c,qty:max})[0]>u.dims[0]+1e-8}:null;
  }).filter(Boolean);
 }
 result.units=[...result.units.filter(u=>u.kind!=='Rack'),...packed];result.racks=packed.length;
 result.racksSaved=result.racksSeparate-result.racks;
 result.tareKg=result.racks*settings.rackKg+result.baskets*settings.basketKg;result.totalKg=result.equipmentKg+result.tareKg;
 result.rackPlan=packed;result.fullRacks=packed.filter(u=>u.full).length;result.partialRacks=packed.length-result.fullRacks;result.mixedRacks=packed.filter(u=>u.mixed).length;
 result.rackEquivalent=packed.reduce((n,u)=>n+u.fill,0);result.rackMinimum=Math.ceil(result.rackEquivalent-1e-8);
 if(packed.length)result.notes.push('Los saldos se combinan por ocupación equivalente: cantidad ÷ capacidad individual del Excel. La suma por rack no supera 100%. La longitud usa el equipo más largo. Es una propuesta de acomodo; la capacidad individual no certifica la compatibilidad física de una mezcla.');
 if(packed.some(u=>u.contents.some(isCollar)))result.notes.push('Collarines: líneas de 10 unidos; el saldo menor a 10 se identifica aparte. Se conserva la capacidad de la ficha y se estima conservadoramente el largo de la línea sin descontar traslapes.');
}
function prepare(rows,settings){
 const omitted=rows.filter(r=>r.omit).map(r=>({name:r.name,qty:r.qty})),active=groupRows(rows.filter(r=>!r.omit).map(r=>{const mode=loadMode(r,settings);return {...r,mode,modeOverride:mode};}));
 // Un conector por poste; los excedentes conservan su carga suelta en canasta/granel.
 let slots=active.filter(r=>isPost(r)&&rowIssues(r,settings).length===0).reduce((n,r)=>n+r.qty,0);
 const pool=[],adjusted=[];
 for(const r of active){
  if(isAnchoredConnector(r)&&Number.isSafeInteger(r.qty)&&r.qty>0&&Number.isFinite(Number(r.kg))&&Number(r.kg)>0&&(!settings.catalogIds||settings.catalogIds.includes(r.productId))){
   const attached=Math.min(slots,r.qty);slots-=attached;
   if(attached)pool.push({name:r.name,qty:attached,kg:Number(r.kg),rowKey:r.rowKey});
   if(r.qty>attached)adjusted.push({...r,qty:r.qty-attached});
  }else adjusted.push(r);
 }
 const result=prepareBase(adjusted,settings);let anchored=0;
 for(const unit of result.units){if(!isPost(unit))continue;let free=unit.qty;
  for(const part of pool){const count=Math.min(free,part.qty);if(!count)continue;
   const weight=count*part.kg;unit.kg+=weight;unit.attachments=unit.attachments||[];unit.attachments.push({name:part.name,qty:count,kg:weight,rowKey:part.rowKey});
   result.equipmentKg+=weight;result.totalKg+=weight;result.pieces+=count;anchored+=count;free-=count;part.qty-=count;
  }
 }
 if(anchored)result.notes.push(`${anchored} conectores multidireccionales anclados a los postes: su peso se suma a esos paquetes y no requieren canasta ni volumen independiente. Se considera uno por poste; los excedentes se cargan sueltos. La longitud física del poste del catálogo incluye su extremo; no se suma nuevamente el largo del conector.`);
 combinePartialRacks(result,adjusted,settings);
 result.omitted=omitted;result.anchored=anchored;result.groupedRows=active;
 result.summary=active.map(r=>{
  const packages=result.units.filter(u=>u.contents?u.contents.some(c=>c.rowKey===r.rowKey):u.rowKey===r.rowKey),issues=rowIssues(r,settings);
  const identified=!settings.catalogIds||settings.catalogIds.includes(r.productId);
  const equipmentKg=identified&&Number.isSafeInteger(r.qty)&&r.qty>0&&r.kg>0?r.qty*Number(r.kg):null;
  const type=/^bidon(?:es)?$/.test(norm(r.name))?'Bidón':loadMode(r)==='rack'?'Rack':'Granel';
  const capacity=type==='Rack'?r.rack:type==='Bidón'?1:null;
  const containers=type==='Rack'||type==='Canasta'?packages.length:0;
  const partial=capacity?packages.filter(u=>u.kind==='Rack'?!u.full:u.qty<capacity).length:0;
  const anchored=result.units.reduce((n,u)=>n+(u.attachments||[]).filter(a=>a.rowKey===r.rowKey).reduce((n,a)=>n+a.qty,0),0);
  const mixedContainers=packages.filter(u=>u.mixed).length;
  const equivalent=packages.reduce((n,u)=>n+(u.contents?.find(c=>c.rowKey===r.rowKey)?.qty||0)/(capacity||1),0);
  const volume=packages.reduce((n,u)=>n+u.dims.reduce((a,b)=>a*b,1)*(u.contents?(u.contents.find(c=>c.rowKey===r.rowKey).qty/capacity)/u.fill:1),0);
  return {rowKey:r.rowKey,productId:r.productId,name:r.name,qty:r.qty,sourceCount:r.sourceCount,type,capacity,containers,containerIds:packages.map(u=>u.containerId).filter(Boolean),mixedContainers,equivalent,fullContainers:containers-partial,partialContainers:partial,bidones:type==='Bidón'?packages.reduce((n,u)=>n+u.qty,0):0,anchored,equipmentKg,volume:issues.length?null:volume,issues};
 });
 if(active.length<rows.filter(r=>!r.omit).length)result.notes.push('Se suman las cantidades del mismo equipo, medida y método de carga antes de redondear racks/canastas. Las variantes y medidas editadas se mantienen separadas.');
 return result;
}
function newTrip(truck,height){return {truck,kg:0,units:[],placements:[],containers:0,rackContainers:0,bidones:0,spaces:[{x:0,y:0,z:0,l:truck.length,w:truck.width,h:height}],volume:0};}
function bulkInfo(unit,truck){
 const reference=truck.bulkReference||{tons:truck.cap/1000,length:truck.length,width:truck.width,height:truck.height};
 const capacity=unit.kind==='Granel'?unit.bulkByTruck?.[String(reference.tons)]:null;
 return Number.isSafeInteger(capacity)&&capacity>0?{capacity,volume:reference.length*reference.width*reference.height,tons:reference.tons}:null;
}
function bulkFitCount(trip,unit,settings){
 const info=bulkInfo(unit,trip.truck);if(!info)return 0;
 const d=unit.pieceDims||unit.dims,height=Math.min(settings.height,trip.truck.height);
 if(![[d[0],d[1],d[2]],[d[1],d[0],d[2]]].some(([l,w,h])=>l<=trip.truck.length+1e-8&&w<=trip.truck.width+1e-8&&h<=height+1e-8))return 0;
 const free=Math.min(info.volume-trip.volume,trip.spaces.reduce((n,s)=>n+s.l*s.w*s.h,0));
 return Math.max(0,Math.min(unit.qty,Math.floor((trip.truck.cap-trip.kg+1e-7)/(unit.kg/unit.qty)),Math.floor((free+1e-7)*info.capacity/info.volume)));
}
function splitUnit(unit,count){
 const attachedKg=(unit.attachments||[]).reduce((n,a)=>n+a.kg,0),baseKg=(unit.kg-attachedKg)/unit.qty;
 const first=[],rest=[];let slots=count;
 for(const a of unit.attachments||[]){const qty=Math.min(slots,a.qty),kg=qty*a.kg/a.qty;slots-=qty;if(qty)first.push({...a,qty,kg});if(a.qty>qty)rest.push({...a,qty:a.qty-qty,kg:a.kg-kg});}
 const part={...unit,qty:count,kg:count*baseKg+first.reduce((n,a)=>n+a.kg,0),attachments:first};
 return [part,count===unit.qty?null:{...unit,qty:unit.qty-count,kg:unit.kg-part.kg,attachments:rest}];
}
function placeBulk(trip,unit,settings){
 const info=bulkInfo(unit,trip.truck);if(bulkFitCount(trip,unit,settings)<unit.qty)return false;
 // Reserva volumen equivalente; estos bloques no son un acomodo físico de piezas.
 const volume=unit.qty/info.capacity*info.volume;let left=volume;
 for(let i=0;i<trip.spaces.length&&left>1e-9;){const s=trip.spaces[i],available=s.l*s.w*s.h,used=Math.min(left,available),length=used/(s.w*s.h);
  trip.placements.push({x:s.x,y:s.y,z:s.z,l:length,w:s.w,h:s.h,name:unit.name,kind:'Granel',estimatedBulk:true});
  if(used>=available-1e-9)trip.spaces.splice(i,1);else{trip.spaces[i]={...s,x:s.x+length,l:s.l-length};i++;}left-=used;
 }
 trip.kg+=unit.kg;trip.volume+=volume;
 trip.units.push({...unit,plannedVolume:volume,excelBulkCapacity:info.capacity,excelBulkTons:info.tons});return true;
}
function mergeSpaces(spaces){
 const near=(a,b)=>Math.abs(a-b)<1e-7;
 let changed=true;while(changed){changed=false;outer:for(let i=0;i<spaces.length;i++)for(let j=i+1;j<spaces.length;j++){
  const a=spaces[i],b=spaces[j];let merged=null;
  if(near(a.y,b.y)&&near(a.z,b.z)&&near(a.w,b.w)&&near(a.h,b.h)&&(near(a.x+a.l,b.x)||near(b.x+b.l,a.x)))merged={...a,x:Math.min(a.x,b.x),l:a.l+b.l};
  else if(near(a.x,b.x)&&near(a.z,b.z)&&near(a.l,b.l)&&near(a.h,b.h)&&(near(a.y+a.w,b.y)||near(b.y+b.w,a.y)))merged={...a,y:Math.min(a.y,b.y),w:a.w+b.w};
  else if(near(a.x,b.x)&&near(a.y,b.y)&&near(a.l,b.l)&&near(a.w,b.w)&&(near(a.z+a.h,b.z)||near(b.z+b.h,a.z)))merged={...a,z:Math.min(a.z,b.z),h:a.h+b.h};
  if(merged){spaces[i]=merged;spaces.splice(j,1);changed=true;break outer;}
 }}return spaces;
}
function tryPlace(trip,unit,settings){if(trip.kg+unit.kg>trip.truck.cap+1e-7)return false;
 if(bulkInfo(unit,trip.truck))return placeBulk(trip,unit,settings);
 const container=unit.kind!=='Granel',rack=['Rack','Canasta'].includes(unit.kind);
 const bidones=trip.bidones+(unit.kind==='Bidón'?unit.qty:0),rackContainers=trip.rackContainers+(['Rack','Canasta'].includes(unit.kind)?1:0);
 if(trip.truck.maxBidones&&bidones>trip.truck.maxBidones)return false;
 // Los burros se limitan por su envolvente real; el cupo de bidones se conserva.
 // Piezas largas permanecen longitudinales; solo se intercambian largo y ancho.
 const options=rack?[unit.dims]:[unit.dims,[unit.dims[1],unit.dims[0],unit.dims[2]]];let chosen=null;
 for(let i=0;i<trip.spaces.length;i++){const s=trip.spaces[i];for(const [l,w,h] of options){if(l<=s.l+1e-8&&w<=s.w+1e-8&&h<=s.h+1e-8&&(!rack||s.z+h<=h*(trip.truck.rackLevels??2)+1e-8)){const waste=s.l*s.w*s.h-l*w*h;const score=settings.spaceStrategy==='longitudinal'?-s.l+waste*1e-6:waste;if(!chosen||score<chosen.score)chosen={i,s,l,w,h,waste,score};}}}
 if(!chosen)return false;const {i,s,l,w,h}=chosen;trip.spaces.splice(i,1);
 const more=[{x:s.x+l,y:s.y,z:s.z,l:s.l-l,w:s.w,h:s.h},{x:s.x,y:s.y+w,z:s.z,l,w:s.w-w,h:s.h}];if(unit.stackable)more.push({x:s.x,y:s.y,z:s.z+h,l,w,h:s.h-h});trip.spaces.push(...more.filter(x=>x.l>.001&&x.w>.001&&x.h>.001));
 mergeSpaces(trip.spaces);trip.placements.push({x:s.x,y:s.y,z:s.z,l,w,h,name:unit.name,qty:unit.qty,kind:unit.kind,containerId:unit.containerId,level:rack?Math.round(s.z/h)+1:null});
 trip.kg+=unit.kg;trip.volume+=l*w*h;trip.units.push({...unit,plannedVolume:l*w*h});if(container)trip.containers++;trip.rackContainers=rackContainers;trip.bidones=bidones;return true;
}
function planOnce(prepared,settings,fleet){
 const volumeOf=u=>u.dims.reduce((a,b)=>a*b,1),order=settings.packOrder||'length';
 const cmp=(a,b)=>order==='racks'?(Number(b.kind==='Rack')-Number(a.kind==='Rack')||b.dims[0]-a.dims[0]||b.kg-a.kg):order==='weight'?b.kg-a.kg||volumeOf(b)-volumeOf(a):order==='height'?b.dims[2]-a.dims[2]||volumeOf(b)-volumeOf(a):order==='volume'?volumeOf(b)-volumeOf(a):Math.max(...b.dims)-Math.max(...a.dims)||b.dims[0]*b.dims[1]-a.dims[0]*a.dims[1]||b.kg-a.kg;
 const units=[...prepared.units].sort(cmp),trips=[],unplaced=[];
 const candidates=Object.values(settings.trucks).sort((a,b)=>b.cap-a.cap||b.length-a.length);
 const tripFor=t=>newTrip(t,Math.min(settings.height,t.height??settings.height));
 for(const u of units){
  let remaining=u;
  const placeSome=t=>{
   if(bulkInfo(remaining,t.truck)){
    // Los primeros postes pueden llevar más conectores que el saldo: pesar la parte exacta.
    for(let count=bulkFitCount(t,remaining,settings);count>0;count--){const [part,rest]=splitUnit(remaining,count);if(tryPlace(t,part,settings)){remaining=rest;return true;}}
    return false;
   }
   if(!tryPlace(t,remaining,settings))return false;remaining=null;return true;
  };
  while(remaining){
  if(trips.some(placeSome))continue;
  // Compara carga y espacio: una unidad de 7 t puede admitir dos alturas de racks
  // aunque la de 10 t tenga un límite menor. No supone disponibilidad simultánea.
  const availableVolume=t=>t.length*t.width*Math.min(settings.height,t.height??settings.height);
  const ordered=[...candidates].sort((a,b)=>(settings.fleetStrategy==='space'?availableVolume(b)-availableVolume(a):b.cap-a.cap)||b.cap-a.cap||availableVolume(b)-availableVolume(a)||trips.filter(t=>t.truck.key===a.key).length-trips.filter(t=>t.truck.key===b.key).length);
  let placed=false;for(const truck of ordered){const t=tripFor(truck);if(placeSome(t)){trips.push(t);placed=true;break;}}
  if(!placed){unplaced.push(remaining);break;}
  }
 }
 // Reasignar a una unidad de menor capacidad solo si toda la carga vuelve a caber.
 for(let i=0;i<trips.length;i++)for(const truck of [...candidates].sort((a,b)=>a.cap-b.cap)){
  if(truck.cap>=trips[i].truck.cap)continue;
  const replacement=tripFor(truck);if(trips[i].units.every(u=>tryPlace(replacement,u,settings))){trips[i]=replacement;break;}
 }
 const volume=trips.reduce((n,t)=>n+t.volume,0)+unplaced.reduce((n,u)=>n+volumeOf(u),0),maxCap=Math.max(...candidates.map(t=>t.cap));
 const spaceBound=prepared.units.reduce((n,u)=>n+Math.min(...candidates.map(t=>{const info=bulkInfo(u,t),available=t.length*t.width*Math.min(settings.height,t.height??settings.height);return info?u.qty/info.capacity*info.volume/Math.min(info.volume,available):volumeOf(u)/available;})),0);
 const bidonCount=prepared.units.filter(u=>u.kind==='Bidón').reduce((n,u)=>n+u.qty,0);
 const containerBound=Math.min(...candidates.map(t=>(t.maxBidones?bidonCount/t.maxBidones:0)));
 const lowerBound=Math.max(Math.ceil((prepared.totalKg-1e-7)/maxCap),Math.ceil(spaceBound-1e-7),Math.ceil(containerBound-1e-7)),counts={};
 for(const t of trips){const tons=String(t.truck.cap/1000);counts[tons]=(counts[tons]||0)+1;}
 return {trips,unplaced,lowerBound,volume,counts,seven:counts['7']||0,ten:counts['10']||0};
}
function plan(prepared,settings,fleet){
 let best=null;
 for(const packOrder of ['length','height','volume','racks','weight'])for(const spaceStrategy of ['bestfit','longitudinal'])for(const fleetStrategy of ['weight','space']){
  const result=planOnce(prepared,{...settings,packOrder,spaceStrategy,fleetStrategy},fleet);
  if(!best||result.unplaced.length<best.unplaced.length||(result.unplaced.length===best.unplaced.length&&(result.trips.length<best.trips.length||(result.trips.length===best.trips.length&&result.trips.reduce((n,t)=>n+t.truck.cap,0)<best.trips.reduce((n,t)=>n+t.truck.cap,0)))))best=result;
 }return best;
}
function calculate(rows,settings,fleet){
 let best=null;const hasBeams=rows.some(r=>!r.omit&&loadMode(r,settings)==='bulk'&&/viga de madera h20/i.test(r.name));
 const minWidth=Math.min(...Object.values(settings.trucks).map(t=>t.width));
 const columns=hasBeams?Array.from({length:Math.max(1,Math.min(11,Math.floor(minWidth/.2))-1)},(_,i)=>Math.min(11,Math.floor(minWidth/.2))-i):[11];
 for(const h20Columns of columns){
  const prepared=prepare(rows,{...settings,h20Columns}),result=plan(prepared,settings,fleet),candidate={prepared,plan:result};
  if(!best||result.unplaced.length<best.plan.unplaced.length||(result.unplaced.length===best.plan.unplaced.length&&(result.trips.length<best.plan.trips.length||(result.trips.length===best.plan.trips.length&&result.volume<best.plan.volume))))best=candidate;
 }
 const planned=best.plan.trips.flatMap(t=>t.units),profiled=planned.filter(u=>u.excelBulkCapacity);
 if(profiled.length){
  best.prepared.notes.push('A granel: se usa CAMION 5TN, CAMION 7TN o CAMION 10TN del Excel según la unidad. La mezcla suma cantidad ÷ capacidad; la ocupación es equivalente, no un plano físico. Se conservan el peso, las medidas de cada pieza y la altura del destino. Celdas vacías y unidades sin columna usan el cálculo por dimensiones.');
  for(const r of best.prepared.summary)if(!r.issues.length){
   r.volume=best.plan.unplaced.some(u=>u.rowKey===r.rowKey||u.contents?.some(c=>c.rowKey===r.rowKey))?null:planned.reduce((n,u)=>{
    const content=u.contents?.find(c=>c.rowKey===r.rowKey);
    return n+(content?u.plannedVolume*(content.qty/content.capacity)/u.fill:u.rowKey===r.rowKey?u.plannedVolume:0);
   },0);
  }
 }
 return best;
}
root.FletesCore={loadState,rebaseRows,rowIssues,isService,norm,match,parse,basketCapacity,groupRows,prepare,plan,calculate};if(typeof module!=='undefined')module.exports=root.FletesCore;
})(typeof window!=='undefined'?window:globalThis);
