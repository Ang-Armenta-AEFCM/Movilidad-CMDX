const PATHS={master:'data/base_maestra_cct_inmuebles.json',sii:'data/estudiantes_siieweb.json',mov:'data/movilidad.json',imv:'data/indice_marginalidad_violencia.geojson',alcaldias:'data/alcaldias.json',context:'data/contexto_cct.json',profile:'data/perfil_movilidad.json'};
const IMV_LABEL={1:'Muy baja',2:'Baja',3:'Media',4:'Alta',5:'Muy alta'};
const IMV_COLOR={'Muy baja':'#2f855a','Baja':'#7bbf72','Media':'#e7c95e','Alta':'#e68a4f','Muy alta':'#c94a4a'};
const THEMES={
 nacional:[
  {id:'curp_estado',label:'Nacimiento por CURP · otro estado',dataset:'nacimiento_curp',field:'NACIMIENTO CURP OTRO ESTADO',help:'Estudiantes cuyo lugar de nacimiento inferido por CURP corresponde a otra entidad federativa.'},
  {id:'entidad_otra',label:'Entidad registrada distinta de CDMX',dataset:'otras_entidades',field:'ENTIDAD OTRA',help:'Registros donde el campo de entidad corresponde a una entidad distinta de la Ciudad de México.'},
  {id:'migracion_estatal',label:'Condición migrante · otra entidad',dataset:'entidad_migrante',field:'ENTIDAD MIGRANTE OTRA',help:'Subconjunto explícitamente marcado como migrante dentro de México, con entidad migrante distinta de CDMX.'}
 ],
 internacional:[
  {id:'curp_ext',label:'Nacimiento por CURP · extranjero',dataset:'nacimiento_curp',field:'NACIMIENTO CURP EXTRANJERO',help:'Estudiantes cuyo lugar de nacimiento inferido por CURP corresponde al extranjero.'},
  {id:'pais_otro',label:'País registrado distinto de México',dataset:'otros_paises',field:'PAÍS OTRO',help:'Registros donde el campo de país corresponde a un país distinto de México.'},
  {id:'migracion_int',label:'Condición migrante · otro país',dataset:'pais_migrante',field:'PAÍS MIGRANTE OTRO',help:'Subconjunto explícitamente marcado como migrante internacional.'}
 ],
 contexto:[
  {id:'imv',label:'Índice de marginalidad y violencia',dataset:null,field:null,help:'Clasificación territorial del índice de marginalidad y violencia. Se muestra como contexto, no como característica individual.'},
  {id:'marginacion',label:'Marginación registrada en base de movilidad',dataset:'nacimiento_curp',field:'Marginación',categorical:true,help:'Categoría de marginación incluida en la base de movilidad cuando existe registro.'}
 ]
};
let state={theme:'nacional',indicator:'curp_estado',metric:'count',selected:null,selectedCct:null,selectedTurn:null};
let MASTER,MOV,SII,CTX,ALC,IMVGEO,PERF,imvLayer,alcaldiaLayer,markers=L.layerGroup();
let cctMap=new Map(),inmuebles=[],siiExact=new Map(),siiCct=new Map(),mobIndex={},mobCctIndex={},originAlcNorm=new Map();
const map=L.map('map',{zoomControl:false,preferCanvas:true}).setView([19.36,-99.13],10.4);L.control.zoom({position:'topleft'}).addTo(map);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Tiles © Esri'}).addTo(map);markers.addTo(map);
const q=id=>document.getElementById(id);const fmt=n=>Number(n||0).toLocaleString('es-MX');
const clean=s=>String(s??'').trim();const norm=s=>clean(s).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
function currentDef(){return THEMES[state.theme].find(x=>x.id===state.indicator)||THEMES[state.theme][0]}
async function init(){bind();try{const [master,sii,mov,imv,alc,ctx,profile]=await Promise.all(Object.values(PATHS).map(p=>fetch(p,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(p);return r.json()})));MASTER=master;SII=sii;MOV=mov;CTX=ctx;ALC=alc;IMVGEO=imv;PERF=profile;prepare();drawAlcaldias();populate();render();q('status').textContent='';}catch(e){console.error(e);q('status').textContent='No fue posible cargar el visor. Ábrelo desde GitHub Pages o un servidor web.'}}
function prepare(){
 Object.values(MASTER.cct).forEach(r=>cctMap.set(r.cct,r));inmuebles=Object.values(MASTER.inmuebles);
 for(const item of SII.registros||[])for(const r of item.ccts||[]){const k=`${r.cct}|${norm(r.turno)}`;siiExact.set(k,(siiExact.get(k)||0)+(r.estudiantes||0));siiCct.set(r.cct,(siiCct.get(r.cct)||0)+(r.estudiantes||0));}
 for(const [ds,rows] of Object.entries(MOV.registros||{})){const m=new Map(),byCct=new Map();for(const r of rows){const k=`${r.CCT}|${norm(r.TURNO)}`;m.set(k,r);if(!byCct.has(r.CCT))byCct.set(r.CCT,[]);byCct.get(r.CCT).push(r);}mobIndex[ds]=m;mobCctIndex[ds]=byCct;}
 for(const [a,v] of Object.entries(PERF?.origen_alcaldia||{}))originAlcNorm.set(norm(a),v);
}
function bind(){
 q('themeTabs').addEventListener('click',e=>{const b=e.target.closest('button[data-theme]');if(!b)return;state.theme=b.dataset.theme;state.indicator=THEMES[state.theme][0].id;document.querySelectorAll('#themeTabs button').forEach(x=>x.classList.toggle('active',x===b));populateIndicators();render();});
 q('indicator').addEventListener('change',e=>{state.indicator=e.target.value;render();});q('metric').addEventListener('change',e=>{state.metric=e.target.value;render();});
 ['levelFilter','alcaldiaFilter','supportFilter'].forEach(id=>q(id).addEventListener('change',render));q('searchBox').addEventListener('input',render);
 q('clearFilters').onclick=()=>{['levelFilter','alcaldiaFilter','supportFilter'].forEach(id=>q(id).value='');q('searchBox').value='';render();};
 q('toggleImv').onchange=syncImv;q('toggleAlcaldias').onchange=()=>q('toggleAlcaldias').checked?alcaldiaLayer.addTo(map):map.removeLayer(alcaldiaLayer);
 q('closeDetail').onclick=()=>q('detail').classList.add('hidden');q('sidebarToggle').onclick=()=>q('sidebar').classList.toggle('closed');
}
function populate(){populateIndicators();const levels=new Set(),alcs=new Set(),sups=new Set();for(const r of cctMap.values()){if(r.nivel)levels.add(r.nivel);if(r.alcaldia)alcs.add(r.alcaldia);if(r.sostenimiento)sups.add(r.sostenimiento)}fillSelect('levelFilter',levels,'Todos');fillSelect('alcaldiaFilter',alcs,'Todas');fillSelect('supportFilter',sups,'Todos');}
function fillSelect(id,set,first){q(id).innerHTML=`<option value="">${first}</option>`+[...set].sort((a,b)=>a.localeCompare(b,'es')).map(v=>`<option>${esc(v)}</option>`).join('')}
function populateIndicators(){q('indicator').innerHTML=THEMES[state.theme].map(x=>`<option value="${x.id}" ${x.id===state.indicator?'selected':''}>${x.label}</option>`).join('');q('metric').disabled=state.theme==='contexto';}
function drawAlcaldias(){alcaldiaLayer=L.geoJSON(ALC,{style:{color:'#607b8d',weight:1,fillOpacity:0}}).addTo(map)}
function syncImv(){if(!q('toggleImv').checked){if(imvLayer)map.removeLayer(imvLayer);return}if(!imvLayer)imvLayer=L.geoJSON(IMVGEO,{style:f=>({color:'#fff',weight:.4,fillColor:IMV_COLOR[imvCategory(f.properties?.C_US)]||'#aab4bb',fillOpacity:.42}),onEachFeature:(f,l)=>l.bindTooltip(`IMV: ${imvCategory(f.properties?.C_US)||'Sin dato'}`)});imvLayer.addTo(map);imvLayer.bringToBack();}
function imvCategory(v){if(v==null||v==='')return null;if(typeof v==='string'&&IMV_COLOR[v])return v;const n=Number(v);return IMV_LABEL[n]||null}
function filteredInmuebles(){const lf=q('levelFilter').value,af=norm(q('alcaldiaFilter').value),sf=norm(q('supportFilter').value),search=norm(q('searchBox').value);return inmuebles.filter(inm=>{const records=(inm.ccts||[]).map(c=>cctMap.get(c)).filter(Boolean);if(lf&&!records.some(r=>r.nivel===lf))return false;if(af&&!records.some(r=>norm(r.alcaldia)===af))return false;if(sf&&!records.some(r=>norm(r.sostenimiento)===sf))return false;if(search){const blob=norm([inm.nombre,inm.domicilio,...(inm.ccts||[])].join(' '));if(!blob.includes(search))return false}return Number.isFinite(Number(inm.lat))&&Number.isFinite(Number(inm.lon));})}
function render(){const def=currentDef();q('indicatorHelp').textContent=def.help;q('kpiIndLabel').textContent=def.label;markers.clearLayers();const list=filteredInmuebles();const vals=[];let ccts=new Set(),siiTotal=0,indTotal=0,indAny=false;
 for(const inm of list){let v=metricForInmueble(inm,def);if(v!=null&&Number.isFinite(v))vals.push(v);for(const c of inm.ccts||[]){ccts.add(c);siiTotal+=siiCct.get(c)||0;const x=indicatorForCct(c,def);if(x.value!=null&&!def.categorical){indTotal+=x.value;indAny=true}}
 }
 const breaks=quantileBreaks(vals,5);for(const inm of list){const mv=metricForInmueble(inm,def),col=colorForValue(mv,breaks,def);const marker=L.circleMarker([+inm.lat,+inm.lon],{radius:5.5,color:'#fff',weight:1.2,fillColor:col,fillOpacity:.9});marker.on('click',()=>openDetail(inm));marker.addTo(markers)}
 q('kpiCct').textContent=fmt(ccts.size);q('kpiInm').textContent=fmt(list.length);q('kpiSii').textContent=fmt(siiTotal);q('kpiInd').textContent=def.categorical?'—':(indAny?fmt(indTotal):'Sin registro');renderLegend(def,breaks,vals);}
