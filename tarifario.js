/* Tarifario COTYSSA · lógica de la página: catálogo, cálculo, PDF y envío.
   Los datos viven en /data; aquí no hay precios. */
(function(){
"use strict";
const CFG=window.COTYSSA_CONFIG;
const DATA={P:window.COTYSSA_CATALOGO,F:window.COTYSSA_FICHAS};
const LOGO_PDF=window.COTYSSA_LOGO_PDF;
/* contactos en la página */
document.querySelectorAll("[data-c]").forEach(el=>{const k=el.dataset.c;if(k==="wa-txt")el.textContent=CFG.waTxt;else if(k==="mail")el.textContent=CFG.mail;else if(k==="pbx")el.textContent=CFG.pbx;else if(k==="dir")el.textContent=CFG.dir;else if(k==="wa-link")el.href="https://wa.me/"+CFG.wa;else if(k==="mail-link")el.href="mailto:"+CFG.mail});
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const P=DATA.P,F=DATA.F,BY={};P.forEach(p=>BY[p.id]=p);
const SYS=Object.keys(F).sort((a,b)=>F[a].o-F[b].o);
const pdfLinks=f=>(f.pdf||[]).map(([n,u])=>`<a class="lnk" href="${esc(u)}" target="_blank" rel="noopener">Descargar ${esc(n)} (PDF)</a>`).join("");
const PER=["1 semana","2 semanas","1 mes"],PERD=["7 días","14 días","30 días"];
const inArt=()=>/claudeusercontent\.com$|claude\.ai$/.test(location.hostname)||!!(window.claude&&window.claude.use);
const isArtifact=inArt();

let S={per:2,np:1,q:{},sys:SYS[0],c:{}};
try{const s=JSON.parse(localStorage.getItem("cot_tarifario")||"null");if(s&&typeof s==="object")S=Object.assign(S,s,{q:s.q||{},c:s.c||{}})}catch(e){}
let svT;const save=()=>{clearTimeout(svT);svT=setTimeout(()=>{try{localStorage.setItem("cot_tarifario",JSON.stringify(S))}catch(e){}},250)};

const fmt=n=>"Q "+Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const ok=p=>!p.r||p.r.includes(S.per);
const solo=p=>"Solo "+p.r.map(i=>PER[i]).join(" o ");
const price=p=>{const v=p.p[S.per];return v==null||!ok(p)?null:+v};
const np=()=>Math.max(1,parseInt(S.np,10)||1);
const perTxt=()=>(np()>1?np()+" × ":"")+PER[S.per];
function lines(){return P.filter(p=>S.q[p.id]>0).map(p=>{const u=price(p);return{p,c:S.q[p.id],u,no:!ok(p),t:u==null?null:u*S.q[p.id]*np()}})}
function tot(){const L=lines();let s=0,pend=0,nd=0;L.forEach(l=>{if(l.no)nd++;else if(l.t==null)pend++;else s+=l.t});const flete=freight();const rental=s;if(freightPriced(flete))s=Math.round((s+flete.amount)*100)/100;return{L,s,rental,flete,pend,nd,iva:s-s/1.12}}

/* Transporte desde la base validada del cotizador de Selvin. */
let freightCache=null;
function freight(){const key=JSON.stringify([S.q,S.c.flete,S.c.fleteKm,S.c.fleteServicio,S.c.ubic]);if(freightCache?.key===key)return freightCache.value;const value=window.COTYSSA_FLETE.estimate(S.q,{enabled:S.c.flete,distance:S.c.fleteKm,service:S.c.fleteServicio||'ambos',destination:S.c.ubic,names:Object.fromEntries(P.map(p=>[p.id,p.n]))});freightCache={key,value};return value}
const freightPriced=f=>f.requested&&Number.isFinite(f.amount)&&f.amount>0;
function freightRows(f){
 if(!f.requested)return [];
 if(f.items?.length)return f.items.map(item=>({name:item.label,quantity:item.quantity,unit:item.unitCents/100,total:item.totalCents/100,detail:'Camión de '+item.tons+' t'}));
 const services=(S.c.fleteServicio||'ambos')==='ambos'?['entrega','retiro']:[S.c.fleteServicio];
 return services.map(service=>({name:'Flete de '+service,quantity:null,unit:null,total:null,detail:'Cantidad y precio por confirmar'}));
}
function freightRowsHtml(f){return freightRows(f).map(row=>'<div class="si freight-line"><div><b>'+esc(row.name)+'</b><small>'+esc(row.detail)+'</small></div><span class="line-qty" data-label="Cantidad">'+(row.quantity==null?'Por confirmar':row.quantity+' '+(row.quantity===1?'flete':'fletes'))+'</span><span class="unit" data-label="Precio unitario">'+(row.unit==null?'Consultar':fmt(row.unit))+'</span><span class="line-total" data-label="Importe">'+(row.total==null?'Consultar':fmt(row.total))+'</span></div>').join('')}
function freightNotes(f){return [f.distance?'Ruta: '+f.distance+' km de ida.':'',...f.warnings].filter(Boolean).join(' ')}
function renderFreight(){const f=freight();$('#fleteFields').hidden=!S.c.flete;$('#fleteKm').value=S.c.fleteKm??'';$('#fleteServicio').value=S.c.fleteServicio||'ambos';$('#fleteResultado').innerHTML='<p class="msg">'+esc(f.requested&&f.items?.length?'El desglose de entrega y retiro está en su cotización.':'Complete la ubicación, distancia y equipo para estimar el transporte.')+'</p>'}
$('#fleteKm').addEventListener('change',e=>{S.c.fleteKm=e.target.value;all()});
$('#fleteServicio').addEventListener('change',e=>{S.c.fleteServicio=e.target.value;all()});

/* período */
/* piezas con período restringido (campo r) limitan el período de toda la cotización */
const bloquea=v=>P.find(p=>S.q[p.id]>0&&p.r&&!p.r.includes(v));
function renderPer(){$$("#perSeg button").forEach(b=>{const v=+b.dataset.v,x=bloquea(v);b.setAttribute("aria-pressed",v===S.per);b.classList.toggle("off",!!x);b.title=x?x.n+": "+solo(x).toLowerCase():""});$("#nper").value=np()}
$("#perSeg").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;const v=+b.dataset.v,x=bloquea(v);if(x){toast(x.n+" se renta "+solo(x).toLowerCase()+". Quítelo de la lista para elegir "+PER[v]+".");return}S.per=v;all()});
function fixPer(p){if(!p||ok(p))return;const a=[0,1,2].filter(v=>!bloquea(v));if(!a.length)return;S.per=a[a.length-1];toast(p.n+" se renta "+solo(p).toLowerCase()+". Período cambiado a "+PER[S.per]+".")}
$("#npMinus").addEventListener("click",()=>{S.np=Math.max(1,np()-1);all()});
$("#npPlus").addEventListener("click",()=>{S.np=np()+1;all()});
$("#nper").addEventListener("change",e=>{S.np=Math.max(1,parseInt(e.target.value,10)||1);all()});

