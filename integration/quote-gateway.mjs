/** Server-only handler. El flujo firmado nunca se entrega al navegador. */
export function createQuoteHandler(catalog) {
  const byId = new Map(catalog.map(p=>[p.id,p]));
  const response=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  const text=(v,max)=>String(v??'').trim().slice(0,max);
  return async function register(request,env) {
    if(request.method!=='POST')return response(405,{ok:false,error:'Método no permitido'});
    if(request.headers.get('Origin')!==new URL(request.url).origin)return response(403,{ok:false,error:'Origen no permitido'});
    if(!request.headers.get('Content-Type')?.startsWith('application/json'))return response(415,{ok:false,error:'Formato inválido'});
    if(!env.QUOTE_FLOW_URL)return response(503,{ok:false,error:'Registro automático pendiente de activación'});
    const raw=await request.text();if(raw.length>32000)return response(413,{ok:false,error:'Solicitud demasiado grande'});
    let b;try{b=JSON.parse(raw)}catch{return response(400,{ok:false,error:'Solicitud inválida'})}
    if(!/^[a-f0-9-]{36}$/i.test(b.key||''))return response(400,{ok:false,error:'Clave de cotización inválida'});
    if(!Number.isInteger(b.per)||b.per<0||b.per>2||!Number.isInteger(b.np)||b.np<1||b.np>120)return response(400,{ok:false,error:'Período inválido'});
    const c=b.client||{};if(!text(c.nombre,100)||!/^[+()0-9 .-]{8,30}$/.test(c.tel||''))return response(400,{ok:false,error:'Nombre o teléfono incompleto'});
    let amount=0,pending=false;const equipment=[];
    if(!b.quantities||typeof b.quantities!=='object'||Array.isArray(b.quantities))return response(400,{ok:false,error:'Equipo inválido'});
    for(const [id,qty] of Object.entries(b.quantities)){
      const p=byId.get(id);if(!p||!Number.isInteger(qty)||qty<1||qty>99999)return response(400,{ok:false,error:'Cantidad inválida'});
      const rate=p.p[b.per];if(rate===null)pending=true;else amount+=Math.round(rate*qty*b.np*100)/100;
      equipment.push(`${qty} × ${p.n}${rate===null?' (por cotizar)':''}`);
    }
    if(!equipment.length)return response(400,{ok:false,error:'Seleccione equipo'});
    const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([b.key,b.per,b.np,b.quantities,c]))));
    const ref='TR-'+Array.from(digest.slice(0,10),x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();
    const quote={reference:ref,createdAt:new Date().toISOString(),name:text(c.nombre,100),company:text(c.empresa,120),project:text(c.proyecto,120),phone:text(c.tel,30),email:text(c.email,150),address:text(c.ubic,250),amount:Math.round(amount*100)/100,pending,equipment:equipment.join('\n'),period:`${b.np} × ${['1 semana','2 semanas','1 mes'][b.per]}`,delivery:!!c.flete,assembly:!!c.montaje,notes:text(c.coment,1500),nit:text(c.nit,30),start:text(c.inicio,20)};
    try{
      const r=await fetch(env.QUOTE_FLOW_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(quote),signal:AbortSignal.timeout(25000)});
      // El flujo debe responder solo después de que Office Script confirme la escritura.
      const result=await r.json();const v=typeof result==='string'?JSON.parse(result):result;
      if(!r.ok||v.ok!==true||v.reference!==ref)return response(502,{ok:false,error:'No se confirmó el registro. Intente de nuevo con la misma cotización.'});
      return response(200,{ok:true,reference:ref,createdAt:quote.createdAt});
    }catch{return response(502,{ok:false,error:'No se confirmó el registro. Intente de nuevo.'})}
  };
}
