import json, pathlib
S = pathlib.Path(__file__).parent
# Landing com a copy do site (pedido do marketing, 05/11/2026) e o celular enxuto.
# Monta site.html a partir do protótipo (index.src.html). Rodar: python3 site.build.py
src = (S/'index.src.html').read_text().split('\n')
head = '\n'.join(src[:380])        # até antes de </style>
led_js = '\n'.join(src[813:861])   # telão de LED (linhas 814-861)
pv = '\n'.join(src[863:])          # botão "Ver no celular"
assert src[380] == '</style>' and src[813].strip().startswith('/* ---------- telão') and src[863] == '<style>'

PIN='<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M12 2a7.5 7.5 0 0 1 7.5 7.5c0 5.5-7.5 12.5-7.5 12.5S4.5 15 4.5 9.5A7.5 7.5 0 0 1 12 2zm0 4.6a2.9 2.9 0 1 0 0 5.8 2.9 2.9 0 0 0 0-5.8z" fill="currentColor" /></svg>'
TV='<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4" width="19" height="13" rx="2.5" fill="currentColor" opacity="0.3" /> <rect x="8" y="18.6" width="8" height="2.4" rx="1.2" fill="currentColor" /> <path d="M4.5 6.5h15v8h-15z" fill="currentColor" opacity="0.55" /> <circle cx="18" cy="8.2" r="1.7" fill="var(--spark,#e8320c)" /></svg>'
BEER='<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h11v13.5a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 5 19.5z" fill="currentColor" opacity="0.3" /> <path d="M16 9h2.2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H16v-2h2v-4h-2z" fill="currentColor" opacity="0.3" /> <path d="M5 11h11v8.5a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 5 19.5z" fill="currentColor" /> <circle cx="7.4" cy="5.6" r="2.6" fill="var(--spark,#e8320c)" /> <circle cx="11" cy="4.6" r="2.9" fill="var(--spark,#e8320c)" /> <circle cx="14.2" cy="5.8" r="2.3" fill="var(--spark,#e8320c)" /></svg>'
PEOPLE='<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor" opacity="0.3"> <circle cx="16.5" cy="8" r="3.4" /> <path d="M12.5 20a5 5 0 0 1 9.5-1.8V20z" /> </g> <circle cx="9" cy="8" r="4" fill="currentColor" /> <path d="M2 20.5a7 7 0 0 1 14 0z" fill="currentColor" /></svg>'
CHECK='<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="m4.2 12.4 1.8-1.8 4 4 8-8 1.8 1.8-9.8 9.8z" fill="currentColor" /></svg>'
CAL='<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2.5" fill="currentColor" opacity="0.3" /> <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5V10H3z" fill="currentColor" /> <rect x="7" y="2.5" width="2.4" height="5" rx="1.2" fill="currentColor" /> <rect x="14.6" y="2.5" width="2.4" height="5" rx="1.2" fill="currentColor" /> <rect x="13" y="13.5" width="4.5" height="4.5" rx="1" fill="var(--spark,#e8320c)" /></svg>'
SEARCH='<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="m15.5 15.5 5 5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>'
STAR='<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" fill="currentColor" /></svg>'
PLUS='<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style="color:#12120f"><path d="M10.75 4h2.5v6.75H20v2.5h-6.75V20h-2.5v-6.75H4v-2.5h6.75z" fill="currentColor" /></svg>'
ARROW='<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.4 3.4 6.6 5.2 13.4 12l-6.8 6.8 1.8 1.8L17 12z" fill="currentColor" /></svg>'
LOGO='<svg width="{s}" height="{s}" viewBox="0 0 30 30" aria-hidden="true"><circle cx="14" cy="14" r="10.5" fill="none" stroke="currentColor" stroke-width="4.2"/><circle cx="22.4" cy="22.6" r="4.6" fill="#e8320c"/></svg>'
APP='https://claude.ai/artifact/Xp9wkyzJTbs3SDNbw9Jeme'
CTA=f'href="{APP}" target="_blank" rel="noopener"'

def facts(items): return '<ul class="facts">'+''.join(f'<li>{i}{t}</li>' for i,t in items)+'</ul>'

FAQ=[('A Onside já funciona na minha cidade?','O cadastro está aberto para torcedores e bares de qualquer cidade. Os bares aparecem na busca conforme se cadastram, então a quantidade de opções varia de um lugar para outro.'),
('A Onside é gratuita para torcedores?','Sim. Buscar partidas, comparar bares e consultar as informações é gratuito para torcedores.'),
('O que posso comparar?','A infraestrutura do bar, o preço médio, a distância e as partidas transmitidas.'),
('É só para futebol?','Não. Futebol é o ponto de partida, mas a busca inclui basquete, vôlei, automobilismo, lutas e outros eventos.'),
('O que acontece com meus dados?','Usamos seu e-mail para criar a conta e confirmar o cadastro. Os detalhes estão na Política de Privacidade.')]
faq=''.join(f'<details{" open" if i==0 else ""}><summary>{q}<span class="pm" aria-hidden="true">{PLUS}</span></summary><p>{a}</p></details>' for i,(q,a) in enumerate(FAQ))