/* sistemas */
function renderSys(){
  $("#sysTabs").innerHTML=SYS.map(id=>{const f=F[id];const n=P.filter(p=>p.f===id&&S.q[p.id]>0).length;return `<button type="button" data-s="${id}" aria-pressed="${id===S.sys&&!S.search}"><img src="${f.img}" alt=""><span>${esc(f.n)}<small>${n?n+" en su lista":P.filter(p=>p.f===id).length+" piezas"}</small></span></button>`}).join("");
  const f=F[S.sys];
  $("#sysInfo").innerHTML=S.search?"":`<div class="sysinfo"><div class="ph"><img src="${f.img}" alt="${esc(f.n)}"></div><div><h3>${esc(f.n)}</h3><p>${esc(f.d)}</p><div class="lks"><button class="lnk" type="button" data-fi="${S.sys}">Ver ficha técnica</button>${pdfLinks(f)}</div></div></div>`;
}
$("#sysTabs").addEventListener("click",e=>{const b=e.target.closest("[data-s]");if(!b)return;S.sys=b.dataset.s;S.search="";$("#q").value="";renderSys();renderList();save()});
$("#q").addEventListener("input",e=>{S.search=e.target.value.trim();renderSys();renderList()});

/* lista */
const suggested=()=>{const s=new Set();P.forEach(p=>{if(S.q[p.id]>0)(p.x||[]).forEach(x=>s.add(x))});return s};
function renderList(){
  const q=(S.search||"").toLowerCase();const sg=suggested();
  const ps=q?P.filter(p=>(p.n+" "+p.d+" "+p.c+" "+(F[p.f]?.n||"")).toLowerCase().includes(q)):P.filter(p=>p.f===S.sys);
  $("#list").innerHTML=ps.length?ps.filter(p=>!sg.has(p.id)||S.q[p.id]).map(p=>{const u=price(p);const n=S.q[p.id]||0;
    return `<div class="pr${n>0?" on":""}" data-id="${p.id}"><div class="nm"><b>${esc(p.n)}${sg.has(p.id)&&!n?'<span class="tag">Sugerido</span>':""}</b><small>${esc([p.d,q?F[p.f]?.n:""].filter(Boolean).join(" · "))}</small></div>
    <div class="pc${u==null?" cq":""}">${!ok(p)?solo(p):u==null?"Consultar":fmt(u)}<small>${!ok(p)?"no se renta por "+PER[S.per]:u==null?"precio con asesor":"por pieza · "+PER[S.per]}</small></div>
    ${n?`<a class="selected-link" href="#resumen">Agregado ✓<small>Editar en cotización</small></a>`:`<div class="qt"><button type="button" data-d="-1" aria-label="Quitar uno">−</button><input type="number" min="0" step="1" inputmode="numeric" value="0" aria-label="Cantidad de ${esc(p.n)}"><button type="button" data-d="1" aria-label="Agregar uno">+</button></div>`}</div>`}).join(""):'<p class="msg" style="padding:16px 0">No encontramos equipo con ese nombre. Escríbanos y lo revisamos.</p>';
}
function setQ(id,n){n=Math.max(0,Math.floor(+n||0));if(n)S.q[id]=n;else delete S.q[id];if(n)fixPer(BY[id])}
$("#list").addEventListener("click",e=>{const b=e.target.closest("[data-d]");if(!b)return;const id=b.closest(".pr").dataset.id;setQ(id,(S.q[id]||0)+ +b.dataset.d);all(true)});
$("#list").addEventListener("change",e=>{const i=e.target.closest(".qt input");if(!i)return;setQ(i.closest(".pr").dataset.id,i.value);all(true)});

