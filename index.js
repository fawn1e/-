// Guild Quest Board v6.0 — SillyTavern Extension
import { setExtensionPrompt, extension_prompt_types, extension_prompt_roles } from '../../../../script.js';
import { eventSource, event_types } from '../../../../script.js';

const EXT_ID = 'guild-quest-board';
const KEY_PROFILE = 'gq6_profile';
const KEY_ACTIVE = 'gq6_active';
const KEY_BOARD = 'gq6_board';
const KEY_COMPLETED = 'gq6_completed';
const KEY_UI = 'gq6_ui';
const KEY_EXTRA_API = 'gq6_extra_api';

const RANKS = ['F','E','D','C','B','A','S','SS','SSS'];
const RANK_TH = {F:0,E:3,D:8,C:18,B:35,A:60,S:100,SS:160,SSS:240};
const RANK_REP = {F:5,E:10,D:20,C:40,B:80,A:150,S:300,SS:600,SSS:1200};

const QT = {
    STORY:{ru:'Сюжетный',icon:'\u2726'},GUILD:{ru:'Гильдейский',icon:'\u2694'},
    SIDE:{ru:'Побочный',icon:'\u25C6'},URGENT:{ru:'Срочный',icon:'\u26A0'},
    DAILY:{ru:'Ежедневный',icon:'\u2600'},HUNT:{ru:'Охота',icon:'\uD83C\uDFF9'},
    ESCORT:{ru:'Сопровождение',icon:'\uD83D\uDEE1'},DUNGEON:{ru:'Подземелье',icon:'\uD83D\uDDDD'},
    INVESTIGATE:{ru:'Расследование',icon:'\uD83D\uDD0D'},SPECIAL:{ru:'Особое',icon:'\u2605'},
    RAID:{ru:'Рейд',icon:'\u2620'},
};

const TITLES = [
    {id:'newbie',name:'Новичок',c:p=>p.completed>=1},
    {id:'reliable',name:'Надёжный',c:p=>p.completed>=10},
    {id:'veteran',name:'Ветеран',c:p=>p.completed>=25},
    {id:'hero',name:'Герой Гильдии',c:p=>p.completed>=50},
    {id:'legend',name:'Легенда',c:p=>p.completed>=100},
    {id:'hunter',name:'Охотник',c:p=>(p.byType||{}).HUNT>=10},
    {id:'detective',name:'Сыщик',c:p=>(p.byType||{}).INVESTIGATE>=5},
    {id:'dungeoneer',name:'Покоритель Подземелий',c:p=>(p.byType||{}).DUNGEON>=10},
    {id:'crisis',name:'Решающий Кризисы',c:p=>(p.byType||{}).URGENT>=15},
    {id:'rich',name:'Богач',c:p=>p.gold>=10000},
    {id:'flawless',name:'Безупречный',c:p=>p.completed>=20&&(p.failed||0)===0},
];

const ACHS = [
    {id:'first',name:'Первый шаг',desc:'Первое задание',c:p=>p.completed>=1},
    {id:'ten',name:'Постоянный клиент',desc:'10 заданий',c:p=>p.completed>=10},
    {id:'rE',name:'За пределами F',desc:'Ранг E',c:p=>RANKS.indexOf(p.rank)>=1},
    {id:'rC',name:'Не новичок',desc:'Ранг C',c:p=>RANKS.indexOf(p.rank)>=3},
    {id:'rA',name:'Элита',desc:'Ранг A',c:p=>RANKS.indexOf(p.rank)>=5},
    {id:'rS',name:'S-класс',desc:'Ранг S',c:p=>RANKS.indexOf(p.rank)>=6},
    {id:'rSSS',name:'Вершина мира',desc:'Ранг SSS',c:p=>RANKS.indexOf(p.rank)>=8},
    {id:'g1k',name:'Тысячник',desc:'1000 золота',c:p=>p.gold>=1000},
    {id:'g10k',name:'Богач',desc:'10000 золота',c:p=>p.gold>=10000},
    {id:'noFail',name:'Безошибочный',desc:'20 без провала',c:p=>p.completed>=20&&(p.failed||0)===0},
];

// ── Regex ──
const BOARD_JSON_RE = /<guild_board>\s*([\s\S]*?)\s*<\/guild_board>/i;
const LEGACY_G_RE = /\[Guild\|([^|\]]*)\|([^|\]]*)\|([^\]]*)\]/i;
const LEGACY_Q_RE = /\[Q\d+\|([^|\]]*)\|([^|\]]*)\|([^|\]]*)\|([^|\]]*)\|([^|\]]*)\|([^|\]]*)\|([^\]]*)\]/g;
const DONE_RE = /<gq_done>([\s\S]*?)<\/gq_done>/gi;
const TRIGGER_RE = /(гильди|доск[ае]\s+объявлен|quest\s+board|guild\s+board|подош[её]л\s+к\s+доск|подошла\s+к\s+доск|заш[её]л\s+в\s+гильди|зашла\s+в\s+гильди)/i;

// Tags to remove from visible chat
const SCRUB_RE = [
    /<guild_board\b[^>]*>[\s\S]*?<\/guild_board>/gi,
    /<guild_active\b[^>]*>[\s\S]*?<\/guild_active>/gi,
    /<guild_quests\b[^>]*>[\s\S]*?<\/guild_quests>/gi,
    /<gq_done\b[^>]*>[\s\S]*?<\/gq_done>/gi,
    /<gq_fail\b[^>]*>[\s\S]*?<\/gq_fail>/gi,
    /<gq_reward\b[^>]*>[\s\S]*?<\/gq_reward>/gi,
    /<gq_rep\b[^>]*>[\s\S]*?<\/gq_rep>/gi,
    /&lt;guild_board&gt;[\s\S]*?&lt;\/guild_board&gt;/gi,
    /&lt;guild_active&gt;[\s\S]*?&lt;\/guild_active&gt;/gi,
    /&lt;guild_quests&gt;[\s\S]*?&lt;\/guild_quests&gt;/gi,
    /&lt;gq_done&gt;[\s\S]*?&lt;\/gq_done&gt;/gi,
    /&lt;gq_fail&gt;[\s\S]*?&lt;\/gq_fail&gt;/gi,
    /&lt;gq_reward&gt;[\s\S]*?&lt;\/gq_reward&gt;/gi,
    /&lt;gq_rep&gt;[\s\S]*?&lt;\/gq_rep&gt;/gi,
];
// Raw bracket markup that leaks into chat
const SCRUB_BRACKET = [
    /\[Guild\|[^\]\r\n]{1,200}\]/g,
    /\[Q\d+\|[^\]\r\n]{1,400}\]/g,
];

// ── State ──
let _panelOpen = false, _curTab = 'board', _board = null, _active = null;
let _completed = {};
let _ui = null;
let _extraApi = null;
let _wantBoard = false, _injected = false;
let _lastBoardNoticeSig = '';