def words(txt, start=.05, step=.06, cls=''):
    out=[];d=start
    for w in txt.split(' '):
        out.append(f'<span class="w{cls}" style="animation-delay:{d:.2f}s">{w}</span>');d+=step
    return ' '.join(out), d

h1a,d=words('“Onde vai passar o jogo?” finalmente tem uma')
h1b,d=words('(ótima)',d+.04,cls=' r')
h1c,_=words('resposta.',d+.04)

css = r'''
/* ---------- copy do site (pedido do marketing, 05/11) ---------- */
.kick{display:inline-flex;align-items:center;gap:10px;margin:0 0 22px;font:600 13px/1 var(--mono);text-transform:uppercase;letter-spacing:.1em;color:var(--muted)}
.kick::before{content:"";width:8px;height:8px;background:var(--red)}
.on-ink .kick,.hero .kick,.final .kick{color:var(--muted-ink)}
.on-ink .kick::before,.hero .kick::before,.final .kick::before{background:var(--acid)}
.hero .kick{margin-bottom:24px}
.hero h1{font-size:clamp(54px,6.5vw,106px);line-height:1}
.cta-lead{margin:30px 0 0;max-width:44ch;font:600 16px/1.45 var(--body);color:var(--paper)}
.cta-lead svg{display:inline-block;vertical-align:-3px;color:var(--acid);transform:rotate(90deg)}
.search{margin-top:16px}
.ticker .it.bn{color:var(--paper)}
.ticker .it.bn::before{content:"";width:8px;height:8px;background:var(--acid)}

/* o problema: o que o mapa e o perfil mostram */
.pile{position:relative;min-height:680px}
.ev{position:absolute;background:var(--white);border-radius:22px;padding:14px;box-shadow:0 3px 0 var(--sand),0 30px 60px -36px rgba(18,18,15,.55)}
.ev .num{position:absolute;z-index:2;top:-14px;left:-14px;width:38px;height:38px;border-radius:50%;background:var(--red);color:#fff;display:grid;place-items:center;font:700 13px/1 var(--mono);box-shadow:0 3px 0 #8f1f07}
.ev-photo{left:0;top:0;width:60%;transform:rotate(-4deg)}
.ev-photo .ph{position:relative;aspect-ratio:4/3;border-radius:14px;background:#2a2a24 url(a/tela-bar.webp) 50% 12%/220% auto no-repeat;filter:grayscale(.9) sepia(.3) brightness(.92) contrast(.88)}
.ev-photo .cap{display:flex;flex-direction:column;gap:5px;margin-top:11px;font:500 12px/1.2 var(--mono);color:var(--muted)}
.ev-photo .cap b{font:700 13px/1.2 var(--body);color:var(--ink)}
.stamp{position:absolute;right:26px;top:30px;transform:rotate(7deg);padding:7px 9px;border:2px solid var(--red);border-radius:7px;background:rgba(251,250,246,.9);color:var(--red);font:700 12px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase}
.ev-rev{right:0;top:40%;width:62%;transform:rotate(2.5deg);padding:16px 18px 18px}
.ev-rev .hd{display:flex;align-items:center;gap:8px;font:700 15px/1.2 var(--body)}
.ev-rev .hd small{font:500 12.5px/1 var(--mono);color:var(--muted);margin-left:auto}
.stars{display:inline-flex;gap:1px;color:var(--ink)}
.rev{margin-top:12px;padding-top:12px;border-top:1px solid var(--stone);font-size:14.5px;line-height:1.45;color:#3d3d38}
.rev .who{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;font:700 13px/1 var(--body);color:var(--ink)}
.ask{position:absolute;right:-10px;bottom:-20px;transform:rotate(-4deg);padding:9px 13px;border-radius:14px 14px 4px 14px;background:var(--red);color:#fff;font:700 14px/1 var(--body);box-shadow:0 3px 0 #8f1f07}
.ev-chat{left:5%;bottom:0;width:62%;transform:rotate(-1.5deg);display:flex;flex-direction:column;gap:7px;padding:18px 16px 16px;background:var(--stone)}
.ev-chat .m{background:var(--white);font-size:14.5px;max-width:86%}
.ev-chat .m.me{background:var(--ink)}
.pains .ic{background:var(--red);color:#fff;font:700 15px/1 var(--mono);box-shadow:0 3px 0 #8f1f07}

/* escolha com confiança */
.conf{background:var(--stone)}
.conf .lede{margin-top:26px;font-size:clamp(19px,1.6vw,23px);max-width:44ch}
.conf .lede b{background:linear-gradient(transparent 58%,var(--acid) 58%)}
.note{padding:22px 22px 22px 24px}
.note .n{width:36px;height:36px;top:-15px;font-size:12.5px}
.note b{font:400 clamp(26px,2.3vw,34px)/1.02 var(--display);text-transform:uppercase}
.closing{margin:72px auto 0;max-width:34ch;text-align:center;font:600 clamp(21px,1.9vw,27px)/1.35 var(--body);text-wrap:balance}
.closing b{font-weight:800;color:var(--red)}

/* ocasiões */
.occ-grid{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:clamp(40px,6vw,96px);align-items:center}
.occ-grid .lede{margin-top:26px;color:#3d3d38}
.occ{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:14px}
.occ li{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:18px;align-items:center;padding:22px 24px;border-radius:26px;background:var(--white);box-shadow:0 3px 0 var(--sand);transition:transform .35s var(--ease)}
.occ li:hover{transform:translateY(-3px)}
.occ .n{font:600 14px/1 var(--mono);color:var(--muted)}
.occ b{font:400 clamp(40px,4.6vw,68px)/1 var(--display);text-transform:uppercase;padding-top:.04em}
.occ .tg{display:inline-flex;align-items:center;gap:8px;height:38px;padding:0 15px;border-radius:999px;background:var(--stone);font:600 14px/1 var(--body);white-space:nowrap}
.occ li.hl{background:var(--acid);box-shadow:0 4px 0 #7f9a12;transform:rotate(-1.2deg)}
.occ li.hl:hover{transform:rotate(-1.2deg) translateY(-3px)}
.occ li.hl .n{color:var(--ink)}
.occ li.hl .tg{background:var(--ink);color:var(--acid);--spark:#c9f135}

/* comunidade e história */
.com{max-width:1120px}
.com h2{font-size:clamp(42px,5.6vw,88px)}
.com .lede{margin-top:28px;color:var(--soft-ink)}
.com .btn{margin-top:36px}
.story-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);gap:clamp(40px,7vw,120px);align-items:center}
.story-grid h2 .r{color:var(--red)}
.story-grid p{margin:24px 0 0;max-width:56ch;font-size:clamp(17px,1.3vw,19px);color:#3d3d38}
.story-grid p.strong{font-weight:700;color:var(--ink)}
.story-grid .btn{margin-top:34px}
.mark{justify-self:center;width:min(380px,80%);color:var(--ink)}
.mark svg{width:100%;height:auto;display:block;animation:spin 40s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

/* final */
.final h2{font-size:clamp(56px,8.4vw,136px);line-height:1}
.final h2 .r{display:block}
.final .acts{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:40px}
.final .acts .btn{height:62px;padding:0 32px;font-size:18px}
.final .trigger{justify-content:center;margin:26px 0 0}

/* rodapé do site */
.foot-grid{display:grid;grid-template-columns:minmax(0,1.2fr) repeat(5,minmax(0,1fr));gap:32px;padding-block:64px 40px}
.foot-lead p{margin:16px 0 22px;max-width:26ch;color:var(--soft-ink);font-size:15px}
.foot-lead .btn{height:46px;font-size:14.5px;padding:0 18px;box-shadow:0 3px 0 #7f9a12}
.foot nav.foot-col{display:block}
.foot-col p{margin:0 0 14px;font:600 12px/1 var(--mono);text-transform:uppercase;letter-spacing:.1em;color:var(--paper)}
.foot-col a,.foot-col button{display:block;margin:0 0 10px;padding:0;border:0;background:none;color:var(--muted-ink);font:500 14.5px/1.4 var(--body);text-decoration:none;cursor:pointer;text-align:left}
.foot-col a:hover,.foot-col button:hover{color:var(--paper)}
.foot-bar{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-block:22px calc(22px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--ink-line);font:500 13px/1 var(--mono)}
.foot-bar .st{display:inline-flex;gap:8px;align-items:center}
.foot-bar .st::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--acid)}

/* barra fixa no celular */
.sticky{position:fixed;z-index:55;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));display:none;align-items:center;justify-content:space-between;gap:12px;padding:7px 7px 7px 18px;border-radius:999px;background:rgba(18,18,15,.9);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:var(--paper);font:600 14px/1.2 var(--body);box-shadow:0 18px 40px -20px rgba(0,0,0,.8);transform:translateY(160%);transition:transform .45s var(--ease)}
.sticky.on{transform:none}
.sticky .btn{height:44px;padding:0 16px;font-size:14px;box-shadow:0 3px 0 #7f9a12}

@media (max-width:1100px){
  .occ-grid,.story-grid{grid-template-columns:1fr}
  .mark{width:min(240px,60%);justify-self:start;order:-1}
  .foot-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
  .foot-lead{grid-column:1/-1}
  .pile{max-width:620px;width:100%;justify-self:center}
}

/* celular dos três passos menor: cabe na tela com folga */
.stick{top:calc(50vh - min(34vh,320px));height:min(68vh,640px)}
@media (max-width:900px){.step .mphone{width:54%}}
/* telão no celular: grade fina numa faixa, véu mais leve */
@media (max-width:1100px){
  .hero .led{top:auto;bottom:58px;height:min(900px,62%)}
  .hero::before{background:linear-gradient(180deg,rgba(18,18,15,1) 0%,rgba(18,18,15,.9) 32%,rgba(18,18,15,.5) 56%,rgba(18,18,15,.12) 80%,rgba(18,18,15,.85) 100%)}
  .ver::before{background:linear-gradient(180deg,rgba(18,18,15,.86) 0%,rgba(18,18,15,.55) 50%,rgba(18,18,15,.86) 100%)}
  .final::before{background:linear-gradient(180deg,rgba(18,18,15,.72) 0%,rgba(18,18,15,.42) 50%,rgba(18,18,15,.8) 100%)}
}
@media (max-width:900px){.sticky{display:flex}}
@media (max-width:640px){
  .hero h1{font-size:clamp(44px,12.4vw,64px)}
  .pile{min-height:0;display:flex;flex-direction:column;gap:30px;padding:14px 4px 0 14px}
  .ev{position:relative;left:auto;right:auto;top:auto;bottom:auto;width:92%}
  .ev-rev{align-self:flex-end}
  .ask{right:-4px}
  .occ li{grid-template-columns:30px minmax(0,1fr);gap:4px 12px;padding:18px}
  .occ .tg{grid-column:2;justify-self:start;margin-top:8px}
  .closing{margin-top:44px}
  .foot-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:28px 20px;padding-top:48px}
}
/* ---------- celular: uma ideia por tela ---------- */
.evt,.rail-dots{display:none}
@media (max-width:640px){
  .sec{padding-top:64px;padding-bottom:64px}
  .hero-phone,.hero .trigger,.final .trigger{display:none}
  .hero .lede{font-size:16px}
  .hero .led{height:260px!important;bottom:52px}
  .hero-in{padding-bottom:150px}
  .hero::before{background:linear-gradient(180deg,rgba(18,18,15,1) 0%,rgba(18,18,15,.96) 62%,rgba(18,18,15,.35) 80%,rgba(18,18,15,.85) 100%)!important}
  /* o problema vira um carrossel: cada prova com a sua dor embaixo */
  .pile{flex-direction:row;gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;margin:0 calc(var(--gut) * -1) 0 calc(var(--gut) * -1);margin-right:calc(var(--gut-r) * -1);padding:20px var(--gut-r) 8px var(--gut);scrollbar-width:none;align-items:flex-start}
  .pile::-webkit-scrollbar{display:none}
  .ev{flex:0 0 80%;width:auto;transform:none;scroll-snap-align:center}
  .ev-rev,.ev-chat{transform:none}
  .ev .num{top:-12px;left:-6px}
  .ask{right:8px;bottom:auto;top:-14px;transform:rotate(3deg)}
  .evt{display:block;margin:14px 2px 2px;padding-top:12px;border-top:1px dashed var(--sand);font:500 14px/1.45 var(--body);color:#3d3d38}
  .evt b{display:block;margin-bottom:3px;font:700 16px/1.25 var(--body);color:var(--ink)}
  .ev-chat .evt{border-color:rgba(18,18,15,.18)}
  .pains-wrap{display:none}
  .rail-dots{display:flex;justify-content:center;gap:6px;margin-top:12px}
  .rail-dots i{width:22px;height:4px;border-radius:4px;background:var(--sand);transition:background .3s,width .3s}
  .rail-dots i.on{width:34px;background:var(--ink)}
  /* escolha com confiança: tela menor, notas curtas */
  .anno .phone{width:54%!important;margin-inline:auto}
  .note{padding:20px 16px 12px 18px}
  .note b{font-size:21px}
  .closing{margin-top:32px;font-size:18px}
  /* ocasiões em fila */
  .occ{flex-direction:row;overflow-x:auto;scroll-snap-type:x mandatory;margin:0 calc(var(--gut-r) * -1) 0 calc(var(--gut) * -1);padding:6px var(--gut-r) 10px var(--gut);scrollbar-width:none}
  .occ::-webkit-scrollbar{display:none}
  .occ li{flex:0 0 66%;scroll-snap-align:start;grid-template-columns:1fr;gap:10px;padding:18px}
  .occ li.hl{transform:none}
  .occ .n{display:none}
  .occ b{font-size:36px}
  .occ .tg{grid-column:1;margin-top:0;height:34px;font-size:13px}
  /* nota e medalha: o essencial */
  .weigh,.mpick,.medal-cap .lad{display:none}
  .medal-wrap .stage{height:300px}
  .medal-cap p{font-size:14px}
  /* para bares: só os títulos */
  .pts p,.pub .browser{display:none}
  .pts{gap:10px}
  .pts>div{padding:14px 0}
  /* rodapé curto */
  .foot-lead p,.foot-lead .btn,.foot-col[aria-label="Conta"]{display:none}
  .foot-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:22px 16px;padding-block:36px 24px}
  .foot-col a,.foot-col button{margin-bottom:7px;font-size:14px}
}

'''