/* resumen */
function renderSum(){
  const t=tot();renderFreight();$("#perTxt").textContent=perTxt();
  const qt=(id,n)=>`<div class="qt sm"><button type="button" data-sd="-1" aria-label="Quitar uno">−</button><input type="number" min="0" step="1" inputmode="numeric" value="${n}" aria-label="Cantidad de ${esc(BY[id].n)}"><button type="button" data-sd="1" aria-label="Agregar uno">+</button></div>`;
  $('#sumItems').innerHTML=t.L.length?t.L.map(l=>`<div class="si" data-id="${l.p.id}"><div><b>${esc(l.p.n)}</b>${l.p.d?`<small>${esc(l.p.d)}</small>`:''}</div>${qt(l.p.id,l.c)}<span class="unit" data-label="Precio unitario">${l.no?solo(l.p):l.u==null?'Consultar':fmt(l.u)}${np()>1?`<small>× ${np()} períodos</small>`:''}</span><span class="line-total${l.t==null?' cq':''}" data-label="Importe">${l.no?'No disponible':l.t==null?'Consultar':fmt(l.t)}</span></div>`).join(''):'<div class="emp"><b>Su lista está vacía.</b><br>Agregue equipo del catálogo para comenzar.</div>';
  const miss=[...suggested()].filter(id=>BY[id]&&!S.q[id]);
  $('#suggestions').innerHTML=miss.length?`<details class="sug" open><summary>Complemente su equipo <span>${miss.length} opciones</span></summary><p>Agregue solo los accesorios que necesita.</p><div class="sug-options">${miss.map(id=>{const p=BY[id],u=price(p);return `<div class="suggestion" data-id="${id}"><div><b>${esc(p.n)}</b><small>${!ok(p)?solo(p):u==null?'Consultar':fmt(u)+' por pieza'}</small></div>${qt(id,0)}</div>`}).join('')}</div></details>`:'';
  $('#sumItems').insertAdjacentHTML('beforeend',freightRowsHtml(t.flete));
  $('#sumTot').innerHTML=`<div class="big"><span>Total preliminar</span><b>${fmt(t.s)}</b></div><div><span>IVA incluido (12%)</span><span>${fmt(t.iva)}</span></div>${t.nd?`<p class="wn">${t.nd} piezas no disponibles para ${PER[S.per]}.</p>`:''}${t.pend?`<p class="wn">${t.pend} piezas con precio por confirmar.</p>`:''}${t.flete.requested?`<p class="nt freight-note">${esc(freightNotes(t.flete))}</p>`:''}<p class="nt freight-disclaimer">${esc(window.COTYSSA_FLETE.disclaimer)}</p><p class="nt">Montaje y desmontaje se cotizan aparte.</p>`;
  $('#barN').textContent=t.L.length?`${t.L.length} ${t.L.length===1?'tipo de equipo':'tipos de equipo'} · ${perTxt()}`:'Agregue equipo para comenzar';
  updateLinks();updateBar();
}
function updateBar(){const g=$("#barGo");const n=tot().L.length;
  g.textContent=n?"Ver cotización":"Elegir equipo";g.href=n?"#resumen":"#s2"}