// ── Helpers ──
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function rCls(r){r=String(r||'').trim().toUpperCase();return 'gq-r'+(RANKS.indexOf(r)>=0?r:'F');}
function pGold(s){var m=String(s||'').match(/(\d+)/);return m?parseInt(m[1],10):0;}
function jLoad(k,d){try{var v=JSON.parse(localStorage.getItem(k));return v!=null?v:d;}catch(e){return d;}}
function jSave(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
function tryJSON(s){try{return JSON.parse(s);}catch(e){return null;}}

// ── Profile ──
function defProfile(){return{name:'Авантюрист',rank:'F',gold:0,completed:0,failed:0,byType:{},history:[],reputation:{},titles:[],activeTitle:'',achievements:[]};}
function getProfile(){
    var p=jLoad(KEY_PROFILE,null);
    if(!p||typeof p.gold!=='number')return defProfile();
    var d=defProfile();for(var k in d)if(p[k]===undefined)p[k]=d[k];
    return p;
}
function saveProfile(p){jSave(KEY_PROFILE,p);}
function calcRank(p){var r='F';for(var i=0;i<RANKS.length;i++)if(p.completed>=RANK_TH[RANKS[i]])r=RANKS[i];return r;}
function defUI(){return{fab:{x:null,y:null},panel:{x:null,y:null,w:null,h:null}};}
function defExtraApi(){return{enabled:false,url:'',key:'',model:'',headers:{}};}
function normExtraApi(c){
    var d=defExtraApi();
    if(!c||typeof c!=='object')return d;
    d.enabled=!!c.enabled;
    d.url=String(c.url||'').trim();
    d.key=String(c.key||'').trim();
    d.model=String(c.model||'').trim();
    d.headers=(c.headers&&typeof c.headers==='object')?c.headers:{};
    return d;
}
function getExtraApi(){
    if(!_extraApi)_extraApi=normExtraApi(jLoad(KEY_EXTRA_API,defExtraApi()));
    return _extraApi;
}
function saveExtraApi(cfg){
    _extraApi=normExtraApi(cfg);
    jSave(KEY_EXTRA_API,_extraApi);
    return _extraApi;
}
function normUI(u){
    var d=defUI();
    if(!u||typeof u!=='object')return d;
    if(!u.fab||typeof u.fab!=='object')u.fab={};
    if(!u.panel||typeof u.panel!=='object')u.panel={};
    d.fab.x=typeof u.fab.x==='number'?u.fab.x:null;
    d.fab.y=typeof u.fab.y==='number'?u.fab.y:null;
    d.panel.x=typeof u.panel.x==='number'?u.panel.x:null;
    d.panel.y=typeof u.panel.y==='number'?u.panel.y:null;
    d.panel.w=typeof u.panel.w==='number'?u.panel.w:null;
    d.panel.h=typeof u.panel.h==='number'?u.panel.h:null;
    return d;
}
function loadState(){
    _board=jLoad(KEY_BOARD,null);
    _active=jLoad(KEY_ACTIVE,null);
    _completed=jLoad(KEY_COMPLETED,{});
    if(!_completed||typeof _completed!=='object')_completed={};
    _ui=normUI(jLoad(KEY_UI,defUI()));
    applyCompletedFilter();
}
function saveState(){
    if(_board)jSave(KEY_BOARD,_board);else localStorage.removeItem(KEY_BOARD);
    if(_active)jSave(KEY_ACTIVE,_active);else localStorage.removeItem(KEY_ACTIVE);
    if(_completed&&Object.keys(_completed).length)jSave(KEY_COMPLETED,_completed);else localStorage.removeItem(KEY_COMPLETED);
    if(_ui)jSave(KEY_UI,_ui);else localStorage.removeItem(KEY_UI);
}

function questSig(q){
    if(!q)return '';
    return [
        String(q.title||'').trim().toLowerCase(),
        String(q.client||'').trim().toLowerCase(),
        String(q.location||'').trim().toLowerCase(),
        String(q.deadline||'').trim().toLowerCase(),
        String(q.type||'GUILD').trim().toUpperCase(),
        String(q.diff||'F').trim().toUpperCase()
    ].join('|');
}
function applyCompletedFilter(){
    if(!_board||!Array.isArray(_board.quests))return;
    _board.quests=_board.quests.filter(function(q){
        var sig=questSig(q);
        return sig?!_completed[sig]:true;
    });
}
function vpW(){return Math.max(document.documentElement.clientWidth||0,window.innerWidth||0);}
function vpH(){return Math.max(document.documentElement.clientHeight||0,window.innerHeight||0);}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function panelMinW(){return vpW()<=768?280:340;}
function panelMinH(){return vpW()<=768?260:300;}
function panelMaxW(){return Math.max(panelMinW(),vpW()-12);}
function panelMaxH(){return Math.max(panelMinH(),vpH()-12);}

function applyUILayout(){
    var fab=document.getElementById('gq-fab');
    var panel=document.getElementById('gq-panel');
    if(!_ui)_ui=defUI();
    if(fab){
        if(typeof _ui.fab.x==='number'&&typeof _ui.fab.y==='number'){
            var fr=fab.getBoundingClientRect(),fw=fr.width||52,fh=fr.height||52;
            var fx=clamp(_ui.fab.x,4,Math.max(4,vpW()-fw-4));
            var fy=clamp(_ui.fab.y,4,Math.max(4,vpH()-fh-4));
            _ui.fab.x=fx;_ui.fab.y=fy;
            fab.style.left=fx+'px';fab.style.top=fy+'px';fab.style.right='auto';fab.style.bottom='auto';
        }else{
            fab.style.left='';fab.style.top='';fab.style.right='';fab.style.bottom='';
        }
    }
    if(panel){
        if(typeof _ui.panel.w==='number')panel.style.width=clamp(_ui.panel.w,panelMinW(),panelMaxW())+'px';else panel.style.width='';
        if(typeof _ui.panel.h==='number')panel.style.height=clamp(_ui.panel.h,panelMinH(),panelMaxH())+'px';else panel.style.height='';
        if(typeof _ui.panel.x==='number'&&typeof _ui.panel.y==='number'){
            panel.style.left=_ui.panel.x+'px';panel.style.top=_ui.panel.y+'px';panel.style.right='auto';panel.style.bottom='auto';
        }else{
            panel.style.left='';panel.style.top='';panel.style.right='';panel.style.bottom='';
        }
        var pr=panel.getBoundingClientRect(),pw=pr.width,ph=pr.height;
        var px=typeof _ui.panel.x==='number'?_ui.panel.x:pr.left,py=typeof _ui.panel.y==='number'?_ui.panel.y:pr.top;
        var nx=clamp(px,4,Math.max(4,vpW()-pw-4)),ny=clamp(py,4,Math.max(4,vpH()-ph-4));
        if(nx!==px||ny!==py){
            panel.style.left=nx+'px';panel.style.top=ny+'px';panel.style.right='auto';panel.style.bottom='auto';
            _ui.panel.x=nx;_ui.panel.y=ny;saveState();
        }
    }
}

function checkUnlocks(p){
    var nt=[],na=[];
    for(var t of TITLES)if(!p.titles.includes(t.id)&&t.c(p)){p.titles.push(t.id);nt.push(t.name);}
    for(var a of ACHS)if(!p.achievements.includes(a.id)&&a.c(p)){p.achievements.push(a.id);na.push(a.name);}
    return{titles:nt,achs:na};
}
function boardSig(board){
    if(!board||!Array.isArray(board.quests))return '';
    return (board.guild||'')+'|'+(board.rank||'')+'|'+board.quests.map(function(q){
        return [q.title,q.diff,q.type,q.reward,q.client,q.deadline,q.location].join('#');
    }).join('|');
}
function notifyDesktop(title,body){
    try{
        if(!('Notification' in window))return;
        if(Notification.permission!=='granted')return;
        new Notification(title||'Guild Quest', {body:String(body||'')});
    }catch(e){}
}
function notify(text,type,desktopTitle){
    toast(text,type);
    notifyDesktop(desktopTitle||'Guild Quest',text);
}
function notifyBoardAvailable(board){
    if(!board||!Array.isArray(board.quests)||!board.quests.length)return;
    var sig=boardSig(board);
    if(sig&&sig===_lastBoardNoticeSig)return;
    _lastBoardNoticeSig=sig||_lastBoardNoticeSig;
    notify('📜 Доступно заданий: '+board.quests.length,'info','Новые задания гильдии');
}
function applyBoard(board,opts){
    if(!board||!board.quests||!board.quests.length)return false;
    _board=board;
    applyCompletedFilter();
    saveState();
    if(!(opts&&opts.silent))notifyBoardAvailable(_board);
    if(!_panelOpen){openPanel();switchTab('board');}else renderBoard();
    updateBadge();
    return true;
}
function parseDoneListFromAny(raw){
    if(!raw)return [];
    var out=[],s=String(raw||''),m;
    try{
        var j=typeof raw==='string'?tryJSON(raw):raw;
        if(j&&typeof j==='object'){
            var arr=Array.isArray(j.done)?j.done:(Array.isArray(j.objectives)?j.objectives:[]);
            for(var i=0;i<arr.length;i++)if(arr[i])out.push(String(arr[i]).trim());
            return out.filter(Boolean);
        }
    }catch(e){}
    var re=new RegExp(DONE_RE.source,'gi');
    while((m=re.exec(s))!==null){if((m[1]||'').trim())out.push((m[1]||'').trim());}
    return out.filter(Boolean);
}
async function fetchExtraApi(payload){
    var cfg=getExtraApi();
    if(!cfg.enabled||!cfg.url)return null;
    var headers={'Content-Type':'application/json'};
    if(cfg.key){headers.Authorization='Bearer '+cfg.key;headers['X-API-Key']=cfg.key;}
    for(var hk in cfg.headers){if(cfg.headers[hk]!=null)headers[String(hk)]=String(cfg.headers[hk]);}
    var body={model:cfg.model||undefined,input:payload,payload:payload,task:payload&&payload.task?payload.task:undefined};
    try{
        var res=await fetch(cfg.url,{method:'POST',headers:headers,body:JSON.stringify(body)});
        if(!res.ok)return null;
        var txt=await res.text();
        return tryJSON(txt)||txt;
    }catch(e){return null;}
}
async function requestBoardFromExtraApi(){
    var cfg=getExtraApi();
    if(!cfg.enabled||!cfg.url)return false;
    var ctx=null;
    try{if(typeof SillyTavern!=='undefined'&&SillyTavern.getContext)ctx=SillyTavern.getContext();else if(typeof getContext==='function')ctx=getContext();}catch(e){}
    var chat=(ctx&&Array.isArray(ctx.chat)?ctx.chat:[]).slice(-16).map(function(m){
        return{role:m&&m.is_user?'user':'assistant',text:String((m&&m.mes)||'')};
    });
    var payload={task:'generate_guild_board',profile:getProfile(),chat:chat,active:_active};
    var raw=await fetchExtraApi(payload);
    if(!raw)return false;
    var board=null;
    if(raw&&typeof raw==='object'&&!Array.isArray(raw)){
        if(raw.board&&Array.isArray(raw.board.quests))board=normBoard(raw.board);
        else if(raw.guild&&Array.isArray(raw.quests))board=normBoard(raw);
        else if(raw.output_text)board=parseBoard(String(raw.output_text||''));
        else if(raw.text)board=parseBoard(String(raw.text||''));
    }else board=parseBoard(String(raw||''));
    if(board&&board.quests&&board.quests.length){
        applyBoard(board);
        _wantBoard=false;
        if(_injected)clearPrompt();
        return true;
    }
    return false;
}
async function trackObjectivesByExtraApi(text){
    var cfg=getExtraApi();
    if(!cfg.enabled||!cfg.url||!_active||!text)return false;
    var payload={task:'track_guild_objectives',activeQuest:_active,message:String(text||'')};
    var raw=await fetchExtraApi(payload);
    if(!raw)return false;
    var done=parseDoneListFromAny(raw);
    if(!done.length)return false;
    var tagText=done.map(function(d){return'<gq_done>'+d+'</gq_done>';}).join('');
    return autoCheck(tagText);
}
async function requestNotificationPermission(){
    try{
        if(!('Notification' in window))return 'unsupported';
        if(Notification.permission==='granted')return 'granted';
        if(Notification.permission==='denied')return 'denied';
        return await Notification.requestPermission();
    }catch(e){return 'error';}
}

// ── Parse ──
function parseBoard(text){
    if(!text)return null;
    var m=text.match(BOARD_JSON_RE);
    if(m){
        var inner=(m[1]||'').trim();
        var i=inner.indexOf('{'),j=inner.lastIndexOf('}');
        if(i>=0&&j>i){var d=tryJSON(inner.slice(i,j+1));if(d&&Array.isArray(d.quests))return normBoard(d);}
        var leg=parseLegacy(inner);if(leg)return leg;
    }
    return parseLegacy(text);
}
function parseLegacy(text){
    var g=text.match(LEGACY_G_RE);if(!g)return null;
    var qs=[],re=new RegExp(LEGACY_Q_RE.source,'g'),m;
    while((m=re.exec(text))!==null){
        qs.push({id:'q'+(qs.length+1),title:(m[1]||'').trim(),desc:(m[2]||'').trim(),
            diff:(m[3]||'').trim().toUpperCase(),reward:(m[4]||'').trim(),
            client:(m[5]||'').trim(),deadline:(m[6]||'').trim(),type:'GUILD',
            objs:(m[7]||'').split('//').map(function(s){return s.trim();}).filter(Boolean).map(function(t){return{text:t,done:false};})
        });
    }
    if(!qs.length)return null;
    return normBoard({guild:(g[1]||'').trim()||'Гильдия',loc:(g[2]||'').trim(),rank:(g[3]||'').trim().toUpperCase(),quests:qs});
}
function normBoard(b){
    if(!b||!Array.isArray(b.quests))return null;
    b.guild=b.guild||'Гильдия';b.loc=b.loc||'';b.rank=String(b.rank||'F').toUpperCase();
    b.quests=b.quests.map(normQuest).filter(Boolean);return b;
}
function normQuest(q){
    if(!q)return null;
    var objs=Array.isArray(q.objs)?q.objs:(Array.isArray(q.objectives)?q.objectives:[]);
    return{
        id:q.id||'q'+Math.random().toString(36).slice(2,8),
        title:String(q.title||'Задание').trim(),
        desc:String(q.desc||q.description||'').trim(),
        diff:String(q.diff||q.difficulty||'F').toUpperCase(),
        type:String(q.type||'GUILD').toUpperCase(),
        reward:String(q.reward||'').trim(),
        client:String(q.client||'').trim(),
        deadline:String(q.deadline||'').trim(),
        location:String(q.location||'').trim(),
        notes:String(q.notes||'').trim(),
        storyLink:!!q.storyLink,
        objs:objs.map(function(o){return typeof o==='string'?{text:o,done:false}:{text:String(o.text||'').trim(),done:!!o.done};}).filter(function(o){return o.text;})
    };
}

// ── Scrub tags from chat ──
function scrubChat(){
    var msgs=document.querySelectorAll('.mes_text');
    var marker='<details class="gq-tech-hidden"><summary>⚙ Служебные данные гильдии скрыты</summary></details>';
    for(var i=0;i<msgs.length;i++){
        var el=msgs[i], h=el.innerHTML;
        if(!h)continue;
        var orig=h;
        var touched=false;
        function mark(){touched=true;return '';}
        for(var r=0;r<SCRUB_RE.length;r++) h=h.replace(SCRUB_RE[r],mark);
        for(var r=0;r<SCRUB_BRACKET.length;r++) h=h.replace(SCRUB_BRACKET[r],mark);
        h=h.replace(/```(?:json|xml|txt)?\s*(?:<guild_board>[\s\S]*?<\/guild_board>|\[Guild\|[\s\S]*?\])\s*```/gi,function(){touched=true;return '';});
        // Clean empty paragraphs left behind
        h=h.replace(/<p>\s*<\/p>/gi,'');
        if(touched&&h.indexOf('gq-tech-hidden')===-1)h=marker+h;
        if(h!==orig) el.innerHTML=h;
    }
}

// ── Toast ──
function toast(text,type){
    var old=document.querySelector('.gq-toast');if(old)old.remove();
    var t=document.createElement('div');
    t.className='gq-toast'+(type?' gq-toast-'+type:'');
    t.textContent=text;
    document.body.appendChild(t);
    setTimeout(function(){t.classList.add('out');},2800);
    setTimeout(function(){t.remove();},3300);
}

function resetUILayout(showToast){
    _ui=defUI();
    saveState();
    applyUILayout();
    if(showToast)toast('\u21BB Положение и размер виджета сброшены','info');
}

function initWidgetInteractions(fab,panel,dragHandle,resizeHandle){
    if(!fab||!panel)return;

    function enableFabDrag(){
        var st={on:false,id:null,sx:0,sy:0,ox:0,oy:0,moved:false};
        fab.addEventListener('pointerdown',function(e){
            if(e.button!==undefined&&e.button!==0)return;
            e.preventDefault();e.stopPropagation();
            var r=fab.getBoundingClientRect();
            st.on=true;st.id=e.pointerId;st.sx=e.clientX;st.sy=e.clientY;st.ox=r.left;st.oy=r.top;st.moved=false;
            try{fab.setPointerCapture(e.pointerId);}catch(err){}
        });
        fab.addEventListener('pointermove',function(e){
            if(!st.on||e.pointerId!==st.id)return;
            var dx=e.clientX-st.sx,dy=e.clientY-st.sy;
            if(Math.abs(dx)>4||Math.abs(dy)>4)st.moved=true;
            var r=fab.getBoundingClientRect();
            var nx=clamp(st.ox+dx,4,Math.max(4,vpW()-r.width-4));
            var ny=clamp(st.oy+dy,4,Math.max(4,vpH()-r.height-4));
            fab.style.left=nx+'px';fab.style.top=ny+'px';fab.style.right='auto';fab.style.bottom='auto';
        });
        function finish(e){
            if(!st.on||e.pointerId!==st.id)return;
            try{fab.releasePointerCapture(e.pointerId);}catch(err){}
            st.on=false;
            if(st.moved){
                var r=fab.getBoundingClientRect();
                _ui.fab.x=r.left;_ui.fab.y=r.top;saveState();
            }else togglePanel();
        }
        fab.addEventListener('pointerup',finish);
        fab.addEventListener('pointercancel',finish);
    }

    function enablePanelDrag(){
        if(!dragHandle)return;
        var st={on:false,id:null,sx:0,sy:0,ox:0,oy:0};
        dragHandle.addEventListener('pointerdown',function(e){
            if(e.button!==undefined&&e.button!==0)return;
            e.preventDefault();e.stopPropagation();
            var r=panel.getBoundingClientRect();
            st.on=true;st.id=e.pointerId;st.sx=e.clientX;st.sy=e.clientY;st.ox=r.left;st.oy=r.top;
            panel.style.right='auto';panel.style.bottom='auto';
            try{dragHandle.setPointerCapture(e.pointerId);}catch(err){}
        });
        dragHandle.addEventListener('pointermove',function(e){
            if(!st.on||e.pointerId!==st.id)return;
            var r=panel.getBoundingClientRect();
            var nx=clamp(st.ox+(e.clientX-st.sx),4,Math.max(4,vpW()-r.width-4));
            var ny=clamp(st.oy+(e.clientY-st.sy),4,Math.max(4,vpH()-r.height-4));
            panel.style.left=nx+'px';panel.style.top=ny+'px';
        });
        function finish(e){
            if(!st.on||e.pointerId!==st.id)return;
            try{dragHandle.releasePointerCapture(e.pointerId);}catch(err){}
            st.on=false;
            var r=panel.getBoundingClientRect();
            _ui.panel.x=r.left;_ui.panel.y=r.top;saveState();
        }
        dragHandle.addEventListener('pointerup',finish);
        dragHandle.addEventListener('pointercancel',finish);
    }

    function enablePanelResize(){
        if(!resizeHandle)return;
        var st={on:false,id:null,sx:0,sy:0,ow:0,oh:0};
        resizeHandle.addEventListener('pointerdown',function(e){
            if(e.button!==undefined&&e.button!==0)return;
            e.preventDefault();e.stopPropagation();
            var r=panel.getBoundingClientRect();
            st.on=true;st.id=e.pointerId;st.sx=e.clientX;st.sy=e.clientY;st.ow=r.width;st.oh=r.height;
            panel.style.right='auto';panel.style.bottom='auto';
            try{resizeHandle.setPointerCapture(e.pointerId);}catch(err){}
        });
        resizeHandle.addEventListener('pointermove',function(e){
            if(!st.on||e.pointerId!==st.id)return;
            var nw=clamp(st.ow+(e.clientX-st.sx),panelMinW(),panelMaxW());
            var nh=clamp(st.oh+(e.clientY-st.sy),panelMinH(),panelMaxH());
            panel.style.width=nw+'px';panel.style.height=nh+'px';
            applyUILayout();
        });
        function finish(e){
            if(!st.on||e.pointerId!==st.id)return;
            try{resizeHandle.releasePointerCapture(e.pointerId);}catch(err){}
            st.on=false;
            var r=panel.getBoundingClientRect();
            _ui.panel.w=r.width;_ui.panel.h=r.height;
            _ui.panel.x=r.left;_ui.panel.y=r.top;
            saveState();
        }
        resizeHandle.addEventListener('pointerup',finish);
        resizeHandle.addEventListener('pointercancel',finish);
    }

    enableFabDrag();
    enablePanelDrag();
    enablePanelResize();
    window.addEventListener('resize',function(){applyUILayout();});
}

// ── Auto-check objectives ──
function autoCheck(text){
    if(!_active||!_active.objs)return false;
    var re=new RegExp(DONE_RE.source,'gi'),m,changed=false;
    while((m=re.exec(text))!==null){
        var dt=(m[1]||'').trim().toLowerCase();if(!dt)continue;
        for(var i=0;i<_active.objs.length;i++){
            var o=_active.objs[i];
            if(!o.done){
                var ol=o.text.toLowerCase();
                if(ol.indexOf(dt)!==-1||dt.indexOf(ol)!==-1){o.done=true;changed=true;}
            }
        }
    }
    if(changed){
        saveState();updateBadge();
        var dn=_active.objs.filter(function(o){return o.done;}).length;
        var tn=_active.objs.length;
        if(dn===tn&&tn>0){
            doComplete(true);
            return true;
        }
        else toast('\u2713 Цель отмечена! ('+dn+'/'+tn+')','info');
        if(_panelOpen&&_curTab==='active')renderActive();
    }
    return changed;
}

// ── UI: FAB + Panel ──
function createUI(){
    if(document.getElementById('gq-fab'))return;
    var fab=document.createElement('div');
    fab.id='gq-fab';fab.className='gq-fab';fab.innerHTML='\u2694';fab.title='Доска заданий гильдии';
    document.body.appendChild(fab);

    var panel=document.createElement('div');
    panel.id='gq-panel';panel.className='gq-panel';
    panel.innerHTML='<div class="gq-tabs">'
        +'<button class="gq-layout-reset" id="gq-layout-reset" title="Сбросить положение">\u21BB</button>'
        +'<div class="gq-drag" id="gq-drag" title="Перетащить">⋮⋮</div>'
        +'<div class="gq-tab active" data-tab="board"><i class="fa-solid fa-scroll"></i> Доска</div>'
        +'<div class="gq-tab" data-tab="active"><i class="fa-solid fa-crosshairs"></i> Задание</div>'
        +'<div class="gq-tab" data-tab="profile"><i class="fa-solid fa-user"></i> Профиль</div>'
        +'<div class="gq-tab" data-tab="achievements"><i class="fa-solid fa-trophy"></i> Достижения</div>'
        +'<button class="gq-close" id="gq-close" title="Закрыть">\u2715</button>'
        +'</div>'
        +'<div class="gq-content">'
        +'<div class="gq-view active" data-view="board" id="gq-v-board"></div>'
        +'<div class="gq-view" data-view="active" id="gq-v-active"></div>'
        +'<div class="gq-view" data-view="profile" id="gq-v-profile"></div>'
        +'<div class="gq-view" data-view="achievements" id="gq-v-achs"></div>'
        +'</div>'
        +'<div class="gq-resize" id="gq-resize" title="Изменить размер"></div>';
    panel.addEventListener('click',function(e){e.stopPropagation();});
    document.body.appendChild(panel);

    var tabs=panel.querySelectorAll('.gq-tab');
    for(var i=0;i<tabs.length;i++){
        (function(tab){tab.addEventListener('click',function(){switchTab(tab.getAttribute('data-tab'));});})(tabs[i]);
    }
    var closeBtn=document.getElementById('gq-close');
    if(closeBtn)closeBtn.addEventListener('click',function(e){e.stopPropagation();closePanel();});
    var resetBtn=document.getElementById('gq-layout-reset');
    if(resetBtn)resetBtn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();resetUILayout(true);});
    initWidgetInteractions(
        fab,panel,
        document.getElementById('gq-drag'),
        document.getElementById('gq-resize')
    );
    applyUILayout();
    document.addEventListener('click',function(e){
        var inFab=!!(e.target&&(e.target.id==='gq-fab'||(e.target.closest&&e.target.closest('#gq-fab'))));
        if(_panelOpen&&!panel.contains(e.target)&&!inFab)closePanel();
    });
}

