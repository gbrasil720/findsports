# Ícones do PWA

Gerados a partir de `../onside-app-icon.png` (1024×1024, fundo acid, marca
centrada). Não edite à mão: regere se a marca mudar.

| Arquivo | O que é |
| -- | -- |
| `icon-192.png` | `purpose: any`, redimensionamento direto |
| `icon-512.png` | `purpose: any`, redimensionamento direto |
| `icon-maskable-512.png` | `purpose: maskable`: fundo acid a sangria e a marca a 78% do lado, dentro do círculo de segurança de 80% |

O maskable existe porque o Android recorta o ícone dentro de um círculo. Sem
fundo a sangria, o recorte deixa um anel branco em volta da marca.

Comando usado (Pillow):

```python
from PIL import Image
src = Image.open("apps/web/public/onside-app-icon.png").convert("RGBA")
for size in (192, 512):
    src.resize((size, size), Image.LANCZOS).save(f"apps/web/public/icons/icon-{size}.png", optimize=True)

canvas = Image.new("RGBA", (512, 512), (201, 241, 53, 255))  # --onside-acid
canvas.alpha_composite(src.resize((400, 400), Image.LANCZOS), (56, 56))
canvas.save("apps/web/public/icons/icon-maskable-512.png", optimize=True)
```
