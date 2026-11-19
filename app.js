// Shabbat Ten public site: loads dinners from Supabase and sends applications.
const sb = window.supabase.createClient(ST_CONFIG.SUPABASE_URL, ST_CONFIG.SUPABASE_ANON_KEY);
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const DAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"], MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmt(d){const x=new Date(d+"T12:00:00");return {long:`${DAYS[x.getDay()]}, ${MON[x.getMonth()]} ${x.getDate()}`,dd:String(x.getDate()).padStart(2,"0")+"."+String(x.getMonth()+1).padStart(2,"0")}}

let DINNERS=[], cur=null, seat=null, selfieBlob=null;

function split(d){
  const lm=Math.max(0,d.seats_m-d.taken_m), lf=Math.max(0,d.seats_f-d.taken_f);
  return `<div class="split"><div class="m"><b>GUYS</b><span>${lm} <small>of ${d.seats_m} left</small></span></div><div class="f"><b>GIRLS</b><span>${lf} <small>of ${d.seats_f} left</small></span></div></div>`;
}
function renderList(){
  const list=$("list");
  if(!DINNERS.length){list.innerHTML=`<p class="hint" style="grid-column:1/-1">The next tables are being set. Check back soon.</p>`;return}
  list.innerHTML=DINNERS.map(d=>{const f=fmt(d.dinner_date);const full=d.taken_m>=d.seats_m&&d.taken_f>=d.seats_f;return `<button class="card${full?" full":""}" type="button" data-id="${d.id}">
    <img src="${esc(d.image_url)}" alt="" loading="lazy">
    <div class="body">
      <div class="top"><div><div class="eyebrow">${esc(d.neighborhood)}</div><h3>${esc(d.title)}</h3></div><div class="date">${f.dd}${d.candles?`<small>candles ${esc(d.candles)}</small>`:""}</div></div>
      <div class="meta">Doors ${esc(d.doors)}${d.ages?` · Ages ${esc(d.ages)}`:""} · ₪${d.price} a seat</div>
      ${split(d)}
      <span class="cta">${full?"Join the waitlist":"Request a seat"}</span>
    </div></button>`}).join("");
}
async function load(){
  $("list").innerHTML=`<p class="hint" style="grid-column:1/-1">Loading dinners…</p>`;
  const {data,error}=await sb.from("dinners_public").select("*").order("dinner_date");
  if(error){$("list").innerHTML=`<p class="hint" style="grid-column:1/-1">We couldn't load the dinners right now. Please refresh in a moment.</p>`;return}
  DINNERS=data.slice(0,1);renderList();
}
$("list").addEventListener("click",e=>{const c=e.target.closest(".card");if(c)openEvent(c.dataset.id)});

function show(v){["home","event","apply","done"].forEach(k=>$("v-"+k).hidden=k!==v);window.scrollTo(0,0);
  const vid=$("heroVid");try{v==="home"?vid.play():vid.pause()}catch(e){}}
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>show(b.dataset.go)));
$("logo").onclick=()=>show("home");
$("hdrApply").onclick=()=>{show("home");$("list").scrollIntoView({behavior:"smooth"})};
$("backToEvent").onclick=()=>show("event");

function openEvent(id){
  cur=DINNERS.find(d=>d.id===id);seat=null;const f=fmt(cur.dinner_date);
  $("evImg").src=cur.image_url;$("evImg").alt=cur.title+" Shabbat table";
  $("evTitle").innerHTML=`${esc(cur.title)} <em style="color:var(--coral)">${f.dd}</em>`;
  $("evMeta").textContent=`${f.long} · ${cur.neighborhood}, Tel Aviv–Yafo${cur.candles?` · Candle lighting ${cur.candles}`:""}`;
  $("evDesc").textContent=cur.description;
  const fact=(k,v)=>v?`<div><span>${k}</span>${esc(v)}</div>`:"";
  $("evFacts").innerHTML=fact("Doors",cur.doors)+fact("Ages",cur.ages)+fact("Where",cur.venue)+fact("Dress",cur.dress)+
    `<div><span>Table</span>${cur.seats_m+cur.seats_f} guests · ${cur.seats_m} + ${cur.seats_f}</div><div><span>Address</span>Sent after approval</div>`;
  $("evMenuWrap").hidden=!cur.menu?.length;
  $("evMenu").innerHTML=(cur.menu||[]).map(m=>`<li>${esc(m)}</li>`).join("");
  renderTickets();show("event");
}
function renderTickets(){
  const lm=Math.max(0,cur.seats_m-cur.taken_m), lf=Math.max(0,cur.seats_f-cur.taken_f);
  const t=(g,label,left,total)=>`<button class="ticket ${g==="f"?"f":""}" type="button" data-g="${g}" aria-pressed="${seat===g}">
    <span class="ic">${g==="m"?"M":"F"}</span><span class="t"><b>${label}</b><small>${left?`${left} of ${total} left · dinner, wine, the works`:"Full right now · apply for the waitlist"}</small></span><span class="p">₪${cur.price}</span></button>`;
  $("tickets").innerHTML=t("m","Guy's seat",lm,cur.seats_m)+t("f","Girl's seat",lf,cur.seats_f);
  const b=$("toApply");b.disabled=!seat;b.textContent=seat?"Continue to application →":"Select a seat to apply";
}
$("tickets").addEventListener("click",e=>{const b=e.target.closest(".ticket");if(!b)return;seat=b.dataset.g;renderTickets()});
$("toApply").onclick=()=>openApply();