body = f'''
<nav class="nav" id="nav" aria-label="Principal">
  <a class="logo" href="#top" aria-label="Onside, início">{LOGO.format(s=30)}<b>ONSIDE<i></i></b></a>
  <div class="links">
    <a href="#produto">A Onside</a>
    <a href="#como">Como funciona</a>
    <a href="#perguntas">Dúvidas</a>
  </div>
  <div class="right">
    <a class="btn btn-ghost" href="#para-bares">Cadastre seu bar</a>
    <a class="btn btn-acid" {CTA}>Entrar / Criar conta</a>
  </div>
</nav>

<main id="top">
<!-- ================= HERO ================= -->
<section class="hero" id="hero" aria-labelledby="h1">
  <canvas class="led" data-led="hero" data-mode="hero" aria-hidden="true"></canvas>
  <div class="wrap hero-in">
    <div>
      <div class="live-pill"><span class="dot"></span>Onside · no ar nas primeiras cidades</div>
      <h1 id="h1" class="disp">{h1a} {h1b} {h1c}</h1>
      <p class="lede">Com a Onside, você vai encontrar bares com a melhor infraestrutura para chamar seus amigos e assistir ao jogo, comparando localização e preço antes de sair de casa.</p>
      <p class="cta-lead">Acesse o app gratuitamente e encontre o bar perfeito para assistir ao seu próximo jogo {ARROW}</p>
      <div class="search">
        <form id="busca" aria-label="Buscar bares por jogo">
          <div class="field">
            <label for="q-jogo">Qual jogo você quer ver?</label>
            <div class="sel"><select id="q-jogo"></select></div>
          </div>
          <div class="field">
            <label for="q-onde">Onde</label>
            <div class="sel"><select id="q-onde">
              <option>Vila Madalena</option><option>Pinheiros</option><option>Moema</option><option>Tatuapé</option><option>Botafogo, Rio</option>
            </select></div>
          </div>
          <button class="btn btn-acid go" type="submit">Ver bares {ARROW}</button>
        </form>
        <div class="trigger">
          <span>{CHECK}Grátis para torcedores</span>
          <span>{CHECK}Sem e-mails promocionais</span>
          <span>{CHECK}Grade confirmada pelos bares</span>
        </div>
        <div id="res" aria-live="polite"></div>
      </div>
    </div>

    <div class="hero-phone">
      <div class="float f1"><span class="av" style="background:#e8320c;color:#fff">M</span><span><b>Marina vai assistir</b><small>Bar do Zé · 21:30</small></span></div>
      <div class="float f2"><span class="av" style="background:#12120f;color:#c9f135">{TV}</span><span><b>3 telões, som ligado</b><small>informado pelo bar</small></span></div>
      <div class="float f3"><span class="av" style="background:#12120f;color:#c9f135">$$</span><span><b>Preço médio</b><small style="color:#3d3d38">R$ 80 por pessoa</small></span></div>
      <div class="phone"><img src="a/tela-explorar.webp" alt="Tela Explorar do app Onside: mapa de Vila Madalena e Pinheiros com 8 bares com jogo hoje" width="448" height="976" fetchpriority="high"></div>
    </div>
  </div>
  <div class="ticker" aria-label="Jogos de hoje">
    <div class="track" id="ticker"></div>
  </div>
</section>

<!-- ================= O PROBLEMA (Google Maps e Instagram) ================= -->
<section class="sec wrap" id="produto" aria-labelledby="h-prob">
  <p class="kick rv">O problema</p>
  <h2 id="h-prob" class="disp rv">Google Maps e Instagram <span class="h2-2">não mostram como o lugar realmente é em dia de jogo.</span></h2>
  <div class="prob">
    <div class="pile rv" aria-hidden="true" id="pile">
      <div class="ev ev-photo"><span class="num">01</span>
        <div class="ph"><span class="stamp">Sem jogo na foto</span></div>
        <div class="cap"><b>Bar do Zé</b><span>publicada há 2 anos</span></div>
        <p class="evt"><b>Fotos avulsas e desatualizadas.</b>As imagens mostram o ambiente, mas raramente mostram como ele funciona em dia de jogo.</p>
      </div>
      <div class="ev ev-rev"><span class="num">02</span>
        <div class="hd"><span class="stars">{STAR*4}</span>4,4<small>1.284 avaliações</small></div>
        <div class="rev"><span class="who">Carla M.<span class="stars">{STAR*5}</span></span>Porção de fritas ótima e garçom muito atencioso. Preço justo!</div>
        <div class="rev"><span class="who">Rodrigo S.<span class="stars">{STAR*4}</span></span>Ambiente agradável, chopp gelado. Voltaria com a família.</div>
        <span class="ask">E em dia de jogo?</span>
        <p class="evt"><b>Avaliações que não respondem sua dúvida.</b>Elas falam da comida, dos preços e do atendimento, mas quase nada sobre a experiência durante uma partida.</p>
      </div>
      <div class="ev ev-chat"><span class="num">03</span>
        <div class="m"><span class="who" style="color:#c4290a">Lucas</span>será que passa o jogo lá?</div>
        <div class="m"><span class="who" style="color:#2f55c7">Rafa</span>sei lá, e se tiver sem som</div>
        <div class="m me">melhor ver em casa de novo</div>
        <p class="evt"><b>No fim, falta confiança.</b>Você não sabe se o lugar combina com o jogo e decide assistir em casa de novo.</p>
      </div>
    </div>
    <div class="rail-dots" id="pdots" aria-hidden="true"><i class="on"></i><i></i><i></i></div>
    <div class="pains-wrap">
      <ul class="pains">
        <li class="rv"><span class="ic">01</span><span><b>Fotos avulsas e desatualizadas.</b><p>As imagens mostram o ambiente, mas raramente mostram como ele funciona em dia de jogo.</p></span></li>
        <li class="rv"><span class="ic">02</span><span><b>Avaliações que não respondem sua dúvida.</b><p>Elas falam da comida, dos preços e do atendimento, mas quase nada sobre a experiência durante uma partida.</p></span></li>
        <li class="rv"><span class="ic">03</span><span><b>No fim, falta confiança.</b><p>Você não sabe se o lugar combina com o jogo e decide assistir em casa de novo.</p></span></li>
      </ul>
    </div>
  </div>
</section>

<!-- ================= ESCOLHA COM CONFIANÇA ================= -->
<section class="conf" id="bar-por-dentro" aria-labelledby="h-anno">
  <div class="wrap sec">
    <p class="kick rv">Escolha com confiança</p>
    <h2 id="h-anno" class="disp rv">Garanta que a experiência vai ser boa <span class="h2-2" style="display:inline">antes</span> de convidar a galera.</h2>
    <p class="lede rv">Com a Onside você <b>não precisa arriscar.</b> Aqui, você escolhe um bar já sabendo:</p>
    <div class="anno" id="anno">
      <svg class="lines" id="lines" aria-hidden="true"></svg>
      <div class="col l">
        <div class="note rv" data-to="0"><span class="n">01</span><b>Se tem infraestrutura.</b></div>
      </div>
      <div class="phone" id="annophone"><img src="a/tela-bar.webp" alt="Página do Bar do Zé no app: preço médio por pessoa, o jogo de hoje no telão, a infraestrutura do bar e quantas pessoas vão" width="448" height="976" loading="lazy">
        <span class="target" style="left:40%;top:74%"><span>1</span></span>
        <span class="target" style="left:66%;top:34.6%"><span>2</span></span>
        <span class="target" style="left:86%;top:72.4%"><span>3</span></span>
      </div>
      <div class="col r">
        <div class="note rv" data-to="1"><span class="n">02</span><b>O preço médio do cardápio.</b></div>
        <div class="note rv" data-to="2"><span class="n">03</span><b>Como vai estar no dia do jogo.</b></div>
      </div>
    </div>
    <p class="closing rv">Tudo pensado para que, quando o convite seja feito, você tenha a certeza de que escolheu <b>o lugar perfeito.</b></p>
  </div>
</section>

<!-- ================= COMO FUNCIONA ================= -->
<section class="how on-ink" id="como" aria-labelledby="h-how">
  <div class="wrap sec" style="padding-bottom:12vh">
    <p class="kick rv">Como funciona</p>
    <h2 id="h-how" class="disp rv">Tudo isso seguindo apenas <span class="h2-2">três passos simples.</span></h2>
    <div class="mnav" aria-hidden="true"><div class="digits" id="mdigits"><span>1</span><span>8</span><span class="c">:</span><span>0</span><span>0</span></div><div class="prog" id="mprog"><i class="on"></i><i></i><i></i></div><span class="mhint">deslize{ARROW}</span></div>
    <div class="how-grid">
      <div class="steps" id="steps">
        <article class="step on" data-i="0" data-t="18:00">
          <div class="clock">01 · 18:00</div>
          <h3>Busque seu jogo.</h3>
          <span class="q">Flamengo × Palmeiras</span>
          <p>Procure por time, campeonato ou esporte.</p>
          {facts([(SEARCH,'Time'),(SEARCH,'Campeonato'),(SEARCH,'Esporte')])}
          <div class="mphone phone"><img src="a/tela-explorar.webp" alt="" loading="lazy" width="448" height="976"></div>
        </article>
        <article class="step" data-i="1" data-t="18:40">
          <div class="clock">02 · 18:40</div>
          <h3>Compare o ambiente.</h3>
          <p>Veja distância, infraestrutura, preço médio, telões e perfil da torcida.</p>
          {facts([(PIN,'Distância'),(TV,'Infraestrutura e telões'),(BEER,'Preço médio'),(PEOPLE,'Perfil da torcida')])}
          <div class="mphone phone"><img src="a/tela-ia.webp" alt="" loading="lazy" width="448" height="976"></div>
        </article>
        <article class="step" data-i="2" data-t="19:30">
          <div class="clock">03 · 19:30</div>
          <h3>Vá sabendo o que esperar.</h3>
          <p>Escolha o bar, chame a galera e confira quando a informação foi atualizada.</p>
          {facts([(CHECK,'Escolha o bar'),(PEOPLE,'Chame a galera'),(CAL,'Informação atualizada')])}
          <div class="mphone phone"><img src="a/tela-vou.webp" alt="" loading="lazy" width="448" height="976"></div>
        </article>
      </div>
      <div class="stick" aria-hidden="true">
        <div class="board"><div class="digits" id="digits"><span>1</span><span>8</span><span class="c">:</span><span>0</span><span>0</span></div><div class="prog" id="prog"><i class="on"></i><i></i><i></i></div></div>
        <div class="phone"><div class="screens" id="screens">
          <img class="on" src="a/tela-explorar.webp" alt="" width="448" height="976">
          <img src="a/tela-ia.webp" alt="" width="448" height="976" loading="lazy">
          <img src="a/tela-vou.webp" alt="" width="448" height="976" loading="lazy">
        </div></div>
      </div>
    </div>
  </div>
</section>

<!-- ================= OCASIÕES ================= -->
<section class="sec wrap" aria-labelledby="h-occ">
  <div class="occ-grid">
    <div>
      <p class="kick rv">Um lugar para cada ocasião</p>
      <h2 id="h-occ" class="disp rv" style="font-size:clamp(44px,5.4vw,84px)">Encontre o espaço certo <span class="h2-2">para o seu jeito de torcer.</span></h2>
      <p class="lede rv">Às vezes você até conhece um bom lugar para ver o jogo, mas ele é caro ou distante demais para alguém. Não importa se você procura o barato, o animado ou o mais tranquilo: a Onside ajuda a comparar as opções antes de sair.</p>
    </div>
    <ul class="occ">
      <li class="rv"><span class="n">01</span><b>O barato</b><span class="tg">{BEER}Preço médio $</span></li>
      <li class="rv hl"><span class="n">02</span><b>O animado</b><span class="tg">{TV}Som no jogo · torcida</span></li>
      <li class="rv"><span class="n">03</span><b>O mais tranquilo</b><span class="tg">{PEOPLE}Ambiente calmo</span></li>
    </ul>
  </div>
</section>

''' + '\n'.join(src[562:598]) + f'''

<!-- ================= ESPORTES ================= -->
<section class="sports" aria-label="Esportes na Onside">
  <div class="row a" aria-hidden="true" id="rowA"></div>
  <div class="row b" aria-hidden="true" id="rowB"></div>
  <p style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Futebol, basquete, vôlei, automobilismo, lutas e outros eventos.</p>
</section>

<!-- ================= O ESPORTE É ENCONTRO ================= -->
<section class="ver on-ink" aria-labelledby="h-com">
  <canvas class="led" data-led="hero" data-mode="soft" aria-hidden="true"></canvas>
  <div class="wrap sec">
    <div class="com">
      <p class="kick rv">O esporte é encontro</p>
      <h2 id="h-com" class="disp rv">O esporte é, e sempre foi, sobre viver momentos bons ao lado de quem tem o <span class="h2-2" style="display:inline">mesmo espírito torcedor.</span></h2>
      <p class="lede rv">O jogo no estádio é um evento raro. Por que esperar por ele para viver esses momentos, se você pode encontrar o bar certo e chamar os seus amigos?</p>
      <a class="btn btn-acid rv" {CTA}>Entrar / Criar conta</a>
    </div>
  </div>
</section>

'''

