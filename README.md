# Moldura — Frame Adjuster

Converte fotos 16:9 para o formato de impressão 15:10 adicionando bordas (branca ou preta), sem cortar nem distorcer a composição original.

Acesse via browser em qualquer dispositivo — desktop ou celular.

---

## Funcionalidades

- Processa até **5 fotos por lote** simultaneamente
- Escolha de cor da moldura: **branca/creme** ou **preta**
- Alternância de orientação por foto: **horizontal** ou **vertical**
- Preview ao vivo da conversão antes de qualquer upload
- **Lote apagado automaticamente após 5 minutos** — sem rastro de dados
- Interface **bilíngue** (PT / EN) com toggle no canto da tela

---

## Arquitetura

Todo o processamento acontece no **navegador do usuário** — nenhuma imagem é enviada a servidor.

```
browser
└── Next.js (App Router, React 19)
    ├── app/page.tsx           — entrada da aplicação
    ├── components/
    │   └── FrameConverter.tsx — UI, estado, drag-and-drop, timer de expiração
    └── lib/
        └── imageFit.ts        — lógica de canvas: cálculo de fit, rotação, composição
```

O fluxo de processamento por imagem é:

1. `FileReader` lê o arquivo localmente e cria um `HTMLImageElement`
2. `imageFit.ts` calcula o canvas 15:10, pinta o fundo com a cor da moldura e desenha a imagem centralizada
3. `canvas.toDataURL('image/jpeg', 0.92)` gera a URL de download — tudo em memória, sem I/O externo

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 16, App Router |
| UI | React 19, Tailwind CSS v4 |
| Processamento | Canvas API (client-side) |
| Linguagem | TypeScript |

---

## Rodando localmente

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

---

developed by [kaleu.dev](https://kaleu.dev) 2026 ® — All rights reserved.