for(const target of [$('#sumItems'),$('#suggestions')]){
 target.addEventListener('click',e=>{const b=e.target.closest('[data-sd]');if(!b)return;const id=b.closest('[data-id]').dataset.id;setQ(id,(S.q[id]||0)+ +b.dataset.sd);all(true)});
 target.addEventListener('change',e=>{const i=e.target.closest('.qt input');if(!i)return;setQ(i.closest('[data-id]').dataset.id,i.value);all(true)});
}

/* datos */
const CF=["nombre","empresa","tel","email","proyecto","ubic","inicio","nit","coment"],CB=["flete","montaje"];
CF.forEach(k=>{const el=$("#c_"+k);el.value=S.c[k]||"";el.addEventListener("input",()=>{S.c[k]=el.value;el.removeAttribute("aria-invalid");updateLinks();updateBar();if(k==="ubic")renderSum();save()})});
CB.forEach(k=>{const el=$("#c_"+k);el.checked=!!S.c[k];el.addEventListener("change",()=>{S.c[k]=el.checked;renderSum();save()})});

/* mensaje */
function message(){
  const t=tot(),c=S.c;const L=[];
  L.push("*Solicitud de cotización · COTYSSA*");
  L.push("Período: "+perTxt());L.push("");
  t.L.forEach(l=>L.push(`• ${l.c} × ${l.p.n}${l.p.c?" ("+l.p.c+")":""} — ${l.no?"no se renta por "+PER[S.per]+" ("+solo(l.p).toLowerCase()+")":l.t==null?"precio por confirmar":fmt(l.t)}`));
  freightRows(t.flete).forEach(row=>L.push(`• ${row.quantity??"Por confirmar"} × ${row.name} — ${row.unit==null?"precio por confirmar":fmt(row.unit)+" c/u · "+fmt(row.total)+" total (IVA incluido)"}${row.total==null?" · precio pendiente, no sumado al total":""}`));
  L.push("");L.push("*Total referencial: "+fmt(t.s)+"* (IVA incluido)");if(t.flete.requested){L.push(freightNotes(t.flete));L.push(window.COTYSSA_FLETE.disclaimer)}
  if(t.nd)L.push(t.nd+" pieza(s) no se rentan por "+PER[S.per]+".");
  if(t.pend)L.push(t.pend+" pieza(s) con precio por confirmar.");
  L.push("Flete: "+(c.flete?"Sí, requiero":"No")+" · Montaje: "+(c.montaje?"Sí, requiero":"No"));
  L.push("");L.push("*Datos*");
  [["Nombre",c.nombre],["Empresa",c.empresa],["NIT",c.nit],["Teléfono",c.tel],["Correo",c.email],["Proyecto",c.proyecto],["Ubicación",c.ubic],["Inicio estimado",c.inicio]].forEach(([k,v])=>{if(v&&v.trim())L.push(k+": "+v.trim())});
  if(c.coment&&c.coment.trim()){L.push("");L.push("Comentarios: "+c.coment.trim())}
  return L.join("\n");
}
const plain=s=>s.replace(/\*/g,"");
function updateLinks(){try{setLinks()}catch(e){}}
function check(){
  const t=tot();const bad=[];
  if(!t.L.length){toast("Agregue al menos un equipo a su lista.");document.getElementById("s2").scrollIntoView({behavior:"smooth"});return false}
  if(!(S.c.nombre||"").trim())bad.push("nombre");
  if(!(S.c.tel||"").trim())bad.push("tel");
  if(bad.length){bad.forEach(k=>$("#c_"+k).setAttribute("aria-invalid","true"));$("#sendMsg").className="msg err";$("#sendMsg").textContent="Escriba su nombre y un teléfono para que el asesor pueda contactarle.";$("#c_"+bad[0]).focus();$("#datos").scrollIntoView({behavior:"smooth"});return false}
  $("#sendMsg").className="msg";return true}