function togglePanel(){if(_panelOpen)closePanel();else openPanel();}
function openPanel(){_panelOpen=true;var p=document.getElementById('gq-panel');if(p){p.classList.add('open');applyUILayout();}refreshTab();}
function closePanel(){_panelOpen=false;var p=document.getElementById('gq-panel');if(p)p.classList.remove('open');}
function switchTab(t){
    _curTab=t;var panel=document.getElementById('gq-panel');if(!panel)return;
    var tabs=panel.querySelectorAll('.gq-tab'),views=panel.querySelectorAll('.gq-view');
    for(var i=0;i<tabs.length;i++)tabs[i].classList.toggle('active',tabs[i].getAttribute('data-tab')===t);
    for(var j=0;j<views.length;j++)views[j].classList.toggle('active',views[j].getAttribute('data-view')===t);
    refreshTab();
}
function refreshTab(){
    if(_curTab==='board')renderBoard();
    else if(_curTab==='active')renderActive();
    else if(_curTab==='profile')renderProfile();
    else if(_curTab==='achievements')renderAchs();
}

function updateBadge(){
    var fab=document.getElementById('gq-fab');if(!fab)return;
    var old=fab.querySelector('.gq-badge');if(old)old.remove();
    if(_active){
        fab.classList.add('has-active');
        var dn=(_active.objs||[]).filter(function(o){return o.done;}).length;
        var tn=(_active.objs||[]).length;
        if(dn<tn){var b=document.createElement('span');b.className='gq-badge';b.textContent=String(tn-dn);fab.appendChild(b);}
    }else{fab.classList.remove('has-active');}
}

