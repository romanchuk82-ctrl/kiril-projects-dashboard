from pathlib import Path

p = Path('api/aggregate.js')
text = p.read_text(encoding='utf-8')

# Add a conservative cache for targeted Live Queue API refreshes.
needle = "const officialCache=new Map();\n"
insert = "const officialCache=new Map();\nconst liveQueueCache=new Map();\nconst LIVE_QUEUE_TTL=10*60*1000;\nconst LIVE_QUEUE_STALE_MIN=30;\n"
if needle in text and 'LIVE_QUEUE_TTL' not in text:
    text = text.replace(needle, insert, 1)

# Insert helpers before sort().
marker = "function sort(rows){"
if 'export function mergeNakordoniLiveSnapshot' not in text:
    helpers = r'''function normalizeNakordoniQueueSnapshot(body){
  const snap=body?.data?.snapshot||body?.snapshot||body?.data;
  if(!snap||typeof snap!=='object'||Array.isArray(snap))return null;
  const queueCars=n(pick(snap,['queue_now','queue','cars','vehicles']));
  const waitMin=n(pick(snap,['wait_min','wait_minutes','estimated_wait_min','waiting_time_min']));
  const ageMin=n(pick(snap,['age_min','age_minutes','data_age_min']));
  const updatedAt=s(pick(snap,['updated_at','timestamp','as_of','last_update']));
  const waitStatus=s(pick(snap,['wait_status','status']));
  if(queueCars==null&&waitMin==null&&waitStatus==null)return null;
  return{queueCars,waitMin,ageMin,updatedAt,waitStatus,source:snap?.source||null}
}
export function mergeNakordoniLiveSnapshot(row,snapshot){
  if(!row||!snapshot)return{row,updated:false};
  const candidate={...row,...snapshot};
  const oldStamp=nakordoniStamp(row),newStamp=nakordoniStamp(candidate);
  const newer=newStamp!=null&&(oldStamp==null||newStamp>oldStamp);
  if(!newer)return{row,updated:false};
  const nextSources=(row.sources||[]).filter(src=>src?.source!=='nakordoni');
  const src={source:'nakordoni',label:'Nakordoni · Live Queue API',value:snapshot.waitMin,queueCars:snapshot.queueCars,updatedAt:snapshot.updatedAt||null,ageMin:snapshot.ageMin??null,sourceUrl:row.sourceUrl||`https://nakordoni.eu/uk/id/${row.ppid||''}`,note:snapshot.queueCars!=null?`${snapshot.queueCars} авто · live queue snapshot`:'live queue snapshot'};
  nextSources.unshift(src);
  return{row:{...row,...snapshot,stale:(snapshot.ageMin!=null?Number(snapshot.ageMin)>60:false),confidence:(snapshot.ageMin!=null&&Number(snapshot.ageMin)<=20?'high':'medium'),sources:nextSources},updated:true}
}
async function fetchNakordoniLiveQueue(ppid,apiKey){
  const key=String(ppid||'');
  if(!key||!apiKey)return{ok:false,error:'missing_ppid_or_key'};
  const cached=liveQueueCache.get(key);
  if(cached&&Date.now()-cached.ts<LIVE_QUEUE_TTL)return{...cached.value,fromCache:true};
  let value;
  try{
    const result=await fetchJson(`https://nakordoni.eu/api/v1/data/queue?ppid=${encodeURIComponent(key)}&lang=uk`,apiKey);
    const snapshot=result.ok?normalizeNakordoniQueueSnapshot(result.body):null;
    value={ok:Boolean(result.ok&&snapshot),status:result.status,snapshot,error:result.ok&&!snapshot?'NO_SNAPSHOT':(!result.ok?(result.body?.error?.code||result.body?.error?.message||`HTTP_${result.status}`):null),usage:result.body?.usage||null};
  }catch(e){value={ok:false,status:0,snapshot:null,error:String(e?.message||e),usage:null}}
  liveQueueCache.set(key,{ts:Date.now(),value});
  return{...value,fromCache:false}
}
async function supplementNakordoniLiveQueue(rows,apiKey,direction){
  const base=Array.isArray(rows)?rows.map(x=>({...x,sources:[...(x.sources||[])]})):[];
  if(!apiKey)return{rows:base,attempted:0,updated:0,details:[]};
  const candidates=base.filter(r=>r.countryCode==='PL'&&r.direction===direction&&r.ppid&&Number.isFinite(Number(r.ageMin))&&Number(r.ageMin)>=LIVE_QUEUE_STALE_MIN).sort((a,b)=>Number(b.ageMin)-Number(a.ageMin));
  if(!candidates.length)return{rows:base,attempted:0,updated:0,details:[]};
  // Refresh at most one stale checkpoint per aggregate request to protect the heavy API quota.
  const target=candidates[0];
  const live=await fetchNakordoniLiveQueue(target.ppid,apiKey);
  const detail={ppid:target.ppid,name:target.name,oldAgeMin:target.ageMin,ok:live.ok,status:live.status||null,error:live.error||null,fromCache:Boolean(live.fromCache),newAgeMin:live.snapshot?.ageMin??null};
  if(!live.ok)return{rows:base,attempted:1,updated:0,details:[detail]};
  const idx=base.findIndex(r=>r===target||r.id===target.id);
  const merged=mergeNakordoniLiveSnapshot(base[idx],live.snapshot);
  if(merged.updated)base[idx]=merged.row;
  return{rows:base,attempted:1,updated:merged.updated?1:0,details:[detail]}
}
'''
    text = text.replace(marker, helpers + marker, 1)

