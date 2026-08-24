// 记账高手 Service Worker：离线可打开，联网自动同步
const CACHE = 'jizhang-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(()=>self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // 同步接口：网络优先，失败回退缓存
  if(url.pathname.endsWith('/api/ledger')){
    e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
    return;
  }
  // 静态资源：缓存优先
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(resp=>{ const cp=resp.clone(); caches.open(CACHE).then(c=>c.put(e.request,cp)); return resp; }).catch(()=>caches.match('./index.html'))));
});