// ── Render: Board ──
function renderBoard(){
    var el=document.getElementById('gq-v-board');if(!el)return;
    applyCompletedFilter();
    if(!_board||!_board.quests.length){
        el.innerHTML='<div class="gq-empty"><i class="fa-solid fa-scroll"></i>'
            +'<div>Доска пуста. Подойди к доске гильдии или нажми кнопку.</div>'
            +'<button class="gq-btn gq-trigger" id="gq-trig">\uD83D\uDD04 Запросить доску</button></div>';
        var btn=document.getElementById('gq-trig');
        if(btn)btn.onclick=function(){_wantBoard=true;injectPrompt();btn.disabled=true;btn.textContent='\u2713 Ожидаем ответ...';};
        return;
    }
    var b=_board,rc=rCls(b.rank);
    var qh='';
    for(var i=0;i<b.quests.length;i++){
        var q=b.quests[i],dc=rCls(q.diff);
        var typeInfo=QT[q.type]||QT.GUILD;
        qh+='<div class="gq-quest">'
            +'<div class="gq-qtop">'
            +'<span class="gq-diff '+dc+'">'+esc(q.diff||'?')+'</span>'
            +'<span class="gq-qtype" title="'+esc(typeInfo.ru)+'">'+typeInfo.icon+'</span>'
            +'<span class="gq-qtitle">'+esc(q.title)+'</span>'
            +(q.storyLink?'<span class="gq-story-badge">\u2726</span>':'')
            +'</div>'
            +'<div class="gq-qdesc">'+esc(q.desc)+'</div>'
            +'<div class="gq-qmeta">'
            +(q.client?'<span><i class="fa-solid fa-user"></i>'+esc(q.client)+'</span>':'')
            +(q.deadline?'<span><i class="fa-solid fa-hourglass-half"></i>'+esc(q.deadline)+'</span>':'')
            +(q.reward?'<span class="gq-reward"><i class="fa-solid fa-coins"></i>'+esc(q.reward)+'</span>':'')
            +(q.location?'<span><i class="fa-solid fa-location-dot"></i>'+esc(q.location)+'</span>':'')
            +'</div>'
            +'<div class="gq-qfoot">'
            +'<span class="gq-qtype-label">'+esc(typeInfo.ru)+'</span>'
            +'<button class="gq-btn gq-btn-sm gq-accept" data-qi="'+i+'">\u269C \u041F\u0440\u0438\u043D\u044F\u0442\u044C</button>'
            +'</div>'
            +'</div>';
    }
    el.innerHTML='<div class="gq-hdr">'
        +'<div><div class="gq-guild">\u2694 '+esc(b.guild)+'</div>'
        +(b.loc?'<div class="gq-loc">\u2014 '+esc(b.loc)+' \u2014</div>':'')
        +'</div><div class="gq-rank-badge '+rc+'">\u0420\u0430\u043D\u0433 '+esc(b.rank)+'</div></div>'+qh;

    var btns=el.querySelectorAll('.gq-accept');
    for(var j=0;j<btns.length;j++){
        (function(btn){
            btn.onclick=function(ev){
                ev.preventDefault();
                var qi=parseInt(btn.getAttribute('data-qi'),10),q=b.quests[qi];if(!q)return;
                doAccept({guild:b.guild,loc:b.loc,rank:b.rank,title:q.title,desc:q.desc,diff:q.diff,
                    type:q.type,reward:q.reward,client:q.client,deadline:q.deadline,location:q.location,
                    notes:q.notes,storyLink:q.storyLink,
                    objs:q.objs.map(function(o){return{text:o.text,done:false};})});
            };
        })(btns[j]);
    }
}

