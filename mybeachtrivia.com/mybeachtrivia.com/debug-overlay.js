(function(){
  try{
    var box=document.createElement('div');
    box.id='debug-overlay';
    box.style.cssText='position:fixed;bottom:8px;right:8px;z-index:999999;background:rgba(0,0,0,.75);color:#0f0;padding:8px;font:12px monospace;max-width:48vw;max-height:40vh;overflow:auto;border:1px solid #0f0;border-radius:4px';
    box.textContent='[DEBUG] redirect traces will appear here…';
    document.addEventListener('DOMContentLoaded', function(){ document.body.appendChild(box); dump(); });
    function dump(){
      try{
        var arr=JSON.parse(sessionStorage.getItem('DEBUG_REDIR')||'[]');
        box.innerHTML = arr.slice(-20).map(x => {
          var d = new Date(x.t);
          return '<div>'+d.toLocaleTimeString()+': '+x.msg.replace(/</g,'&lt;')+'</div>';
        }).join('');
      }catch(e){}
      requestAnimationFrame(dump);
    }
  }catch(e){}
})();
