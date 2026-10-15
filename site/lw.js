// Shared Supabase layer for the controller and projector pages.
(function () {
  const cfg = window.LANTERN_CONFIG || {};
  const configured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey &&
    !cfg.supabaseUrl.includes('YOUR-PROJECT') && !cfg.supabaseAnonKey.includes('YOUR-ANON-KEY'));

  const libMissing = configured && !window.supabase;   // CDN didn't load (no internet)
  const sb = configured && !libMissing
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 20 } }
      })
    : null;

  const DRAWABLE = new Set(['rect', 'square']);
  const bucket = cfg.bucket || 'lanterns';

  // Database row -> what the pages use
  function toLantern(r) {
    return {
      id: r.id, shape: r.shape, color: r.color, wall: r.wall, proj: r.proj,
      canDraw: DRAWABLE.has(r.shape),
      imageUrl: r.image_path ? sb.storage.from(bucket).getPublicUrl(r.image_path).data.publicUrl : null
    };
  }

  const OFFLINE = "Can't reach the wall. Check the internet connection and try again.";
  function friendly(err) {
    const msg = (err && (err.message || err.error_description || err.error)) || '';
    if (/fetch|network|load failed|timed? ?out/i.test(msg)) return OFFLINE;
    return msg || 'Something went wrong. Try again.';
  }

  async function fetchAll() {
    const { data, error } = await sb.from('lanterns').select('*').order('id');
    if (error) throw new Error(friendly(error));
    return data.map(toLantern);
  }

  // Live updates. Refetches everything on (re)connect so nothing is missed.
  function subscribe({ onAll, onChange, onRemove, onStatus }) {
    const refresh = () => fetchAll().then(onAll).catch(err => console.error(err));
    sb.channel('lanterns-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lanterns' }, p => {
        if (p.eventType === 'DELETE') onRemove && onRemove(p.old.id);
        else onChange && onChange(toLantern(p.new));
      })
      .subscribe(status => {
        const open = status === 'SUBSCRIBED';
        onStatus && onStatus(open ? 'open' : 'closed');
        if (open) refresh();
      });
    refresh();
  }

  async function rpc(name, args) {
    let res;
    try { res = await sb.rpc(name, args); } catch (e) { throw new Error(friendly(e)); }
    if (res.error) {
      const e = new Error(friendly(res.error));
      e.badCode = /access code/i.test(res.error.message || '');
      throw e;
    }
    return res.data;
  }

  // Each upload gets a new file name, so the projector never shows a cached old drawing
  async function uploadPng(id, blob) {
    const path = `lantern-${id}/${Date.now()}.png`;
    let res;
    try {
      res = await sb.storage.from(bucket).upload(path, blob, {
        contentType: 'image/png', cacheControl: '31536000', upsert: false
      });
    } catch (e) { throw new Error(friendly(e)); }
    if (res.error) throw new Error(friendly(res.error));
    return path;
  }

  // Access codes: taken from ?code= in the link once, then remembered on this device
  const codes = {
    get(kind) { try { return localStorage.getItem('lw-code-' + kind) || ''; } catch { return ''; } },
    set(kind, v) { try { localStorage.setItem('lw-code-' + kind, v); } catch { /* private mode */ } },
    clear(kind) { try { localStorage.removeItem('lw-code-' + kind); } catch { /* ignore */ } },
    fromUrl(param, kind) {
      const url = new URL(location.href);
      const v = url.searchParams.get(param);
      if (v) {
        codes.set(kind, v);
        url.searchParams.delete(param);
        history.replaceState(null, '', url.pathname + url.search + url.hash);
      }
    }
  };

  async function checkCode(code, kind) {
    return !!(await rpc('check_access', { p_code: code, p_kind: kind }));
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';     // lets the iPad keep editing an existing drawing
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  window.LW = { configured: configured && !libMissing, libMissing, sb, fetchAll, subscribe, rpc, uploadPng, codes, checkCode, loadImage };
})();