function indicatorForCct(cct,def){if(def.id==='imv')return{value:CTX[cct]?.imv_nivel??null,cat:imvCategory(CTX[cct]?.imv_nivel)};const records=(mobCctIndex[def.dataset]?.get(cct))||[];if(!records.length)return{value:null,cat:null};if(def.categorical){const cats=records.map(r=>r[def.field]).filter(Boolean);return{value:null,cat:cats[0]||null}}const value=records.reduce((s,r)=>s+(Number(r[def.field])||0),0);return{value,cat:null}}
function metricForInmueble(inm,def){if(def.id==='imv'){const cats=(inm.ccts||[]).map(c=>CTX[c]?.imv_nivel).filter(v=>v!=null).map(Number);return cats.length?Math.max(...cats):null}if(def.categorical)return null;let num=0,den=0,any=false;for(const c of inm.ccts||[]){const x=indicatorForCct(c,def);if(x.value!=null){num+=x.value;any=true}den+=siiCct.get(c)||0}if(!any)return null;if(state.metric==='percent')return den?100*num/den:null;return num}
function quantileBreaks(a,n){const x=a.filter(Number.isFinite).sort((a,b)=>a-b);if(!x.length)return[];const out=[];for(let i=1;i<n;i++)out.push(x[Math.min(x.length-1,Math.floor(i*x.length/n))]);return [...new Set(out)]}
function colorForValue(v,b,def){if(v==null)return'#aeb8bf';if(def.id==='imv')return IMV_COLOR[IMV_LABEL[Math.round(v)]]||'#aeb8bf';const ramp=['#dbeafe','#93c5fd','#60a5fa','#2563eb','#163f73'];let i=0;while(i<b.length&&v>b[i])i++;return ramp[Math.min(i,ramp.length-1)]}
function renderLegend(def,b,vals){if(def.categorical){q('legend').innerHTML=`<strong>${def.label}</strong><div class="micro">Consulta la categoría en la ficha del CCT.</div>`;return}if(def.id==='imv'){q('legend').innerHTML=`<strong>${def.label}</strong>`+Object.entries(IMV_COLOR).map(([k,c])=>`<div class="legend-row"><i class="swatch" style="background:${c}"></i>${k}</div>`).join('');return}const unit=state.metric==='percent'?'%':' estudiantes';let html=`<strong>${def.label}</strong><div class="legend-row"><i class="swatch" style="background:#aeb8bf"></i>Sin registro</div>`;if(vals.length){let prev=0;const bs=[...b,Math.max(...vals)];bs.forEach((x,i)=>{const col=colorForValue(i?b[i-1]+.0001:0,b,def);html+=`<div class="legend-row"><i class="swatch" style="background:${col}"></i>${round(prev)} – ${round(x)}${unit}</div>`;prev=x;});}q('legend').innerHTML=html}
function round(v){return state.metric==='percent'?Number(v).toFixed(1):fmt(Math.round(v))}
function openDetail(inm){state.selected=inm;state.selectedCct=inm.ccts?.[0]||null;state.selectedTurn=null;renderDetail();q('detail').classList.remove('hidden')}
function renderDetail(){const inm=state.selected;if(!inm)return;const cct=state.selectedCct;const rec=cctMap.get(cct)||{};const def=currentDef();const ccts=inm.ccts||[];const turns=allTurnsForCct(cct);if(!state.selectedTurn&&turns.length)state.selectedTurn=turns[0];const exact=detailMetric(cct,state.selectedTurn,def);const sii=state.selectedTurn?siiExact.get(`${cct}|${norm(state.selectedTurn)}`):siiCct.get(cct);const pct=exact.value!=null&&sii?100*exact.value/sii:null;
 let html=`<span class="kicker">Inmueble</span><h2>${esc(inm.nombre||'Plantel sin nombre')}</h2><div class="sub">${esc(inm.domicilio||'Domicilio sin registro')} · ${esc(inm.alcaldia||rec.alcaldia||'')}</div>`;
 html+=`<div class="chips">${ccts.map(c=>`<button class="chip ${c===cct?'active':''}" data-cct="${c}">${c}</button>`).join('')}</div>`;
 if(turns.length>1)html+=`<div class="chips">${turns.map(t=>`<button class="chip ${t===state.selectedTurn?'active':''}" data-turn="${esc(t)}">${esc(t)}</button>`).join('')}</div>`;
 html+=`<div class="info-grid"><div class="info"><b>${sii==null?'Sin registro':fmt(sii)}</b><span>Estudiantes SIIEWEB${state.selectedTurn?' · '+esc(state.selectedTurn):''}</span></div><div class="info"><b>${formatMetric(exact,def)}</b><span>${esc(def.label)}</span></div></div>`;
 if(!def.categorical&&def.id!=='imv')html+=`<div class="metric-row"><span>% respecto a SIIEWEB</span><b>${pct==null?'Sin registro':pct.toFixed(1)+'%'}</b></div>`;
 html+=`<div class="metric-row"><span>Nivel educativo</span><b>${esc(rec.nivel||'Sin registro')}</b></div><div class="metric-row"><span>Sostenimiento</span><b>${esc(rec.sostenimiento||'Sin registro')}</b></div><div class="metric-row"><span>Alcaldía</span><b>${esc(rec.alcaldia||inm.alcaldia||'Sin registro')}</b></div>`;
 html+=profileSections(cct,state.selectedTurn,rec.alcaldia||inm.alcaldia);html+=sourceCards(cct,state.selectedTurn);q('detailBody').innerHTML=html;q('detailBody').querySelectorAll('[data-cct]').forEach(b=>b.onclick=()=>{state.selectedCct=b.dataset.cct;state.selectedTurn=null;renderDetail()});q('detailBody').querySelectorAll('[data-turn]').forEach(b=>b.onclick=()=>{state.selectedTurn=b.dataset.turn;renderDetail()});}
