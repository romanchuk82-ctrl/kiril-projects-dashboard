from pathlib import Path

aggregate = Path('api/aggregate.js')
text = aggregate.read_text(encoding='utf-8')

text = text.replace('const TTL=5*60*1000;', 'const TTL=2*60*1000;')
text = text.replace('cacheMinutes:5', 'cacheMinutes:2')

start = text.index('async function supplementNakordoniWeb(rows,direction){')
end = text.index('\nfunction sort(rows)', start)
replacement = r'''function nakordoniStamp(row){
  const ts=Date.parse(String(row?.updatedAt||''));
  if(Number.isFinite(ts))return ts;
  const age=Number(row?.ageMin);
  return Number.isFinite(age)&&age>=0?Date.now()-age*60000:null
}
function nakordoniUsable(row){
  return Boolean(row)&&!row.stale&&(row.waitMin!=null||row.queueCars!=null||row.waitStatus==='closed')
}
function mergeNakordoniSources(...lists){
  const out=[],seen=new Set();
  for(const src of lists.flat()){
    if(!src)continue;
    const key=[src.source||'',src.label||'',src.updatedAt||'',src.ageMin??'',src.value??'',src.queueCars??'',src.sourceUrl||''].join('|');
    if(seen.has(key))continue;
    seen.add(key);out.push(src)
  }
  return out
}
export function mergeNakordoniWebRows(rows,webRows){
  const base=Array.isArray(rows)?rows.map(x=>({...x,sources:[...(x.sources||[])]})):[];
  let added=0;
  for(const w of Array.isArray(webRows)?webRows:[]){
    const i=base.findIndex(x=>x.countryCode==='PL'&&rowMatches(x,w.name,'PL',[]));
    if(i<0){base.push(w);added++;continue}
    const cur=base[i];
    const curUsable=nakordoniUsable(cur);
    const webUsable=nakordoniUsable(w);
    const curStamp=nakordoniStamp(cur);
    const webStamp=nakordoniStamp(w);
    const webNewer=webUsable&&(!curUsable||(webStamp!=null&&(curStamp==null||webStamp>curStamp)));
    const sources=mergeNakordoniSources(cur.sources||[],w.sources||[]);
    if(webNewer){
      base[i]={...cur,...w,id:cur.id||w.id,ppid:cur.ppid||w.ppid,sources};
      added++
    }else{
      base[i]={...cur,sources}
    }
  }
  return{rows:base,added}
}
async function supplementNakordoniWeb(rows,direction){
  const base=Array.isArray(rows)?rows:[];
  let web;
  try{web=await fetchNakordoniWeb(direction)}catch(e){return{rows:base,web:{crossings:[],failures:[{error:String(e?.message||e)}]},added:0}}
  const merged=mergeNakordoniWebRows(base,web.crossings||[]);
  return{rows:merged.rows,web,added:merged.added}
}'''
text = text[:start] + replacement + text[end:]

old_regional = """  if(regional){\n    const [tg,kordon]=await Promise.all([getTelegram(),fetchKordonLive(direction)]);\n    let base=mergeKordon(Array.isArray(regional.crossings)?regional.crossings:[],kordon,direction);\n    const rows=mergeTelegram(base,tg.items,direction,tg.sources);\n    return res.status(200).json({...regional,generatedAt:new Date().toISOString(),crossings:sort(rows),sourceStatus:{...(regional.sourceStatus||{}),kordon:kordon.status,kordonDetails:kordonDetails(kordon),telegram:tg.status,telegramDetails:tg.meta},viaRegionalUpstream:true,telegramLocal:true})\n  }"""
new_regional = """  if(regional){\n    const [tg,kordon]=await Promise.all([getTelegram(),fetchKordonLive(direction)]);\n    const nw=await supplementNakordoniWeb(Array.isArray(regional.crossings)?regional.crossings:[],direction);\n    let base=mergeKordon(nw.rows,kordon,direction);\n    const rows=mergeTelegram(base,tg.items,direction,tg.sources);\n    return res.status(200).json({...regional,generatedAt:new Date().toISOString(),cacheMinutes:2,crossings:sort(rows),sourceStatus:{...(regional.sourceStatus||{}),nakordoniDetails:{...(regional.sourceStatus?.nakordoniDetails||{}),webCount:nw.web?.crossings?.length||0,added:nw.added,freshnessMerge:true},kordon:kordon.status,kordonDetails:kordonDetails(kordon),telegram:tg.status,telegramDetails:tg.meta},viaRegionalUpstream:true,telegramLocal:true})\n  }"""
if old_regional not in text:
    raise SystemExit('regional block not found')