# Make API key available to regional-upstream path too.
old = "  const direction=req.query?.direction==='EU_UA'?'EU_UA':'UA_EU';\n  const regional=await fetchRegionalUpstream(direction);"
new = "  const direction=req.query?.direction==='EU_UA'?'EU_UA':'UA_EU';\n  const apiKey=process.env.NKD_API_KEY||s(req.headers?.['x-nkd-key']);\n  const regional=await fetchRegionalUpstream(direction);"
if old in text:
    text = text.replace(old, new, 1)

# Regional path: use targeted official queue endpoint before blocked public-page fallback.
old = """    const [tg,kordon]=await Promise.all([getTelegram(),fetchKordonLive(direction)]);
    const nw=await supplementNakordoniWeb(Array.isArray(regional.crossings)?regional.crossings:[],direction);
    let base=mergeKordon(nw.rows,kordon,direction);
    const rows=mergeTelegram(base,tg.items,direction,tg.sources);
    return res.status(200).json({...regional,generatedAt:new Date().toISOString(),cacheMinutes:2,crossings:sort(rows),sourceStatus:{...(regional.sourceStatus||{}),nakordoniDetails:{...(regional.sourceStatus?.nakordoniDetails||{}),webCount:nw.web?.crossings?.length||0,added:nw.added,freshnessMerge:true},kordon:kordon.status,kordonDetails:kordonDetails(kordon),telegram:tg.status,telegramDetails:tg.meta},viaRegionalUpstream:true,telegramLocal:true})
"""
new = """    const [tg,kordon]=await Promise.all([getTelegram(),fetchKordonLive(direction)]);
    const nl=await supplementNakordoniLiveQueue(Array.isArray(regional.crossings)?regional.crossings:[],apiKey,direction);
    const nw=await supplementNakordoniWeb(nl.rows,direction);
    let base=mergeKordon(nw.rows,kordon,direction);
    const rows=mergeTelegram(base,tg.items,direction,tg.sources);
    return res.status(200).json({...regional,generatedAt:new Date().toISOString(),cacheMinutes:2,crossings:sort(rows),sourceStatus:{...(regional.sourceStatus||{}),nakordoniDetails:{...(regional.sourceStatus?.nakordoniDetails||{}),webCount:nw.web?.crossings?.length||0,added:nw.added,freshnessMerge:true,liveQueueAttempted:nl.attempted,liveQueueUpdated:nl.updated,liveQueueDetails:nl.details},kordon:kordon.status,kordonDetails:kordonDetails(kordon),telegram:tg.status,telegramDetails:tg.meta},viaRegionalUpstream:true,telegramLocal:true})
"""
if old not in text:
    raise SystemExit('regional block not found')
text = text.replace(old, new, 1)

# Remove later duplicate apiKey declaration.
text = text.replace("  const apiKey=process.env.NKD_API_KEY||s(req.headers?.['x-nkd-key']);\n  if(!apiKey){", "  if(!apiKey){", 1)

