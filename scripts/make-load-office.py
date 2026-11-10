# Build a scratch T3 home with N extra running sessions cloned from your real ones, to check
# how Lucid runs in a large busy office. Reads ~/.t3 read-only; writes only to the given folder.
# Usage: python3 scripts/make-load-office.py <scratch-folder> 60
# Then start Lucid with T3CODE_HOME=<scratch-folder> LUCID_AUTO_SCOPE="(none: load test)"
# and its own --user-data-dir. With no server or T3 program in that folder it cannot reach T3.
import sqlite3, sys, os, uuid, json, datetime
src = os.path.expanduser('~/.t3/userdata/statev2.sqlite')
home = sys.argv[1]; n = int(sys.argv[2])
os.makedirs(os.path.join(home, 'userdata'), exist_ok=True)
dst = os.path.join(home, 'userdata', 'statev2.sqlite')
for f in (dst, dst + '-wal', dst + '-shm'):
    if os.path.exists(f): os.remove(f)
s = sqlite3.connect(f'file:{src}?mode=ro', uri=True); d = sqlite3.connect(dst)
s.backup(d); s.close()
now = datetime.datetime.now(datetime.timezone.utc)
iso = lambda t: t.strftime('%Y-%m-%dT%H:%M:%S.') + f'{t.microsecond // 1000:03d}Z'
cols = lambda t: [r[1] for r in d.execute(f'pragma table_info({t})')]
# sources: real threads that have runs and messages, most recent first
srcs = [r[0] for r in d.execute("""select t.thread_id from orchestration_v2_projection_threads t
  where t.archived_at is null and t.deleted_at is null and t.thread_id not like 'thread:%'
  and json_extract(t.payload_json,'$.lineage.relationshipToParent') is null
  and exists (select 1 from orchestration_v2_projection_messages m where m.thread_id = t.thread_id)
  order by t.updated_at desc limit 12""")]
T = 'orchestration_v2_projection_'
for i in range(n):
    sid = srcs[i % len(srcs)]; nid = str(uuid.uuid4()); stamp = iso(now - datetime.timedelta(seconds=i * 7))
    started = iso(now - datetime.timedelta(minutes=1 + i % 40))
    c = cols(T + 'threads'); row = dict(zip(c, d.execute(f'select * from {T}threads where thread_id=?', (sid,)).fetchone()))
    p = json.loads(row['payload_json']); p.pop('settledAt', None); p.pop('settledOverride', None); p.pop('pinnedAt', None)
    p['title'] = f'Load {i + 1}: {row["title"]}'[:80]
    row.update(thread_id=nid, title=p['title'], updated_at=stamp, payload_json=json.dumps(p))
    d.execute(f'insert into {T}threads ({",".join(c)}) values ({",".join("?" * len(c))})', [row[k] for k in c])
    runmap = {}
    c = cols(T + 'runs'); runs = [dict(zip(c, r)) for r in d.execute(f'select * from {T}runs where thread_id=? order by ordinal', (sid,))]
    for k, r in enumerate(runs):
        rid = str(uuid.uuid4()); runmap[r['run_id']] = rid
        last = k == len(runs) - 1
        rp = json.loads(r['payload_json'])
        if last: rp['startedAt'] = started; rp.pop('completedAt', None)
        r.update(run_id=rid, thread_id=nid, status='running' if last else r['status'], completed_at=None if last else r['completed_at'], payload_json=json.dumps(rp))
        d.execute(f'insert into {T}runs ({",".join(c)}) values ({",".join("?" * len(c))})', [r[x] for x in c])
    for tbl, key in (('messages', 'message_id'), ('turn_items', 'turn_item_id')):
        c = cols(T + tbl)
        rows = [dict(zip(c, r)) for r in d.execute(f'select * from {T}{tbl} where thread_id=? order by rowid desc limit 400', (sid,))]
        for r in reversed(rows):
            r.update({key: str(uuid.uuid4()), 'thread_id': nid, 'run_id': runmap.get(r.get('run_id'), r.get('run_id'))})
            if tbl == 'turn_items': r['parent_item_id'] = None
            d.execute(f'insert into {T}{tbl} ({",".join(c)}) values ({",".join("?" * len(c))})', [r[x] for x in c])
d.commit()
print('sources', len(srcs), 'running now', d.execute(f"select count(*) from {T}runs where status='running'").fetchone()[0], 'threads', d.execute(f'select count(*) from {T}threads where archived_at is null and deleted_at is null').fetchone()[0])