function allTurnsForCct(cct){const s=new Set();for(const k of siiExact.keys())if(k.startsWith(cct+'|'))s.add(k.split('|')[1]);for(const m of Object.values(mobIndex))for(const k of m.keys())if(k.startsWith(cct+'|'))s.add(k.split('|')[1]);for(const k of Object.keys(PERF?.perfil_cct_turno||{}))if(k.startsWith(cct+'|'))s.add(k.split('|')[1]);return [...s]}
function detailMetric(cct,turn,def){if(def.id==='imv')return{value:CTX[cct]?.imv_nivel??null,cat:imvCategory(CTX[cct]?.imv_nivel)};const m=mobIndex[def.dataset]||new Map();if(turn){const r=m.get(`${cct}|${norm(turn)}`);if(!r)return{value:null,cat:null};return def.categorical?{value:null,cat:r[def.field]||null}:{value:Number(r[def.field])||0,cat:null}}return indicatorForCct(cct,def)}
function sourceCards(cct,turn){const defs=[...THEMES.nacional,...THEMES.internacional];let html='<div class="source-card"><h3>Lectura comparada</h3>';for(const d of defs){const x=detailMetric(cct,turn,d);html+=`<div class="metric-row"><span>${esc(d.label)}</span><b>${x.value==null?'Sin registro':fmt(x.value)}</b></div>`}const imv=detailMetric(cct,turn,THEMES.contexto[0]);html+=`<div class="metric-row"><span>IMV</span><b>${imv.cat||'Sin registro'}</b></div></div>`;return html}

