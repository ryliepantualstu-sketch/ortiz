/* Temporarily disable transitions during navigation to reduce flicker */
(function(){
  const CLASS = 'no-transitions';
  function disable(){
    try{ document.documentElement.classList.add(CLASS); document.body.classList.add(CLASS); }catch(e){}
  }
  function enable(){
    try{ setTimeout(()=>{ document.documentElement.classList.remove(CLASS); document.body.classList.remove(CLASS); }, 90); }catch(e){}
  }

  // Disable immediately to cover initial render
  disable();

  // Re-enable after DOM is ready
  window.addEventListener('DOMContentLoaded', enable);
  // Also handle bfcached pages
  window.addEventListener('pageshow', (ev)=>{ if(ev.persisted) enable(); });

  // When clicking internal links, disable before navigation to avoid transition during unload
  document.addEventListener('click', (e)=>{
    const a = e.target.closest && e.target.closest('a');
    if(!a) return;
    const href = a.getAttribute('href');
    if(!href) return;
    // only for same-origin navigations (relative links)
    if(a.target && a.target !== '' && a.target !== '_self') return;
    if(href.startsWith('http') && new URL(href, location.href).origin !== location.origin) return;
    disable();
  }, true);
})();