$("#bCopy").addEventListener("click",async()=>{if(!tot().L.length){toast("Su lista está vacía.");return}
  const m=plain(message());
  try{await navigator.clipboard.writeText(m);toast("Cotización copiada. Péguela en WhatsApp o en un correo.")}
  catch(e){const ta=document.createElement("textarea");ta.value=m;ta.style.cssText="position:fixed;opacity:0";document.body.appendChild(ta);ta.select();let ok=false;try{ok=document.execCommand("copy")}catch(_){}ta.remove();toast(ok?"Cotización copiada.":"No se pudo copiar. Use los botones de WhatsApp o correo.")}});

/* ---------- PDF ---------- */
let downloads=null,dlTried=false;
async function getDownloads(){if(downloads||dlTried)return downloads;
  for(let i=0;i<30&&!(window.claude&&window.claude.use);i++)await new Promise(r=>setTimeout(r,100));
  if(window.claude&&window.claude.use){try{downloads=await window.claude.use("downloads")}catch(e){downloads=null}}
  dlTried=true;return downloads}
if(isArtifact)getDownloads();
const canShareFiles=()=>{try{return !inArt()&&!!navigator.canShare&&navigator.canShare({files:[new File(["x"],"x.pdf",{type:"application/pdf"})]})}catch(e){return false}};
if(canShareFiles())$("#bShare").hidden=false;
function sig(){return JSON.stringify([S.q,S.per,S.np,S.c])}
function ensureRef(){if(!S.ref||S.refSig!==sig()){const d=new Date(),p=n=>String(n).padStart(2,"0");S.ref="TR-"+String(d.getFullYear()).slice(2)+p(d.getMonth()+1)+p(d.getDate())+"-"+p(d.getHours())+p(d.getMinutes());S.refSig=sig();save()}return S.ref}
const fileName=()=>("Cotizacion COTYSSA "+ensureRef()+(S.c.empresa?" "+S.c.empresa:S.c.nombre?" "+S.c.nombre:"")).replace(/[\\/:*?"<>|]+/g," ").replace(/\s+/g," ").trim().slice(0,90)+".pdf";
const L1=s=>String(s??"").replace(/[–—−]/g,"-").replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^\x00-\xFF]/g,"");
function buildPdf(){
  const {jsPDF}=window.jspdf;const doc=new jsPDF({unit:"mm",format:"a4"});const t=tot(),c=S.c,ref=ensureRef();
  const W=210,M=16,R=W-M;const ink=[20,19,18],mute=[94,90,85],line=[211,207,201],or=[242,101,34],or7=[206,86,29];
  const col=a=>doc.setTextColor(a[0],a[1],a[2]);
  const head=(first)=>{doc.addImage(LOGO_PDF,"PNG",M,13,56,56*173/840);
    doc.setFont("helvetica","bold");doc.setFontSize(7.5);col(mute);doc.text("COTIZACIÓN REFERENCIAL",R,15.5,{align:"right",charSpace:.4});
    doc.setFontSize(14);col(ink);doc.text(ref,R,22.5,{align:"right"});
    doc.setFont("helvetica","normal");doc.setFontSize(8.5);col(mute);doc.text(L1(new Date().toLocaleDateString("es-GT",{day:"numeric",month:"long",year:"numeric"})),R,27.5,{align:"right"});
    doc.setDrawColor(...or);doc.setLineWidth(.7);doc.line(M,31,R,31);return 31};
  let y=head(true)+5;
  // aviso
  doc.setFillColor(254,243,237);const av=doc.splitTextToSize("Referencia de precios con IVA incluido. Sujeta a la disponibilidad del equipo y a las fechas de entrega. Un asesor de COTYSSA confirmará cantidades, fechas, flete y montaje, y le enviará la cotización final.",R-M-8);
  const ah=av.length*3.9+5;doc.rect(M,y,R-M,ah,"F");doc.setFillColor(...or);doc.rect(M,y,.8,ah,"F");
  doc.setFontSize(8.3);col([52,49,45]);doc.text(av,M+4,y+4.6);y+=ah+6;
  // datos
  const F2=[["Nombre",c.nombre],["Empresa",c.empresa],["Teléfono",c.tel],["Correo",c.email],["Proyecto",c.proyecto],["Ubicación",c.ubic],["Inicio estimado",c.inicio],["NIT",c.nit],["Período",perTxt()],["Servicios","Flete: "+(c.flete?"sí":"no")+"  ·  Montaje: "+(c.montaje?"sí":"no")]].filter(([k,v])=>v&&String(v).trim());
  doc.setDrawColor(...ink);doc.setLineWidth(.4);doc.line(M,y,R,y);
  const cw=(R-M)/2;
  for(let k=0;k<F2.length;k+=2){[F2[k],F2[k+1]].forEach((f,j)=>{if(!f)return;const x=M+j*cw;
      doc.setFont("helvetica","bold");doc.setFontSize(6.5);col(mute);doc.text(L1(f[0]).toUpperCase(),x,y+4.6,{charSpace:.3});
      doc.setFont("helvetica","normal");doc.setFontSize(9.3);col(ink);doc.text(doc.splitTextToSize(L1(f[1]),cw-30)[0],x+27,y+4.8)});
    y+=7;doc.setDrawColor(...line);doc.setLineWidth(.2);doc.line(M,y,R,y)}
  if(c.coment&&c.coment.trim()){const cm=doc.splitTextToSize(L1("Comentarios: "+c.coment.trim()),R-M);doc.setFontSize(8.5);col(mute);doc.text(cm.slice(0,4),M,y+4.5);y+=Math.min(cm.length,4)*3.8+3}
  y+=7;
  // tabla
  const X={n:M,c:132,p:160,t:R};
  const th=()=>{doc.setFont("helvetica","bold");doc.setFontSize(6.8);col(mute);doc.text("EQUIPO",X.n,y,{charSpace:.3});doc.text("CANT.",X.c,y,{align:"right",charSpace:.3});doc.text("PRECIO",X.p,y,{align:"right",charSpace:.3});doc.text("TOTAL",X.t,y,{align:"right",charSpace:.3});
    y+=2;doc.setDrawColor(...ink);doc.setLineWidth(.4);doc.line(M,y,R,y);y+=5};
  th();
  t.L.forEach(l=>{const nm=doc.splitTextToSize(L1(l.p.n),104);const dt=l.p.d?doc.splitTextToSize(L1(l.p.d),104):[];const h=nm.length*4.2+dt.length*3.5+3;
    if(y+h>268){doc.addPage();y=head(false)+9;th()}
    doc.setFont("helvetica","bold");doc.setFontSize(9.3);col(ink);doc.text(nm,X.n,y);
    doc.setFont("helvetica","normal");doc.text(String(l.c),X.c,y,{align:"right"});
    doc.text(l.no?"No disp.":l.u==null?"Consultar":fmt(l.u),X.p,y,{align:"right"});
    doc.setFont("helvetica","bold");if(l.t==null)col(or7);doc.text(l.no?"No disponible":l.t==null?"Por confirmar":fmt(l.t),X.t,y,{align:"right"});
    if(dt.length){doc.setFont("helvetica","normal");doc.setFontSize(7.6);col(mute);doc.text(dt,X.n,y+nm.length*4.2-.6)}
    y+=h-1.5;doc.setDrawColor(...line);doc.setLineWidth(.2);doc.line(M,y,R,y);y+=5});
  // Transporte: partidas con cantidad, servicio, precio unitario e importe con IVA.
  freightRows(t.flete).forEach(row=>{
    const nm=doc.splitTextToSize(L1(row.name),104),dt=doc.splitTextToSize(L1(row.detail),104);
    const h=nm.length*4.2+dt.length*3.5+3;
    if(y+h>268){doc.addPage();y=head(false)+9;th()}
    doc.setFont("helvetica","bold");doc.setFontSize(9.3);col(ink);doc.text(nm,X.n,y);
    doc.setFont("helvetica","normal");doc.text(row.quantity==null?"Pend.":String(row.quantity),X.c,y,{align:"right"});
    doc.text(row.unit==null?"Consultar":fmt(row.unit),X.p,y,{align:"right"});
    doc.setFont("helvetica","bold");doc.text(row.total==null?"Por confirmar":fmt(row.total),X.t,y,{align:"right"});
    doc.setFont("helvetica","normal");doc.setFontSize(7.6);col(mute);doc.text(dt,X.n,y+nm.length*4.2-.6);
    y+=h-1.5;doc.setDrawColor(...line);doc.setLineWidth(.2);doc.line(M,y,R,y);y+=5;
  });
  // totales
  if(y+40>278){doc.addPage();y=head(false)+12}
  y+=2;const tx=118;
  doc.setDrawColor(...ink);doc.setLineWidth(.5);doc.line(tx,y,R,y);y+=7;
  doc.setFont("helvetica","bold");doc.setFontSize(12.5);col(ink);doc.text("Total preliminar",tx,y);col(or7);doc.text(fmt(t.s),R,y,{align:"right"});
  y+=5.5;doc.setFont("helvetica","normal");doc.setFontSize(8.5);col(mute);doc.text("IVA incluido (12%)",tx,y);doc.text(fmt(t.iva),R,y,{align:"right"});
  if(t.nd){y+=4.6;col(or7);doc.text(t.nd+(t.nd>1?" piezas no se rentan":" pieza no se renta")+" por "+PER[S.per],tx,y)}
  if(t.pend){y+=4.6;col(or7);doc.text(t.pend+(t.pend>1?" piezas":" pieza")+" con precio por confirmar",tx,y)}
  y+=10;
  if(t.flete.requested){
    const detail=[freightNotes(t.flete),window.COTYSSA_FLETE.disclaimer].filter(Boolean);
    doc.setFont("helvetica","normal");doc.setFontSize(8.3);col(mute);
    detail.forEach(n=>{const ls=doc.splitTextToSize(L1(n),R-M);if(y+ls.length*3.8>278){doc.addPage();y=head(false)+10}doc.text(ls,M,y);y+=ls.length*3.8+3});
  }
  const notes=["Precios en quetzales por pieza y por período de renta, con IVA incluido.","Montaje y desmontaje se cotizan aparte. El transporte estimado requiere confirmación de COTYSSA.","El período corre desde la salida del equipo de bodega hasta su devolución.","Devolver el equipo en las condiciones recibidas para evitar recargos por limpieza, reparación o reposición."];
  doc.setFontSize(7.8);notes.forEach(n=>{const ls=doc.splitTextToSize(L1(n),R-M-5);if(y+ls.length*3.5>278){doc.addPage();y=head(false)+10}doc.setFillColor(...or);doc.rect(M,y-1.4,1.6,.4,"F");col(mute);doc.text(ls,M+4,y);y+=ls.length*3.5+1.2});
  // pie
  const N=doc.getNumberOfPages();for(let k=1;k<=N;k++){doc.setPage(k);doc.setDrawColor(...ink);doc.setLineWidth(.3);doc.line(M,284,R,284);
    doc.setFont("helvetica","bold");doc.setFontSize(6.6);col(mute);doc.text(L1("SERVICIO AL CLIENTE · "+CFG.mail.toUpperCase()+" · WHATSAPP "+CFG.waTxt+" · COTYSSA.COM"),M,288.5,{charSpace:.25});
    col(ink);doc.text(String(k).padStart(2,"0")+" / "+String(N).padStart(2,"0"),R,288.5,{align:"right"});
    doc.setFont("helvetica","normal");doc.setFontSize(6.6);col(mute);doc.text(L1(CFG.dir+" · PBX "+CFG.pbx),M,292.3)}
  doc.setProperties({title:"Cotización referencial "+ref+" · COTYSSA",author:"COTYSSA"});
  return doc}