text = text.replace(old_regional, new_regional)

text = text.replace("nakordoniDetails:{mode:nw.rows.length?'web_fallback':'missing_key',apiCount:0,webCount:nw.web?.crossings?.length||0,added:nw.added}", "nakordoniDetails:{mode:nw.rows.length?'web_fallback':'missing_key',apiCount:0,webCount:nw.web?.crossings?.length||0,added:nw.added,freshnessMerge:true}")
text = text.replace("nakordoniDetails:{mode:x.crossings.length?(nw.added?'api_plus_web':'api'):(nw.web?.crossings?.length?'web_fallback':'error'),apiCount:x.crossings.length,webCount:nw.web?.crossings?.length||0,added:nw.added}", "nakordoniDetails:{mode:x.crossings.length?(nw.added?'api_plus_web':'api'):(nw.web?.crossings?.length?'web_fallback':'error'),apiCount:x.crossings.length,webCount:nw.web?.crossings?.length||0,added:nw.added,freshnessMerge:true}")

aggregate.write_text(text, encoding='utf-8')

test_file = Path('test/aggregate.test.js')
tests = test_file.read_text(encoding='utf-8')
tests = tests.replace("import { mergeTelegram } from '../api/aggregate.js';", "import { mergeTelegram, mergeNakordoniWebRows } from '../api/aggregate.js';")
marker = "test('Nakordoni freshness merge promotes newer public-page data'"
if marker not in tests:
    tests += r'''

test('Nakordoni freshness merge promotes newer public-page data', () => {
  const api = [{
    id: 'api-grushiv', ppid: 'id_10', name: 'Грушів - Будоміж', country: 'Польща', countryCode: 'PL',
    direction: 'UA_EU', waitMin: 15, queueCars: 0, ageMin: 55,
    updatedAt: '2026-09-27T05:23:00.000Z', stale: false, confidence: 'medium',
    sources: [{ source: 'nakordoni', label: 'Nakordoni', value: 15, updatedAt: '2026-09-27T05:23:00.000Z', ageMin: 55 }]
  }];
  const web = [{
    id: 'web-grushiv', ppid: 'id_10', name: 'Грушів - Будоміж', country: 'Польща', countryCode: 'PL',
    direction: 'UA_EU', waitMin: 5, queueCars: 0, ageMin: 4,
    updatedAt: '2026-09-27T06:14:00.000Z', stale: false, confidence: 'medium',
    sources: [{ source: 'nakordoni', label: 'Nakordoni · web fallback', value: 5, updatedAt: '2026-09-27T06:14:00.000Z', ageMin: 4 }]
  }];
  const merged = mergeNakordoniWebRows(api, web);
  assert.equal(merged.added, 1);
  assert.equal(merged.rows[0].waitMin, 5);
  assert.equal(merged.rows[0].updatedAt, '2026-09-27T06:14:00.000Z');
  assert.equal(merged.rows[0].id, 'api-grushiv');
  assert.equal(merged.rows[0].sources.length, 2);
});

test('Nakordoni freshness merge keeps newer API data but still exposes web source', () => {
  const api = [{
    id: 'api-grushiv', name: 'Грушів - Будоміж', country: 'Польща', countryCode: 'PL',
    direction: 'UA_EU', waitMin: 7, queueCars: 1, ageMin: 2,
    updatedAt: '2026-09-27T06:16:00.000Z', stale: false,
    sources: [{ source: 'nakordoni', label: 'Nakordoni', value: 7, updatedAt: '2026-09-27T06:16:00.000Z', ageMin: 2 }]
  }];
  const web = [{
    id: 'web-grushiv', name: 'Грушів - Будоміж', country: 'Польща', countryCode: 'PL',
    direction: 'UA_EU', waitMin: 15, queueCars: 0, ageMin: 55,
    updatedAt: '2026-09-27T05:23:00.000Z', stale: false,
    sources: [{ source: 'nakordoni', label: 'Nakordoni · web fallback', value: 15, updatedAt: '2026-09-27T05:23:00.000Z', ageMin: 55 }]
  }];
  const merged = mergeNakordoniWebRows(api, web);
  assert.equal(merged.added, 0);
  assert.equal(merged.rows[0].waitMin, 7);
  assert.equal(merged.rows[0].sources.length, 2);
});
'''
    test_file.write_text(tests, encoding='utf-8')

print('Nakordoni freshness patch applied')
