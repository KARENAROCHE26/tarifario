(function(root){
'use strict';
const DISCLAIMER='Los precios son preliminares, pueden variar y están sujetos a disponibilidad.';
function estimate(quantities,options={},data=root.COTYSSA_FLETES_DATOS,core=root.FletesCore){
 const result={requested:!!options.enabled,complete:false,amount:0,warnings:[],disclaimer:DISCLAIMER};
 if(!result.requested)return result;
 const distance=Number(options.distance),validDistance=String(options.distance??'').trim()!==''&&Number.isFinite(distance)&&distance>0&&distance<=2000;
 if(!validDistance)result.warnings.push('Indique la distancia de ida desde planta, entre 0 y 2,000 km.');
 if(!String(options.destination||'').trim())result.warnings.push('Indique la ubicación de la obra.');
 if(!['entrega','retiro','ambos'].includes(options.service))result.warnings.push('Seleccione entrega, retiro o ambos.');
 const rows=[],lookup=Object.fromEntries(data.catalog.map(p=>[p.id,p]));
 const selected=Object.entries(quantities).filter(([,q])=>Number.isSafeInteger(q)&&q>0);
 if(!selected.length)result.warnings.push('Agregue equipo para estimar el transporte.');
 for(const [id,qty] of selected){
  const map=data.map[id];
  if(!map){result.warnings.push('Equipo por confirmar: '+(options.names?.[id]||id));continue;}
  if(id.startsWith('modulo-de-andamio-'))result.warnings.push('Módulos: se estiman marcos y crucetas; el peso y acomodo de los conectores quedan por confirmar.');
  for(const [catalogId,factor] of map){const p=lookup[catalogId];rows.push({productId:p.id,name:p.name,qty:qty*factor,kg:p.kg,dims:p.dims,rack:p.rack,mode:p.rack?'rack':'bulk',modeOverride:'auto',geometry:p.geometry,technical:p.technical||null,bulkByTruck:p.bulkByTruck||null,referenceMeasure:p.referenceMeasure??null,omit:false});}
 }
 result.warnings=[...new Set(result.warnings)];
 if(!rows.length||!validDistance)return result;
 try{
 const trucks=Object.fromEntries(data.fleet.map(t=>[t.key,t]));
 const settings={catalogIds:data.catalog.map(p=>p.id),mode:'mixed',height:1.9,rackKg:50,basketKg:50,basketHeight:.9,stack:true,trucks};
 const {prepared,plan}=core.calculate(rows,settings,'auto');
 if(prepared.pending.length||prepared.excluded.length||plan.unplaced.length)result.warnings.push('Hay peso o acomodo pendiente; un asesor confirmará los viajes.');
 const multiplier=options.service==='ambos'?2:1,extraKm=Math.round(Math.max(0,distance-data.baseRadius)*200)/100;
 const lines=plan.trips.map(t=>{const tons=t.truck.cap/1000,rate=data.rates[tons];const beforeIVA=rate.base+Math.ceil(Math.round(extraKm*(rate.extraKm*.8)*100)/.8);return {tons,netCents:beforeIVA};});
 const netCents=lines.reduce((sum,l)=>sum+l.netCents,0)*multiplier;
 result.trips=plan.trips.length;result.services=multiplier;result.kg=prepared.totalKg;result.netCents=netCents;result.lines=lines;result.distance=distance;result.service=options.service;result.items=lineItems(result);result.amount=result.items.reduce((sum,item)=>sum+item.totalCents,0)/100;
 result.complete=lines.length>0&&result.warnings.length===0;
 }catch{result.warnings.push('No se pudo estimar el acomodo; el flete queda por confirmar.');}
 return result;
}
function lineItems(result){
 const services=result.service==='ambos'?['entrega','retiro']:[result.service];
 const items=[];
 for(const service of services){
  const groups=new Map();
  for(const line of result.lines||[]){
   const unitCents=Math.round(line.netCents*1.12),key=line.tons+':'+unitCents;
   const item=groups.get(key)||{service,label:'Flete de '+service,tons:line.tons,quantity:0,unitCents,totalCents:0};
   item.quantity++;item.totalCents=item.quantity*unitCents;groups.set(key,item);
  }
  items.push(...groups.values());
 }
 return items;
}
root.COTYSSA_FLETE={estimate,lineItems,disclaimer:DISCLAIMER};
if(typeof module!=='undefined')module.exports=root.COTYSSA_FLETE;
})(typeof window!=='undefined'?window:globalThis);