# Direct path: targeted queue refresh before webpage supplement.
old = """  const x=nkd.value;
  const nw=await supplementNakordoniWeb(x.crossings,direction);
  let rows=mergeKordon(nw.rows,kordon,direction);"""
new = """  const x=nkd.value;
  const nl=await supplementNakordoniLiveQueue(x.crossings,apiKey,direction);
  const nw=await supplementNakordoniWeb(nl.rows,direction);
  let rows=mergeKordon(nw.rows,kordon,direction);"""
if old not in text:
    raise SystemExit('direct merge block not found')
text = text.replace(old, new, 1)

old_detail = "nakordoniDetails:{mode:x.crossings.length?(nw.added?'api_plus_web':'api'):(nw.web?.crossings?.length?'web_fallback':'error'),apiCount:x.crossings.length,webCount:nw.web?.crossings?.length||0,added:nw.added,freshnessMerge:true}"
new_detail = "nakordoniDetails:{mode:x.crossings.length?(nl.updated?'api_plus_live_queue':(nw.added?'api_plus_web':'api')):(nw.web?.crossings?.length?'web_fallback':'error'),apiCount:x.crossings.length,webCount:nw.web?.crossings?.length||0,added:nw.added,freshnessMerge:true,liveQueueAttempted:nl.attempted,liveQueueUpdated:nl.updated,liveQueueDetails:nl.details}"
if old_detail not in text:
    raise SystemExit('nakordoni detail block not found')
text = text.replace(old_detail, new_detail, 1)

p.write_text(text, encoding='utf-8')

# Add pure merge tests.
tp = Path('test/aggregate.test.js')
tests = tp.read_text(encoding='utf-8')
tests = tests.replace("import { mergeTelegram, mergeNakordoniWebRows } from '../api/aggregate.js';", "import { mergeTelegram, mergeNakordoniWebRows, mergeNakordoniLiveSnapshot } from '../api/aggregate.js';")
if "Nakordoni Live Queue snapshot replaces an older border snapshot" not in tests:
    tests += r'''

test('Nakordoni Live Queue snapshot replaces an older border snapshot', () => {
  const base = {
    id: 'api-grushiv', ppid: 'id_10', name: 'Грушів - Будоміж', country: 'Польща', countryCode: 'PL', direction: 'UA_EU',
    waitMin: 15, queueCars: 0, ageMin: 55, updatedAt: '2026-09-27T05:23:00.000Z', stale: false, confidence: 'medium',
    sourceUrl: 'https://nakordoni.eu/uk/id/id_10',
    sources: [{ source: 'nakordoni', label: 'Nakordoni', value: 15, ageMin: 55, updatedAt: '2026-09-27T05:23:00.000Z' }]
  };
  const snapshot = { waitMin: 5, queueCars: 0, ageMin: 8, updatedAt: '2026-09-27T06:10:00.000Z', waitStatus: null };
  const merged = mergeNakordoniLiveSnapshot(base, snapshot);
  assert.equal(merged.updated, true);
  assert.equal(merged.row.waitMin, 5);
  assert.equal(merged.row.ageMin, 8);
  assert.equal(merged.row.sources[0].label, 'Nakordoni · Live Queue API');
  assert.equal(merged.row.sources.filter(s => s.source === 'nakordoni').length, 1);
});

test('Nakordoni Live Queue snapshot never rolls a checkpoint back', () => {
  const base = {
    id: 'api-grushiv', ppid: 'id_10', name: 'Грушів - Будоміж', country: 'Польща', countryCode: 'PL', direction: 'UA_EU',
    waitMin: 5, queueCars: 0, ageMin: 8, updatedAt: '2026-09-27T06:10:00.000Z', stale: false,
    sources: [{ source: 'nakordoni', label: 'Nakordoni', value: 5, ageMin: 8, updatedAt: '2026-09-27T06:10:00.000Z' }]
  };
  const snapshot = { waitMin: 15, queueCars: 0, ageMin: 55, updatedAt: '2026-09-27T05:23:00.000Z', waitStatus: null };
  const merged = mergeNakordoniLiveSnapshot(base, snapshot);
  assert.equal(merged.updated, false);
  assert.equal(merged.row.waitMin, 5);
});
'''
tp.write_text(tests, encoding='utf-8')
print('patched Nakordoni live queue refresh')
