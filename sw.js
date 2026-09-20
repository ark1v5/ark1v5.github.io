// Service Worker per ARK — rende il sito utilizzabile anche offline.
//
// Strategia:
// 1. "App shell" (index.html, admin.html): cache-first, così la pagina si apre
//    anche senza connessione. Viene aggiornata in background ad ogni visita.
// 2. Immagini/video del progetto (es. quelli caricati su Supabase Storage):
//    cache-first anch'essi, salvati man mano che l'utente li visualizza online.
//    Una volta visti una volta, restano disponibili offline.
// 3. Tutto il resto (API Supabase, richieste esterne non-media): passa dritto
//    alla rete, senza cache — i dati "freschi" restano gestiti dal codice
//    dell'app (che ha già il suo fallback su localStorage).

const SHELL_CACHE='ark-shell-v1';
const MEDIA_CACHE='ark-media-v1';
const SHELL_FILES=['./','./index.html'];

self.addEventListener('install',(event)=>{
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache)=>cache.addAll(SHELL_FILES)).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener('activate',(event)=>{
  event.waitUntil(
    caches.keys().then((keys)=>Promise.all(
      keys.filter((k)=>k!==SHELL_CACHE&&k!==MEDIA_CACHE).map((k)=>caches.delete(k))
    ))
  );
  self.clients.claim();
});

function isMediaRequest(url){
  // File immagine/video, e in particolare quelli serviti dallo storage Supabase
  return /\.(png|jpe?g|gif|webp|svg|mp4|webm|mov)(\?.*)?$/i.test(url.pathname)
      || url.pathname.includes('/storage/v1/object/');
}

self.addEventListener('fetch',(event)=>{
  const req=event.request;
  if(req.method!=='GET')return;

  const url=new URL(req.url);

  // 1) Pagine HTML dell'app (navigazioni e i due file principali)
  const isShellRequest = req.mode==='navigate'
    || url.pathname.endsWith('/index.html')
    || url.pathname.endsWith('/admin.html')
    || url.pathname==='/'||url.pathname.endsWith('/');

  if(isShellRequest && url.origin===self.location.origin){
    event.respondWith(
      caches.open(SHELL_CACHE).then((cache)=>
        fetch(req).then((res)=>{
          cache.put(req,res.clone());
          return res;
        }).catch(()=>cache.match(req).then((r)=>r||cache.match('./index.html')))
      )
    );
    return;
  }

  // 2) Immagini/video (locali o su Supabase Storage): cache-first
  if(isMediaRequest(url)){
    event.respondWith(
      caches.open(MEDIA_CACHE).then((cache)=>
        cache.match(req).then((cached)=>{
          if(cached)return cached;
          return fetch(req).then((res)=>{
            if(res && res.ok)cache.put(req,res.clone());
            return res;
          }).catch(()=>cached);
        })
      )
    );
    return;
  }

  // 3) Tutto il resto (API REST Supabase, font incorporati, ecc.): rete diretta
  // (i font sono già incorporati come base64 nell'HTML, quindi non passano da qui)
});