async function getPdfBlob(){if(!window.jspdf)throw{code:"nolib"};return buildPdf().output("blob")}
async function savePdf(){
  const name=fileName();const blob=await getPdfBlob();
  if(inArt()){const d=await getDownloads();if(!d)throw{code:"unavailable"};await d.save({filename:name,data:blob});return}
  const u=URL.createObjectURL(blob);const a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000)}
function busy(b,on){b.setAttribute("aria-busy",on?"true":"false")}
function pdfErr(e){if(e&&e.code==="declined")return;const t=(e&&e.code==="nolib"?"No se pudo cargar el generador de PDF. Revise su conexión e intente de nuevo.":e&&(e.code==="unavailable"||e.code==="not_granted")?"Este navegador no permite descargar el PDF desde el link.":"No se pudo generar el PDF. Intente de nuevo.");toast(t);const m=$("#sendMsg");m.className="msg err";m.textContent=t+" Su cotización igual se envía completa por WhatsApp o correo."}
$("#bPdf").addEventListener("click",async()=>{if(!check())return;const b=$("#bPdf");busy(b,true);try{await savePdf();sent("pdf")}catch(e){pdfErr(e)}busy(b,false)});
function sent(kind){const m=$("#sendMsg");m.className="done";
  m.innerHTML=kind==="pdf"?"<b>PDF descargado.</b> Envíelo por WhatsApp o correo con los botones de arriba."
   :kind==="wa"?"<b>Se abrió WhatsApp con COTYSSA.</b> Toque el clip 📎 → Documento y adjunte el PDF <b>"+esc(fileName())+"</b> que se descargó."
   :kind==="nopdf"?"<b>Mensaje listo.</b> Envíelo y un asesor de COTYSSA le responderá con la cotización en PDF."
   :"<b>Se abrió su correo.</b> Adjunte el PDF <b>"+esc(fileName())+"</b> que se descargó y envíelo a "+esc(CFG.mail)+"."}