// ── Render: Active ──
function renderActive(){
    var el=document.getElementById('gq-v-active');if(!el)return;
    if(!_active){
        el.innerHTML='<div class="gq-empty"><i class="fa-solid fa-crosshairs"></i><div>\u041D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0433\u043E \u0437\u0430\u0434\u0430\u043D\u0438\u044F.</div></div>';
        return;
    }
    var a=_active,dc=rCls(a.diff),typeInfo=QT[a.type]||QT.GUILD;
    var dn=(a.objs||[]).filter(function(o){return o.done;}).length;
    var tn=(a.objs||[]).length,allDone=tn>0&&dn===tn;
    var oh='';
    for(var i=0;i<(a.objs||[]).length;i++){
        var o=a.objs[i];
        oh+='<div class="gq-obj'+(o.done?' done':'')+'" data-oi="'+i+'"><div class="gq-ocheck"></div><div class="gq-otext">'+esc(o.text)+'</div></div>';
    }
    el.innerHTML='<div class="gq-alabel">\u25B8 '+typeInfo.icon+' '+esc(typeInfo.ru)+' \u0437\u0430\u0434\u0430\u043D\u0438\u0435 \u25C2</div>'
        +'<div class="gq-atitle"><span class="gq-diff '+dc+'">'+esc(a.diff)+'</span><span>'+esc(a.title)+(allDone?' \u2713':'')+'</span></div>'
        +(a.desc?'<div class="gq-adesc">'+esc(a.desc)+'</div>':'')
        +(a.storyLink?'<div class="gq-story-note">\u2726 \u0421\u0432\u044F\u0437\u0430\u043D\u043E \u0441 \u0441\u044E\u0436\u0435\u0442\u043E\u043C</div>':'')
        +'<div class="gq-ameta">'
        +(a.client?'<span><i class="fa-solid fa-user"></i>'+esc(a.client)+'</span>':'')
        +(a.deadline?'<span><i class="fa-solid fa-hourglass-half"></i>'+esc(a.deadline)+'</span>':'')
        +(a.reward?'<span class="gq-reward"><i class="fa-solid fa-coins"></i>'+esc(a.reward)+'</span>':'')
        +(a.location?'<span><i class="fa-solid fa-location-dot"></i>'+esc(a.location)+'</span>':'')
        +'</div>'
        +'<div class="gq-objs"><div class="gq-ohdr"><span>\u25C8 \u0426\u0435\u043B\u0438 \u25C8</span><span class="gq-oprog">'+dn+' / '+tn+'</span></div>'
        +'<div class="gq-olist">'+oh+'</div></div>'
        +'<div class="gq-aact">'
        +'<button class="gq-abandon" id="gq-abandon">\u2715 \u041E\u0442\u043A\u0430\u0437\u0430\u0442\u044C\u0441\u044F</button>'
        +'<button class="gq-complete'+(allDone?' visible':'')+'" id="gq-complete">\u2726 \u0421\u0434\u0430\u0442\u044C</button>'
        +'</div>';

    var objs=el.querySelectorAll('.gq-obj');
    for(var k=0;k<objs.length;k++){
        (function(obj){obj.onclick=function(){
            var idx=parseInt(obj.getAttribute('data-oi'),10);
            if(_active&&_active.objs[idx]){_active.objs[idx].done=!_active.objs[idx].done;saveState();renderActive();updateBadge();}
        };})(objs[k]);
    }
    var abBtn=document.getElementById('gq-abandon');if(abBtn)abBtn.onclick=function(){doAbandon();};
    var coBtn=document.getElementById('gq-complete');if(coBtn)coBtn.onclick=function(){doComplete();};
}