# Para bares fica como no protótipo: o site atual não tem essa seção.
pub = '\n'.join(src[599:625])
assert '<!-- ================= PARA BARES' in pub and pub.rstrip().endswith('</section>')

body += pub + f'''

<!-- ================= FAQ ================= -->
<section class="sec wrap" id="perguntas" aria-labelledby="h-faq">
  <div class="faq-grid">
    <div>
      <p class="kick rv">Dúvidas frequentes</p>
      <h2 id="h-faq" class="disp rv" style="font-size:clamp(46px,5.4vw,84px)">O que você precisa <span class="h2-2">saber antes de sair de casa.</span></h2>
    </div>
    <div class="faq">{faq}</div>
  </div>
</section>

<!-- ================= FINAL ================= -->
<section class="final" id="comecar" aria-labelledby="h-final">
  <canvas class="led" data-led="scarf" data-mode="soft" aria-hidden="true"></canvas>
  <div class="wrap sec">
    <p class="kick rv">ONSIDE · O jogo é aqui</p>
    <h2 id="h-final" class="disp rv">Onde vai passar o próximo jogo? <span class="r">A resposta está aqui.</span></h2>
    <div class="acts rv"><a class="btn btn-acid" {CTA}>Entrar / Criar conta</a><a class="btn btn-ghost" style="color:var(--paper)" href="#como">Como funciona</a></div>
    <div class="trigger rv"><span>{CHECK}Grátis</span><span>{CHECK}Sem e-mails promocionais</span><span>{CHECK}Grade confirmada pelos bares</span></div>
    <p class="alt">Tem um bar? <a href="#para-bares" style="color:var(--paper);font-weight:700">Cadastre seu bar</a></p>
  </div>
</section>
</main>

<footer class="foot">
  <div class="wrap foot-grid">
    <div class="foot-lead">
      <a class="logo" href="#top" aria-label="Onside, início" style="color:var(--paper)">{LOGO.format(s=26)}<b style="font-size:22px">ONSIDE<i></i></b></a>
      <p>Feito por quem prefere a mesa ao sofá.</p>
      <a class="btn btn-acid" {CTA}>Entrar / Criar conta</a>
    </div>
    <nav class="foot-col" aria-label="Produto"><p>Produto</p><a href="#produto">A Onside</a><a href="#como">Como funciona</a><a href="#perguntas">Dúvidas</a><a href="#">Guia</a></nav>
    <nav class="foot-col" aria-label="Conta"><p>Conta</p><a {CTA}>Entrar</a><a {CTA}>Criar conta</a></nav>
    <nav class="foot-col" aria-label="Para bares"><p>Para bares</p><a href="#para-bares">Cadastre seu bar</a><a href="mailto:contato@onside.sh">Fale com a gente</a></nav>
    <nav class="foot-col" aria-label="Onside"><p>Onside</p><a href="mailto:contato@onside.sh">Contato</a><a href="#">Termos</a><a href="#">Privacidade</a><button type="button">Cookies</button></nav>
    <nav class="foot-col" aria-label="Redes sociais"><p>Redes sociais</p><a href="https://www.instagram.com/onside.sh/" target="_blank" rel="noopener noreferrer">Instagram</a><a href="https://x.com/onside_sh" target="_blank" rel="noopener noreferrer">X</a><a href="https://www.tiktok.com/@onside.sh" target="_blank" rel="noopener noreferrer">TikTok</a></nav>
  </div>
  <div class="wrap foot-bar"><span>© 2026 Onside</span><span class="st">No ar nas primeiras cidades</span></div>
</footer>

<div class="sticky" id="sticky" aria-hidden="true"><span>Grátis para torcedores</span><a class="btn btn-acid" tabindex="-1" {CTA}>Entrar / Criar conta</a></div>
'''