const pdfOk=()=>!inArt()||!!downloads;
function waMsg(){return `Hola, les envío mi cotización referencial *${ensureRef()}*${pdfOk()?" en PDF":""}.\n\n`+message()}
function setLinks(){const m=waMsg();
  $("#bWa").href="https://wa.me/"+CFG.wa+"?text="+encodeURIComponent(m);
  $("#bMail").href="mailto:"+CFG.mail+"?subject="+encodeURIComponent("Cotización referencial "+ensureRef()+(S.c.empresa?" · "+S.c.empresa:""))+"&body="+encodeURIComponent(plain(m)+(pdfOk()?"\n\n(Adjunto el PDF de la cotización.)":""))}
function sendVia(kind,a,e){if(!check()){e.preventDefault();return}
  if(!pdfOk()){sent("nopdf");return}
  savePdf().then(()=>sent(kind)).catch(err=>{if(err&&err.code==="declined"){sent("nopdf");return}pdfErr(err);sent("nopdf")})}
$("#bWa").addEventListener("click",function(e){sendVia("wa",this,e)});
$("#bMail").addEventListener("click",function(e){sendVia("mail",this,e)});
$("#bShare").addEventListener("click",async()=>{if(!check())return;const b=$("#bShare");busy(b,true);
  try{const f=new File([await getPdfBlob()],fileName(),{type:"application/pdf"});await navigator.share({files:[f],title:"Cotización referencial "+ensureRef(),text:"Cotización COTYSSA "+ensureRef()+" para "+CFG.mail+" / WhatsApp "+CFG.waTxt+""})}
  catch(e){if(!(e&&e.name==="AbortError"))pdfErr(e)}busy(b,false)});