// ── Render: Profile ──
function renderProfile(){
    var el=document.getElementById('gq-v-profile');if(!el)return;
    var p=getProfile(),rc=rCls(p.rank);
    var ni=RANKS.indexOf(p.rank)+1,nk=ni<RANKS.length?RANKS[ni]:'SSS';
    var toNext=RANK_TH[nk]-p.completed;if(toNext<0)toNext=0;
    var pct=ni<RANKS.length?Math.min(100,Math.round((p.completed-RANK_TH[p.rank])/(RANK_TH[nk]-RANK_TH[p.rank])*100)):100;

    // Title display
    var titleName='';
    if(p.activeTitle){var tf=TITLES.find(function(t){return t.id===p.activeTitle;});if(tf)titleName=tf.name;}

    // Reputation
    var repH='';
    var repKeys=Object.keys(p.reputation||{});
    if(repKeys.length){
        for(var r=0;r<repKeys.length;r++){
            repH+='<div class="gq-prep"><span>'+esc(repKeys[r])+'</span><span class="gq-prep-val">'+p.reputation[repKeys[r]]+' \u2764</span></div>';
        }
    }else{repH='<div class="gq-pempty">\u041D\u0435\u0442 \u0440\u0435\u043F\u0443\u0442\u0430\u0446\u0438\u0438</div>';}

    // History
    var histH='';
    if(p.history&&p.history.length){
        var rev=p.history.slice().reverse().slice(0,30);
        for(var i=0;i<rev.length;i++){
            var h=rev[i],hdc=rCls(h.diff),ti=QT[h.type]||QT.GUILD;
            histH+='<div class="gq-phist"><span><span class="gq-diff-sm '+hdc+'">'+esc(h.diff)+'</span>'+ti.icon+' '+esc(h.title)+'</span><span class="gq-hreward">+'+esc(h.gold)+'\u0437\u043C</span></div>';
        }
    }else{histH='<div class="gq-pempty">\u041D\u0435\u0442 \u0438\u0441\u0442\u043E\u0440\u0438\u0438</div>';}

    el.innerHTML='<div class="gq-profile">'
        +'<div class="gq-pavatar">\u2694</div>'
        +'<div class="gq-pname">'+esc(p.name)+'</div>'
        +(titleName?'<div class="gq-ptitle">\u00AB'+esc(titleName)+'\u00BB</div>':'')
        +'<div class="gq-prank"><span class="gq-rank-badge '+rc+'">\u0420\u0430\u043D\u0433 '+esc(p.rank)+'</span></div>'
        +'<div class="gq-progress-bar"><div class="gq-progress-fill" style="width:'+pct+'%"></div><span class="gq-progress-text">'+pct+'% \u0434\u043E '+esc(nk)+'</span></div>'
        +'<div class="gq-pstats">'
        +'<div class="gq-pstat"><div class="gq-pstat-val"><i class="fa-solid fa-coins" style="color:#d4b876;margin-right:4px"></i>'+p.gold+'</div><div class="gq-pstat-lbl">\u0417\u043E\u043B\u043E\u0442\u043E</div></div>'
        +'<div class="gq-pstat"><div class="gq-pstat-val">'+p.completed+'</div><div class="gq-pstat-lbl">\u0412\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043E</div></div>'
        +'<div class="gq-pstat"><div class="gq-pstat-val">'+(p.history?p.history.length:0)+'</div><div class="gq-pstat-lbl">\u0412\u0441\u0435\u0433\u043E</div></div>'
        +'<div class="gq-pstat"><div class="gq-pstat-val">'+toNext+'</div><div class="gq-pstat-lbl">\u0414\u043E \u0440\u0430\u043D\u0433\u0430</div></div>'
        +'</div>'
        +'<div class="gq-section-title">\u2764 \u0420\u0435\u043F\u0443\u0442\u0430\u0446\u0438\u044F</div>'
        +'<div class="gq-prep-list">'+repH+'</div>'
        +'<div class="gq-section-title">\uD83D\uDCDC \u0418\u0441\u0442\u043E\u0440\u0438\u044F</div>'
        +'<div class="gq-phist-list">'+histH+'</div>'
        +'</div>';
}