function profileFor(cct,turn){
 const all=PERF?.perfil_cct_turno||{};
 if(turn&&all[`${cct}|${norm(turn)}`])return all[`${cct}|${norm(turn)}`];
 const pref=Object.keys(all).find(k=>k.startsWith(cct+'|'));
 return pref?all[pref]:null;
}
function valNum(v){const n=Number(v);return Number.isFinite(n)?n:null}
function statBox(label,value,total){
 const n=valNum(value);if(n==null)return'';const pct=total&&Number.isFinite(total)?` · ${(100*n/total).toFixed(1)}%`:'';
 return `<div class="info compact"><b>${fmt(n)}</b><span>${esc(label)}${pct}</span></div>`;
}
function nzRow(label,value){const n=valNum(value);if(n==null||n<=0)return'';return `<div class="metric-row"><span>${esc(label)}</span><b>${fmt(n)}</b></div>`}
function profileSections(cct,turn,alcaldia){
 const r=profileFor(cct,turn);let html='';
 if(r){
  const total=valNum(r['ESTUDIANTES'])||0;
  html+=`<div class="source-card profile-card"><h3>Perfil de estudiantes</h3><div class="info-grid profile-grid">`;
  html+=statBox('Hombres',r['HOMBRES'],total)+statBox('Mujeres',r['MUJERES'],total);
  html+=`</div>`;
  const extras=[['Lengua indígena',r['LENGUA INDÍGENA']],['Grupo étnico',r['GRUPO ÉTNICO']],['Condición o discapacidad',r['CONDICIÓN O DISCAPACIDAD']],['Estudiantes irregulares',r['ESTUDIANTES IRREGULARES']],['CURP con incidencia',r['CURP CON INCIDENCIA']]];
  const extraHtml=extras.map(x=>nzRow(x[0],x[1])).join('');if(extraHtml)html+=`<div class="mini-block"><h4>Características registradas</h4>${extraHtml}</div>`;
  let origin='';
  origin+=nzRow('Nacimiento CURP · CDMX',r['NACIMIENTO CURP CDMX']);
  origin+=nzRow('Nacimiento CURP · otro estado',r['NACIMIENTO CURP OTRO ESTADO']);
  origin+=nzRow('Nacimiento CURP · extranjero',r['NACIMIENTO CURP EXTRANJERO']);
  origin+=nzRow('Nacimiento CURP · no determinado',r['NACIMIENTO CURP NO DETERMINADO']);
  origin+=nzRow('Entidad registrada · CDMX',r['ENTIDAD CDMX']);
  origin+=nzRow('Entidad registrada · otra',r['ENTIDAD OTRA']);
  origin+=nzRow('País registrado · México',r['PAÍS MÉXICO']);
  origin+=nzRow('País registrado · otro',r['PAÍS OTRO']);
  origin+=nzRow('Condición migrante',r['MIGRANTE']);
  origin+=nzRow('Migrante · otra entidad',r['ENTIDAD MIGRANTE OTRA']);
  origin+=nzRow('Migrante · otro país',r['PAÍS MIGRANTE OTRO']);
  if(origin)html+=`<div class="mini-block"><h4>Origen y movilidad · CCT/turno</h4>${origin}</div>`;
  const avg=valNum(r['PROMEDIO PROMEDIO GRADO']),evaln=valNum(r['EVALUADOS PROMEDIO GRADO']);
  if(avg!=null&&avg>0)html+=`<div class="mini-block"><h4>Información académica disponible</h4><div class="metric-row"><span>Promedio de grado</span><b>${avg.toFixed(2)}</b></div>${evaln>0?`<div class="metric-row"><span>Estudiantes evaluados</span><b>${fmt(evaln)}</b></div>`:''}</div>`;
  html+='</div>';
 }
 html+=originAlcaldiaSection(alcaldia);
 return html;
}
function originAlcaldiaSection(alcaldia){
 const d=originAlcNorm.get(norm(alcaldia));if(!d)return'';
 const groups=[
  ['Estados de nacimiento por CURP',d.nacimiento_otro_estado],
  ['Entidades registradas distintas de CDMX',d.entidad_otra],
  ['Entidades de condición migrante',d.entidad_migrante],
  ['Países registrados distintos de México',d.pais_otro],
  ['Países de condición migrante',d.pais_migrante]
 ];
 let body='';
 for(const [title,arr] of groups){if(!arr?.length)continue;const items=arr.filter(x=>Number(x.estudiantes)>0);if(!items.length)continue;body+=`<div class="origin-group"><h4>${esc(title)}</h4><div class="origin-list">${items.map(x=>`<span class="origin-pill"><b>${fmt(x.estudiantes)}</b> ${esc(x.nombre)}</span>`).join('')}</div></div>`;}
 return body?`<div class="source-card territory-origin"><h3>Orígenes observados en ${esc(alcaldia||'la alcaldía')}</h3><p class="micro note">Este desglose nominal está disponible por alcaldía, no por CCT. Solo se muestran orígenes con estudiantes registrados.</p>${body}</div>`:'';
}

function formatMetric(x,def){if(def.categorical||def.id==='imv')return esc(x.cat||'Sin registro');return x.value==null?'Sin registro':fmt(x.value)}
function esc(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
init();