/* ficha */
const dlg=$("#dlg");
document.addEventListener("click",e=>{const b=e.target.closest("[data-fi]");if(!b)return;const f=F[b.dataset.fi];
  $("#dlgB").innerHTML=`<div class="dg"><div class="ph"><img src="${f.img}" alt="${esc(f.n)}"></div><div class="tx"><small>${esc(f.l)} · Ficha técnica</small><h3 id="dlgT">${esc(f.n)}</h3><p>${esc(f.d)}</p><table>${f.s.map(([k,v])=>`<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>${f.r?`<p class="rs">${esc(f.r)}</p>`:""}${f.pdf?`<div class="lks">${pdfLinks(f)}</div>`:""}</div></div>`;
  if(dlg.showModal)dlg.showModal();else dlg.setAttribute("open","")});
$("#dlgX").addEventListener("click",()=>dlg.close?dlg.close():dlg.removeAttribute("open"));
dlg.addEventListener("click",e=>{if(e.target===dlg)dlg.close()});

function toast(m){const t=document.createElement("div");t.className="toast";t.setAttribute("role","status");t.textContent=m;document.body.appendChild(t);setTimeout(()=>t.remove(),2800)}
function all(keepList){renderPer();renderSys();if(keepList){const y=window.scrollY;renderList();window.scrollTo(0,y)}else renderList();renderSum();save()}
all();
if(window.IntersectionObserver)new IntersectionObserver(entries=>{$("#bar").hidden=entries[0].isIntersecting},{threshold:0}).observe($("#resumen"));
})();
