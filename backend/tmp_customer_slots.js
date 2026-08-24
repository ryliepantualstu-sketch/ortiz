const fetch = globalThis.fetch || require('node-fetch');
(async ()=>{
  try {
    const date = '2026-08-10';
    const res = await fetch(`http://localhost:3000/api/customer/available-slots?date=${date}`);
    const json = await res.json();
    console.log('status', res.status);
    console.log(JSON.stringify(json, null, 2));
  } catch (e) {
    console.error('error', e && e.message ? e.message : e);
  }
})();
