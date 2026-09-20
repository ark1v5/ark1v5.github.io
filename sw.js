// Service Worker per ARK — rende il sito utilizzabile anche offline.
// v2: logging esplicito per capire eventuali errori silenziosi.

const SHELL_CACHE='ark-shell-v2';
const MEDIA_CACHE='ark-media-v2';
const SHELL_FILES=['./','./index.html'];

self.addEventListener('install',(event)=>{
  console.log('[SW] install');
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache)=>cache.addAll(SHELL_FILES))
      .then(()=>console.log('[SW] shell cache popolata OK'))
      .catch((err)=>console.error('[SW] errore popolando shell cache:',err))
  );
  self.skipWaiting();
});

self.addEventListener('activate',(event)=>{
  console.log('[SW] activate');
  event.waitUntil(
    caches.keys().then((keys)=>Promise.all(
      keys.filter((k)=>k!==SHELL_CACHE&&k!==MEDIA_CACHE).map((k)=>caches.delete(k))
    )).then(()=>self.clients.claim())
  );
});

function isMediaRequest(url){
  return /\.(png|jpe?g|gif|webp|svg|mp4|webm|mov)(\?.*)?$/i.test(url.pathname)
      || url.pathname.includes('/storage/v1/object/');
}

self.addEventListener('fetch',(event)=>{
  const req=event.request;
  if(req.method!=='GET')return;

  let url;
  try{ url=new URL(req.url); }catch(e){ return; }

  const isShellRequest = req.mode==='navigate'
    || url.pathname.endsWith('/index.html')
    || url.pathname.endsWith('/admin.html')
    || url.pathname==='/'||url.pathname.endsWith('/');

  if(isShellRequest && url.origin===self.location.origin){
    event.respondWith((async()=>{
      const cache=await caches.open(SHELL_CACHE);
      try{
        const res=await fetch(req);
        if(res && res.ok && !res.redirected){
          cache.put(req,res.clone()).catch((e)=>console.error('[SW] cache.put shell fallito:',e));
        }
        return res;
      }catch(err){
        console.warn('[SW] fetch fallito (probabile offline), uso cache:',err);
        const cached=await cache.match(req);
        return cached || (await cache.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  if(isMediaRequest(url)){
    event.respondWith((async()=>{
      const cache=await caches.open(MEDIA_CACHE);
      const cached=await cache.match(req);
      if(cached)return cached;
      try{
        const res=await fetch(req);
        if(res && res.ok && !res.redirected){
          cache.put(req,res.clone()).catch((e)=>console.error('[SW] cache.put media fallito:',e));
        }
        return res;
      }catch(err){
        console.warn('[SW] fetch media fallito e nessuna copia in cache:',err);
        return Response.error();
      }
    })());
    return;
  }
});
