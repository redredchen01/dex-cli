import { getVersion } from "../core/version.js";

export function getDashboardHtml(): string {
  const version = getVersion();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>dex dashboard</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,sans-serif;background:#0d1117;color:#c9d1d9;line-height:1.5}
  a{color:#58a6ff;text-decoration:none}
  header{background:#161b22;border-bottom:1px solid #30363d;padding:12px 24px;display:flex;align-items:center;justify-content:space-between}
  .logo{font-size:20px;font-weight:700;color:#f0f6fc;letter-spacing:-0.5px}
  .logo span{color:#58a6ff}
  .version{font-size:12px;color:#8b949e;margin-left:8px}
  main{max-width:960px;margin:0 auto;padding:24px}
  h2{font-size:16px;font-weight:600;color:#f0f6fc;margin-bottom:12px;border-bottom:1px solid #21262d;padding-bottom:8px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:32px}
  .card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px;cursor:pointer;transition:border-color .15s}
  .card:hover{border-color:#58a6ff}
  .card h3{font-size:14px;color:#f0f6fc;margin-bottom:4px}
  .card p{font-size:12px;color:#8b949e}
  .card .source{display:inline-block;font-size:10px;background:#21262d;color:#8b949e;border-radius:4px;padding:1px 6px;margin-top:8px}
  .panel{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px;margin-bottom:24px}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
  .stat{text-align:center}
  .stat .value{font-size:24px;font-weight:700;color:#58a6ff}
  .stat .label{font-size:12px;color:#8b949e}
  .config-table{width:100%;font-size:13px}
  .config-table td{padding:4px 8px;border-bottom:1px solid #21262d}
  .config-table td:first-child{color:#8b949e;width:140px}
  #output-panel{display:none}
  #output{background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:12px;font-family:"SF Mono",Menlo,monospace;font-size:13px;white-space:pre-wrap;max-height:400px;overflow-y:auto;color:#c9d1d9}
  .running{color:#d29922;font-style:italic}
  .error{color:#f85149}
  .spinner{display:inline-block;width:14px;height:14px;border:2px solid #30363d;border-top-color:#58a6ff;border-radius:50%;animation:spin .6s linear infinite;vertical-align:middle;margin-right:6px}
  @keyframes spin{to{transform:rotate(360deg)}}
  #skill-label{font-size:14px;color:#f0f6fc;margin-bottom:8px;font-weight:600}
</style>
</head>
<body>
<header>
  <div><span class="logo"><span>dex</span> dashboard</span><span class="version">v${version}</span></div>
  <span style="font-size:12px;color:#8b949e">localhost</span>
</header>
<main>
  <h2>Skills</h2>
  <div class="grid" id="skills"></div>

  <div id="output-panel">
    <h2 id="skill-label">Output</h2>
    <div id="output"></div>
    <br>
  </div>

  <h2>Usage (today)</h2>
  <div class="panel">
    <div class="stats" id="usage-stats">
      <div class="stat"><div class="value">-</div><div class="label">loading...</div></div>
    </div>
  </div>

  <h2>Configuration</h2>
  <div class="panel">
    <table class="config-table" id="config-table">
      <tr><td>loading...</td><td></td></tr>
    </table>
  </div>
</main>
<script>
(function(){
  async function loadSkills(){
    try{
      const res=await fetch('/api/skills');
      const skills=await res.json();
      const el=document.getElementById('skills');
      if(!skills.length){el.innerHTML='<p style="color:#8b949e">No skills registered</p>';return}
      el.innerHTML=skills.map(s=>
        '<div class="card" data-skill="'+s.name+'">'
        +'<h3>'+esc(s.name)+'</h3>'
        +'<p>'+esc(s.description)+'</p>'
        +'<span class="source">'+esc(s.source)+'</span>'
        +'</div>'
      ).join('');
      el.querySelectorAll('.card').forEach(c=>{
        c.addEventListener('click',()=>runSkill(c.dataset.skill));
      });
    }catch(e){console.error(e)}
  }

  async function loadUsage(){
    try{
      const res=await fetch('/api/usage');
      const u=await res.json();
      document.getElementById('usage-stats').innerHTML=
        '<div class="stat"><div class="value">'+fmt(u.totalTokens)+'</div><div class="label">total tokens</div></div>'
        +'<div class="stat"><div class="value">'+fmt(u.totalInputTokens)+'</div><div class="label">input tokens</div></div>'
        +'<div class="stat"><div class="value">'+fmt(u.totalOutputTokens)+'</div><div class="label">output tokens</div></div>'
        +'<div class="stat"><div class="value">$'+u.estimatedCost.toFixed(4)+'</div><div class="label">est. cost</div></div>'
        +'<div class="stat"><div class="value">'+u.entries+'</div><div class="label">invocations</div></div>';
    }catch(e){console.error(e)}
  }

  async function loadConfig(){
    try{
      const res=await fetch('/api/config');
      const c=await res.json();
      const rows=Object.entries(c).map(([k,v])=>
        '<tr><td>'+esc(k)+'</td><td>'+esc(String(v))+'</td></tr>'
      ).join('');
      document.getElementById('config-table').innerHTML=rows||'<tr><td>empty</td><td></td></tr>';
    }catch(e){console.error(e)}
  }

  async function runSkill(name){
    const panel=document.getElementById('output-panel');
    const out=document.getElementById('output');
    const label=document.getElementById('skill-label');
    panel.style.display='block';
    label.textContent='Running: '+name;
    out.innerHTML='<span class="running"><span class="spinner"></span>Executing skill...</span>';

    try{
      const res=await fetch('/api/run',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({skill:name,args:{},flags:{}})
      });
      const data=await res.json();
      if(data.error){
        out.innerHTML='<span class="error">Error: '+esc(data.error)+'</span>';
      }else{
        out.textContent=data.output||'(no output)';
      }
      label.textContent='Result: '+name;
      loadUsage();
    }catch(e){
      out.innerHTML='<span class="error">Request failed: '+esc(e.message)+'</span>';
    }
  }

  function fmt(n){
    if(n>=1e6)return (n/1e6).toFixed(1)+'M';
    if(n>=1e3)return (n/1e3).toFixed(1)+'K';
    return String(n);
  }
  function esc(s){
    const d=document.createElement('div');d.textContent=s;return d.innerHTML;
  }

  loadSkills();
  loadUsage();
  loadConfig();
})();
</script>
</body>
</html>`;
}