js_head = '\n'.join(src[671:734])   # <script> ... revelar (até o fim do bloco "revelar")
assert js_head.startswith('<script>') and 'revelar' in js_head
js_head = js_head.replace(
  "for(var k=0;k<2;k++)GAMES.forEach(function(g){th+='<span class=\"it\"><span class=\"'+(g.live?'lv':'tm')+'\">'+(g.live?'● ':'')+g.t+'</span>'+g.g+'<span class=\"n\">'+g.n+' bares</span></span>'});",
  "var BEN=['Busque pelo jogo','Compare o ambiente','Confira infraestrutura e preço','Chame a galera'];\n  for(var k=0;k<2;k++)GAMES.forEach(function(g,i){th+='<span class=\"it\"><span class=\"'+(g.live?'lv':'tm')+'\">'+(g.live?'● ':'')+g.t+'</span>'+g.g+'<span class=\"n\">'+g.n+' bares</span></span>';if(i%2)th+='<span class=\"it bn\">'+BEN[(i>>1)%4]+'</span>'});")
assert 'BEN=' in js_head
js_head = js_head.replace("rowHtml(['Futebol','NBA','NFL','UFC','Fórmula 1','Tênis','Vôlei','NBB'])","rowHtml(['Futebol','Basquete','Vôlei','Automobilismo','Lutas','Tênis','NFL'])")
js_head = js_head.replace("'.hero,.how,.ver,.final,.foot'","'.hero,.how,.ver,.final,.foot'")
steps_lines = '\n'.join(src[752:789])  # passos + linhas do anotado
ver_js = '\n'.join(src[790:809])
assert ver_js.strip().startswith('/* barras') and 'medal3d' in ver_js
assert steps_lines.strip().startswith('/* passos') and 'drawLines' in steps_lines
js = js_head + '\n' + steps_lines + '\n' + ver_js + r'''

  /* pontinhos do carrossel do problema */
  var pile=document.getElementById('pile'),pd=[].slice.call(document.querySelectorAll('#pdots i'));
  pile.addEventListener('scroll',function(){var c=pile.scrollLeft+pile.clientWidth/2,best=0,bd=1e9;[].forEach.call(pile.children,function(e,i){var d=Math.abs(e.offsetLeft+e.offsetWidth/2-c);if(d<bd){bd=d;best=i}});pd.forEach(function(d,i){d.classList.toggle('on',i===best)})},{passive:true});

  /* barra fixa no celular: depois do hero, some no final */
  var st=document.getElementById('sticky'),heroEl=document.getElementById('hero'),fin=document.getElementById('comecar');
  function stick(){var a=heroEl.getBoundingClientRect().bottom<0,b=fin.getBoundingClientRect().top<innerHeight;var on=a&&!b;st.classList.toggle('on',on);st.setAttribute('aria-hidden',!on)}
  addEventListener('scroll',stick,{passive:true});stick();

''' + led_js + '\n</script>\n'

out = head + css + '</style>\n' + body + js + pv
ic = json.load(open(S.parent/'scripts/icons.json'))
led = open(S/'a/led.js').read().strip()[len('window.LED='):].rstrip(';')
out = out.replace('/*IC*/', json.dumps(ic, ensure_ascii=False)).replace('/*LED_DATA*/', led)
(S/'site.html').write_text(out)
print('ok', len(out))