function openApply(keep){
  const f=fmt(cur.dinner_date);
  $("sum").innerHTML=`<img src="${esc(cur.image_url)}" alt=""><div><div class="eyebrow">${f.long} · ${esc(cur.neighborhood)}</div><b>${esc(cur.title)}</b><div class="hint">${seat==="m"?"Guy's":"Girl's"} seat · ₪${cur.price}, paid by Bit only if approved</div></div>`;
  document.querySelectorAll('input[name=gender]').forEach(r=>r.checked=r.value===seat);
  if(!keep)show("apply");
}
$("genderSeg").addEventListener("change",e=>{seat=e.target.value;openApply(true)});

// Selfie: shrink to ~900px JPEG before upload
function shrink(file){return new Promise((res,rej)=>{const img=new Image();img.onload=()=>{const s=Math.min(1,900/Math.max(img.width,img.height));const c=document.createElement("canvas");c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext("2d").drawImage(img,0,0,c.width,c.height);c.toBlob(b=>b?res(b):rej(new Error("Could not read photo")),"image/jpeg",.82);URL.revokeObjectURL(img.src)};img.onerror=()=>rej(new Error("Could not read photo"));img.src=URL.createObjectURL(file)})}
["cam","up"].forEach(id=>$(id).addEventListener("change",async e=>{
  const f=e.target.files[0];if(!f)return;
  try{selfieBlob=await shrink(f);$("ph").innerHTML=`<img src="${URL.createObjectURL(selfieBlob)}" alt="Your selfie preview">`;mark("selfie",true)}
  catch(err){selfieBlob=null;mark("selfie",false)}
}));

function ageOf(v){if(!v)return null;const b=new Date(v),n=new Date();let a=n.getFullYear()-b.getFullYear();const m=n.getMonth()-b.getMonth();if(m<0||(m===0&&n.getDate()<b.getDate()))a--;return a}
$("dob").addEventListener("input",e=>{const a=ageOf(e.target.value);$("age").textContent=a!=null&&a>0?`· ${a}`:""});

$("obsSeg").addEventListener("change",e=>{const o=e.target.value==="other";$("obsOther").hidden=!o;if(o)$("obsOther").focus()});

function mark(f,ok){document.querySelector(`[data-f="${f}"]`).classList.toggle("invalid",!ok);return ok}
$("form").addEventListener("submit",async e=>{
  e.preventDefault();
  const v=id=>$(id).value.trim();
  const a=ageOf(v("dob"));
  $("dobErr").textContent=a!=null&&a<18?"You need to be 18 or older to apply.":"Enter your date of birth.";
  const rel=document.querySelector('input[name=rel]:checked');
  const obs=document.querySelector('input[name=obs]:checked'), kosher=document.querySelector('input[name=kosher]:checked');
  $("obsErr").textContent=obs&&obs.value==="other"?"Tell us a little about how you observe.":"Choose your level of observance.";
  const checks=[
    mark("name",v("name").split(/\s+/).length>=2),
    mark("email",/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v("email"))),
    mark("phone",v("phone").replace(/\D/g,"").length>=7),
    mark("social",v("social").length>=3),
    mark("selfie",!!selfieBlob),
    mark("dob",a!=null&&a>=18&&a<100),
    mark("country",!!v("country")),
    mark("rel",!!rel),
    mark("obs",!!obs&&(obs.value!=="other"||v("obsOther").length>=2)),
    mark("kosher",!!kosher),
    mark("ok",$("ok").checked)];
  if(checks.includes(false)){document.querySelector(".invalid").scrollIntoView({behavior:"smooth",block:"center"});return}

  const btn=$("submitBtn"), err=$("submitErr");
  btn.disabled=true;btn.textContent="Sending…";err.hidden=true;
  try{
    const id=crypto.randomUUID();
    const path=`${cur.id}/${id}.jpg`;
    const up=await sb.storage.from("selfies").upload(path,selfieBlob,{contentType:"image/jpeg",upsert:false});
    if(up.error)throw up.error;
    const phone=v("cc")+" "+v("phone").replace(/[^\d ]/g,"").replace(/^0+/,"");
    const ins=await sb.from("applications").insert({id,dinner_id:cur.id,seat,full_name:v("name"),email:v("email"),phone,
      social:v("social"),selfie_path:path,dob:v("dob"),country:v("country"),relationship:rel.value,observance:obs.value,observance_other:obs.value==="other"?v("obsOther"):"",kashrut:kosher.value,bio:v("bio")});
    if(ins.error)throw ins.error;
    const first=v("name").split(/\s+/)[0], f=fmt(cur.dinner_date);
    $("doneH").innerHTML=`Thank you, ${esc(first)}. <em>You're in review.</em>`;
    $("doneP").textContent=`Our hosts are setting the table for ${cur.title} on ${f.long}. We'll message you on WhatsApp with a yes, a waitlist spot, or a not-this-time.`;
    $("appId").textContent="Application ST-"+id.slice(0,6).toUpperCase();
    $("form").reset();$("obsOther").hidden=true;selfieBlob=null;$("age").textContent="";
    $("ph").innerHTML=`<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--lilac)" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="9" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>`;
    show("done");
  }catch(ex){
    err.textContent="Something went wrong sending your application. Check your connection and try again. ("+(ex.message||"error")+")";err.hidden=false;
  }finally{btn.disabled=false;btn.textContent="Send my application"}
});
$("form").addEventListener("input",e=>{const w=e.target.closest(".f-item");if(w)w.classList.remove("invalid")});
$("form").addEventListener("change",e=>{const w=e.target.closest(".f-item");if(w)w.classList.remove("invalid")});

load();
