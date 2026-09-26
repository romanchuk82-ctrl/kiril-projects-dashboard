from pathlib import Path
p=Path('api/telegram.js')
s=p.read_text()
old="""    for (const name of ['x-ratelimit-requests-remaining', 'x-ratelimit-rapid-free-plans-hard-limit-remaining', 'x-ratelimit-rapid-free-plans-remaining']) {
      const value = Number(response.headers.get(name));
      if (Number.isFinite(value)) { quotaState = { remaining: value, observedAt: new Date().toISOString() }; break; }
    }
"""
new="""    let requestRemaining = null;
    for (const name of ['x-ratelimit-requests-remaining', 'x-ratelimit-rapid-free-plans-hard-limit-remaining', 'x-ratelimit-rapid-free-plans-remaining']) {
      const value = Number(response.headers.get(name));
      if (Number.isFinite(value)) { requestRemaining = value; break; }
    }
    const metric = prefix => {
      const value = name => { const n = Number(response.headers.get(name)); return Number.isFinite(n) ? n : null; };
      return { limit: value(`x-ratelimit-${prefix}-limit`), remaining: value(`x-ratelimit-${prefix}-remaining`), reset: value(`x-ratelimit-${prefix}-reset`) };
    };
    quotaState = {
      remaining: requestRemaining,
      observedAt: new Date().toISOString(),
      requests: metric('requests'),
      lookups: metric('lookups'),
      phone: metric('phone')
    };
"""
if old not in s:
    raise SystemExit('quota header target not found')
s=s.replace(old,new,1)
s=s.replace("quota: quotaState.remaining == null ? null : { remaining: quotaState.remaining, observedAt: quotaState.observedAt }", "quota: quotaState.remaining == null ? null : quotaState")
p.write_text(s)