// ── Render: Achievements ──
function renderAchs(){
    var el=document.getElementById('gq-v-achs');if(!el)return;
    var p=getProfile();

    // Titles section
    var tH='';
    for(var i=0;i<TITLES.length;i++){
        var t=TITLES[i],unlocked=p.titles.includes(t.id);
        var isActive=p.activeTitle===t.id;
        tH+='<div class="gq-ach-item'+(unlocked?' unlocked':'')+(isActive?' active-title':'')+'" data-tid="'+t.id+'">'
            +'<span class="gq-ach-icon">'+(unlocked?'\u2605':'\u2606')+'</span>'
            +'<span class="gq-ach-name">'+esc(t.name)+'</span>'
            +(isActive?'<span class="gq-ach-active">\u2190 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0439</span>':'')
            +'</div>';
    }

    // Achievements section
    var aH='';
    for(var j=0;j<ACHS.length;j++){
        var a=ACHS[j],done=p.achievements.includes(a.id);
        aH+='<div class="gq-ach-item'+(done?' unlocked':'')+'">'
            +'<span class="gq-ach-icon">'+(done?'\uD83C\uDFC6':'\uD83D\uDD12')+'</span>'
            +'<div><div class="gq-ach-name">'+esc(a.name)+'</div><div class="gq-ach-desc">'+esc(a.desc)+'</div></div>'
            +'</div>';
    }

    el.innerHTML='<div class="gq-section-title">\u2B50 \u0422\u0438\u0442\u0443\u043B\u044B ('+p.titles.length+'/'+TITLES.length+')</div>'
        +'<div class="gq-ach-note">\u041D\u0430\u0436\u043C\u0438 \u043D\u0430 \u0440\u0430\u0437\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0439, \u0447\u0442\u043E\u0431\u044B \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C</div>'
        +'<div class="gq-ach-list">'+tH+'</div>'
        +'<div class="gq-section-title">\uD83C\uDFC6 \u0414\u043E\u0441\u0442\u0438\u0436\u0435\u043D\u0438\u044F ('+p.achievements.length+'/'+ACHS.length+')</div>'
        +'<div class="gq-ach-list">'+aH+'</div>';

    // Title click to set active
    var items=el.querySelectorAll('.gq-ach-item[data-tid]');
    for(var k=0;k<items.length;k++){
        (function(item){
            item.onclick=function(){
                var tid=item.getAttribute('data-tid');
                if(!p.titles.includes(tid))return;
                if(p.activeTitle===tid)p.activeTitle='';else p.activeTitle=tid;
                saveProfile(p);renderAchs();
                toast(p.activeTitle?'\u2B50 \u0422\u0438\u0442\u0443\u043B: '+TITLES.find(function(t){return t.id===tid;}).name:'\u0422\u0438\u0442\u0443\u043B \u0441\u043D\u044F\u0442');
            };
        })(items[k]);
    }
}

// ── Quest Actions ──
function doAccept(quest){
    var sig=questSig(quest);
    if(sig&&_board&&Array.isArray(_board.quests)){
        _board.quests=_board.quests.filter(function(q){return questSig(q)!==sig;});
    }
    _active=quest;saveState();updateBadge();switchTab('active');
    toast('\u269C \u0417\u0430\u0434\u0430\u043D\u0438\u0435 \u043F\u0440\u0438\u043D\u044F\u0442\u043E!','success');
}
function doAbandon(){
    _active=null;saveState();updateBadge();switchTab('board');
    toast('\u2715 \u0417\u0430\u0434\u0430\u043D\u0438\u0435 \u043E\u0442\u043C\u0435\u043D\u0435\u043D\u043E','warn');
}
function doComplete(autoTurnIn){
    if(!_active)return;
    var a=_active,gold=pGold(a.reward),rep=RANK_REP[a.diff]||5;
    if(a.type==='URGENT')gold=Math.round(gold*1.5);
    var p=getProfile();
    p.gold+=gold;p.completed++;
    p.byType[a.type]=(p.byType[a.type]||0)+1;
    if(a.guild){p.reputation[a.guild]=(p.reputation[a.guild]||0)+rep;}
    p.history.push({title:a.title,diff:a.diff,type:a.type||'GUILD',reward:a.reward,gold:gold,date:new Date().toLocaleDateString()});
    p.rank=calcRank(p);
    var unlocks=checkUnlocks(p);
    saveProfile(p);
    var sig=questSig(a);
    if(sig)_completed[sig]=true;
    applyCompletedFilter();
    _active=null;saveState();updateBadge();
    notify((autoTurnIn?'\u2726 \u0417\u0430\u0434\u0430\u043D\u0438\u0435 \u0430\u0432\u0442\u043E-\u0441\u0434\u0430\u043D\u043E':'\u2726 \u0417\u0430\u0434\u0430\u043D\u0438\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043E')+'! +'+gold+'\u0437\u043C'+(rep?' +'+rep+'\u2764':''),'success','Задание выполнено');
    if(unlocks.titles.length)setTimeout(function(){toast('\u2B50 \u041D\u043E\u0432\u044B\u0439 \u0442\u0438\u0442\u0443\u043B: '+unlocks.titles.join(', '),'special');},800);
    if(unlocks.achs.length)setTimeout(function(){toast('\uD83C\uDFC6 \u0414\u043E\u0441\u0442\u0438\u0436\u0435\u043D\u0438\u0435: '+unlocks.achs.join(', '),'special');},1500);
    switchTab('profile');
}

