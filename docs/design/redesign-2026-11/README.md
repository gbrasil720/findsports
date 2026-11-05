# Redesign de novembro de 2026

Fontes dos protótipos aprovados para o redesign do web (decisão do dono, 05/11/2026).
O sistema visual está em `DESIGN.md` (raiz) e as decisões de produto em `PRODUCT.md`.
São referência de desenho, texto e comportamento; o código de produção é escrito do zero
em `apps/web`, com dados reais.

| Pasta | Artifact publicado | O que tem |
|---|---|---|
| `landing/` | https://claude.ai/artifact/B4RnhGSsWkr78Fr5SmN6rs | Landing (telão de LED, telas do app, medalha 3D, lista de espera) |
| `torcedor/` | https://claude.ai/artifact/Xp9wkyzJTbs3SDNbw9Jeme | Web do torcedor: Explorar, bar, entrar, Meus jogos, código, Seus bares, avaliação, perfil, Bares pra você, preferências, onboarding |
| `painel/` | https://claude.ai/artifact/QW1TJD7gVShb4iHB2WQGVv | Painel do bar: Hoje, Jogos, Desempenho, Quem vai, Meu espaço, Plano, Configurações, cadastro |
| `entrada/` | https://claude.ai/artifact/NuZvuastPHQG4DasJdhqzA | Entrar, criar conta, confirmar e-mail, duas etapas, senha |

## Como abrir

- `torcedor/index.html` já abre direto no navegador.
- `*.src.html` têm marcadores que o script de montagem preenche:
  `/*IC*/` (ícones do app, `scripts/icons.json`) e, na landing, `/*LED_DATA*/`
  (`landing/a/led.js`). O botão "Ver no celular" vem de `scripts/preview-snippet.html`.

```bash
python3 - <<'EOF'
import json
d='docs/design/redesign-2026-11'
ic=json.dumps(json.load(open(f'{d}/scripts/icons.json')),ensure_ascii=False)
pv=open(f'{d}/scripts/preview-snippet.html').read()
led=open(f'{d}/landing/a/led.js').read().strip()[len('window.LED='):].rstrip(';')
for p,extra in [('landing',''),('painel',pv),('entrada','')]:
    h=open(f'{d}/{p}/index.src.html').read().replace('/*IC*/',ic).replace('/*LED_DATA*/',led)
    open(f'{d}/{p}/index.html','w').write(h+extra)
EOF
```

## Dados e imagens

Bares, contagens, notas, nomes e códigos são de exemplo. Os números do painel vêm da
base da demo da YC (`findsports_dev_yc`). Fotos de bar e torcida: Unsplash, licença livre.
Telas do app: quadros do vídeo da demo. Mapa: tiles da Onside renderizados. Medalhas:
`apps/mobile/assets/images/medals`.