// ── System Prompt ──
var SYSTEM_PROMPT = '[System Note: \u0418\u0433\u0440\u043E\u043A \u043F\u043E\u0434\u043E\u0448\u0451\u043B \u043A \u0434\u043E\u0441\u043A\u0435 \u043E\u0431\u044A\u044F\u0432\u043B\u0435\u043D\u0438\u0439 \u0433\u0438\u043B\u044C\u0434\u0438\u0438. \u0412 \u0421\u0410\u041C\u041E\u041C \u041D\u0410\u0427\u0410\u041B\u0415 \u043E\u0442\u0432\u0435\u0442\u0430 \u0432\u044B\u0432\u0435\u0434\u0438 \u0431\u043B\u043E\u043A \u0421\u0422\u0420\u041E\u0413\u041E \u0432 \u044D\u0442\u043E\u043C \u0444\u043E\u0440\u043C\u0430\u0442\u0435:\n\n<guild_board>\n{"guild":"\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435\u0413\u0438\u043B\u044C\u0434\u0438\u0438","loc":"\u041C\u0435\u0441\u0442\u043E","rank":"\u0420\u0430\u043D\u0433\u0418\u0433\u0440\u043E\u043A\u0430","quests":[\n{"title":"\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435","desc":"\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435","diff":"F","type":"GUILD","reward":"50\u0437\u043C","client":"\u0418\u043C\u044F","deadline":"2 \u0434\u043D\u044F","location":"\u041B\u043E\u043A\u0430\u0446\u0438\u044F","storyLink":false,"objs":["\u0426\u0435\u043B\u044C1","\u0426\u0435\u043B\u044C2"]}\n]}\n</guild_board>\n\n\u041F\u0440\u0430\u0432\u0438\u043B\u0430:\n- \u0420\u0430\u043D\u0433/\u0421\u043B\u043E\u0436\u043D\u043E\u0441\u0442\u044C: F/E/D/C/B/A/S/SS/SSS\n- 3-4 \u0437\u0430\u0434\u0430\u043D\u0438\u044F, \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0445 \u0440\u0430\u043D\u0433\u0443 \u0438\u0433\u0440\u043E\u043A\u0430 (\u00B11 \u0440\u0430\u043D\u0433)\n- \u041D\u0430\u0433\u0440\u0430\u0434\u0430: F=30-80\u0437\u043C, E=80-150\u0437\u043C, D=150-300\u0437\u043C, C=300-600\u0437\u043C, B=600-1500\u0437\u043C, A=1500-5000\u0437\u043C, S=5000+\u0437\u043C\n- \u0422\u0438\u043F\u044B \u0437\u0430\u0434\u0430\u043D\u0438\u0439 (type): STORY, GUILD, SIDE, URGENT, HUNT, ESCORT, DUNGEON, INVESTIGATE, SPECIAL, RAID, DAILY\n- \u041E\u0434\u043D\u043E \u0438\u0437 \u0437\u0430\u0434\u0430\u043D\u0438\u0439 \u043C\u043E\u0436\u0435\u0442 \u0431\u044B\u0442\u044C STORY (\u0441\u0432\u044F\u0437\u0430\u043D\u043E \u0441 \u0441\u044E\u0436\u0435\u0442\u043E\u043C RP, storyLink:true)\n- \u0421\u0440\u043E\u0447\u043D\u044B\u0435 (URGENT) \u0434\u0430\u044E\u0442 x1.5 \u043D\u0430\u0433\u0440\u0430\u0434\u0443\n- objs: 2-4 \u0446\u0435\u043B\u0438 \u043A\u0430\u043A \u043C\u0430\u0441\u0441\u0438\u0432 \u0441\u0442\u0440\u043E\u043A\n- \u0417\u0430\u0434\u0430\u043D\u0438\u044F \u0434\u043E\u043B\u0436\u043D\u044B \u0431\u044B\u0442\u044C \u0440\u0430\u0437\u043D\u043E\u043E\u0431\u0440\u0430\u0437\u043D\u044B\u043C\u0438 \u0438 \u0438\u043D\u0442\u0435\u0440\u0435\u0441\u043D\u044B\u043C\u0438, \u043A\u0430\u043A \u0432 \u0430\u043D\u0438\u043C\u0435/\u043C\u0430\u043D\u0445\u0432\u0435 \u043F\u0440\u043E \u0433\u0438\u043B\u044C\u0434\u0438\u0438 \u0430\u0432\u0430\u043D\u0442\u044E\u0440\u0438\u0441\u0442\u043E\u0432\n- JSON \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u0432\u0430\u043B\u0438\u0434\u043D\u044B\u043C\n\n\u041A\u043E\u0433\u0434\u0430 \u0438\u0433\u0440\u043E\u043A \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442 \u0446\u0435\u043B\u044C \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0433\u043E \u0437\u0430\u0434\u0430\u043D\u0438\u044F, \u043F\u043E\u043C\u0435\u0442\u044C:\n<gq_done>\u0442\u043E\u0447\u043D\u044B\u0439 \u0442\u0435\u043A\u0441\u0442 \u0446\u0435\u043B\u0438</gq_done>\n\n\u041F\u043E\u0441\u043B\u0435 </guild_board> \u2014 \u043E\u0431\u044B\u0447\u043D\u043E\u0435 \u043F\u043E\u0432\u0435\u0441\u0442\u0432\u043E\u0432\u0430\u043D\u0438\u0435.]';

function injectPrompt(){
    var prompt=SYSTEM_PROMPT+'\n\n[Важно: не используй markdown-код-блоки ``` и не показывай служебные теги в обычном тексте.]';
    var p=getProfile();
    var recent=(p.history||[]).slice(-20).map(function(h){return String(h.title||'').trim();}).filter(Boolean);
    if(recent.length){
        prompt+='\n\n[Доп. правило: не предлагай повторно уже выполненные задания с названиями: '+recent.join('; ')+']';
    }
    setExtensionPrompt(EXT_ID,prompt,extension_prompt_types.IN_CHAT,0,true,false,null,extension_prompt_roles.SYSTEM);
    _injected=true;
    console.log('[GQ6] Prompt injected');
}
function clearPrompt(){
    setExtensionPrompt(EXT_ID,'',extension_prompt_types.IN_CHAT,0);
    _injected=false;
}
function shouldTrigger(){
    if(_wantBoard)return true;
    var ctx=null;
    try{if(typeof SillyTavern!=='undefined'&&SillyTavern.getContext)ctx=SillyTavern.getContext();else if(typeof getContext==='function')ctx=getContext();}catch(e){}
    if(!ctx||!ctx.chat||!ctx.chat.length)return false;
    for(var i=ctx.chat.length-1;i>=0;i--){
        var msg=ctx.chat[i];
        if(msg&&msg.is_user&&msg.mes)return TRIGGER_RE.test(msg.mes);
    }
    return false;
}

// ── Scan messages ──
function scanMessages(){
    var ctx=null;
    try{if(typeof SillyTavern!=='undefined'&&SillyTavern.getContext)ctx=SillyTavern.getContext();else if(typeof getContext==='function')ctx=getContext();}catch(e){}
    if(!ctx||!ctx.chat)return;
    for(var i=0;i<ctx.chat.length;i++){
        var msg=ctx.chat[i];if(!msg||!msg.mes)continue;
        var board=parseBoard(msg.mes);
        if(board&&board.quests.length){
            _board=board;
            _lastBoardNoticeSig=boardSig(board)||_lastBoardNoticeSig;
        }
    }
    applyCompletedFilter();
    scrubChat();updateBadge();
    if(_panelOpen)refreshTab();
}

// ── Process new message ──
function processNew(){
    var ctx=null;
    try{if(typeof SillyTavern!=='undefined'&&SillyTavern.getContext)ctx=SillyTavern.getContext();else if(typeof getContext==='function')ctx=getContext();}catch(e){}
    if(!ctx||!ctx.chat||!ctx.chat.length)return;
    var last=ctx.chat[ctx.chat.length-1];
    if(!last||!last.mes)return;
    var text=last.mes;
    var board=parseBoard(text);
    if(board&&board.quests.length){
        applyBoard(board);
    }
    autoCheck(text);
    trackObjectivesByExtraApi(text);
    scrubChat();
    setTimeout(scrubChat,300);
    _wantBoard=false;
    if(_injected)clearPrompt();
    updateBadge();
}
function handleBoardTrigger(){
    requestBoardFromExtraApi().then(function(ok){if(!ok)injectPrompt();});
}

// ── Init ──
jQuery(function(){
    try{
        loadState();
        createUI();updateBadge();
        setTimeout(scanMessages,1000);

        eventSource.on(event_types.MESSAGE_RECEIVED,function(){setTimeout(processNew,500);});
        eventSource.on(event_types.MESSAGE_SWIPED,function(){setTimeout(function(){scanMessages();processNew();},500);});
        eventSource.on(event_types.CHAT_CHANGED,function(){
            _board=null;loadState();_wantBoard=false;
            if(_injected)clearPrompt();
            _lastBoardNoticeSig='';
            setTimeout(scanMessages,800);
        });
        eventSource.on(event_types.GENERATION_STARTED,function(){if(shouldTrigger())handleBoardTrigger();});
        eventSource.on(event_types.GENERATION_ENDED,function(){_wantBoard=false;});

        // Periodic scrub
        setInterval(scrubChat,3000);

        window.__gq={
            openPanel:openPanel,getProfile:getProfile,saveProfile:saveProfile,
            requestBoard:function(){_wantBoard=true;handleBoardTrigger();openPanel();switchTab('board');return'Board next.';},
            resetProfile:function(){saveProfile(defProfile());if(_panelOpen)renderProfile();return'Reset.';},
            resetLayout:function(){resetUILayout(false);return'Layout reset.';},
            getExtraApi:getExtraApi,
            setExtraApi:function(cfg){saveExtraApi(cfg||{});return getExtraApi();},
            requestNotificationPermission:requestNotificationPermission,
        };

        console.log('[GuildQuest v6.0] \u2694\uFE0F Extension ready');
    }catch(err){console.error('[GQ6] Init error:',err);}
});
