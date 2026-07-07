'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  computeFit,
  drawSyntheticScene,
  processFileToCanvas,
  TARGET_H,
  TARGET_W,
} from '@/lib/imageFit'

type Orientation = 'horizontal' | 'vertical'
type Lang = 'pt' | 'en'

interface Item {
  id: string
  img: HTMLImageElement
  sourceUrl: string
  resultUrl: string
  orientation: Orientation
  filename: string
  outName: string
}

const MAX_FILES = 5
const LIFETIME_MS = 5 * 60 * 1000

const T = {
  pt: {
    title: 'Ajuste de moldura',
    subtitle:
      'Envie até 5 fotos no formato 16:9. Cada uma ganha uma moldura (branca ou preta) e sai redimensionada em 15:10, pronta pra baixar e mandar imprimir sem prejudicar o enquadramento e composição da sua foto. Nada é enviado a servidor nenhum, e o lote some sozinho em 5 minutos.',
    demoOriginal: 'Original · 16:9',
    demoResult: 'Resultado · 15:10',
    dropTitle: 'Arraste até 5 fotos aqui, ou clique pra escolher',
    dropSub: 'JPG ou PNG · proporção 16:9 recomendada',
    frameLabel: 'Moldura',
    swatchWhite: 'Branca',
    swatchBlack: 'Preta',
    photos: 'fotos',
    horizontal: 'Horizontal',
    vertical: 'Vertical',
    download: 'Baixar foto',
    timerPrefix: 'Lote apagado automaticamente em',
    clearNow: 'Apagar agora',
    toastManual: 'Lote apagado.',
    toastAuto: 'Fotos apagadas automaticamente após 5 minutos.',
    toastLimit: 'Limite de 5 fotos por lote atingido.',
    toastRoom: (n: number) => `Só cabem mais ${n} foto(s) neste lote de 5.`,
    toastReadError: (name: string) => `Não consegui ler "${name}".`,
    toastInvalid: (name: string) => `"${name}" não é uma imagem válida.`,
    toastProcessError: 'Erro ao processar a imagem.',
    proCta: 'Quer fazer um lote maior? Veja o plano PRO',
    proModalTitle: 'Em breve 🚀',
    proModalBody: 'Esta ferramenta ainda está em fase de testes. O plano PRO chegará em breve — fique de olho!',
    proModalClose: 'Entendido',
  },
  en: {
    title: 'Frame adjuster',
    subtitle:
      'Upload up to 5 photos in 16:9 format. Each one gets a frame (white or black) and is resized to 15:10, ready to download and send to print without compromising the framing and composition of your photo. Nothing is sent to any server, and the batch is cleared automatically after 5 minutes.',
    demoOriginal: 'Original · 16:9',
    demoResult: 'Result · 15:10',
    dropTitle: 'Drag up to 5 photos here, or click to choose',
    dropSub: 'JPG or PNG · 16:9 ratio recommended',
    frameLabel: 'Frame',
    swatchWhite: 'White',
    swatchBlack: 'Black',
    photos: 'photos',
    horizontal: 'Horizontal',
    vertical: 'Vertical',
    download: 'Download photo',
    timerPrefix: 'Batch cleared automatically in',
    clearNow: 'Clear now',
    toastManual: 'Batch cleared.',
    toastAuto: 'Photos cleared automatically after 5 minutes.',
    toastLimit: 'Batch limit of 5 photos reached.',
    toastRoom: (n: number) => `Only ${n} more photo(s) fit in this batch of 5.`,
    toastReadError: (name: string) => `Could not read "${name}".`,
    toastInvalid: (name: string) => `"${name}" is not a valid image.`,
    toastProcessError: 'Error processing the image.',
    proCta: 'Want a larger batch? See the PRO plan',
    proModalTitle: 'Coming soon 🚀',
    proModalBody: 'This tool is still in testing phase. The PRO plan is on its way — stay tuned!',
    proModalClose: 'Got it',
  },
}

const SWATCHES: { color: string; labelKey: 'swatchWhite' | 'swatchBlack' }[] = [
  { color: '#f5f2ec', labelKey: 'swatchWhite' },
  { color: '#0d0c0b', labelKey: 'swatchBlack' },
]

function makeId() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9)
}

function formatTime(ms: number) {
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function UploadIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-[#7b8db0]"
    >
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  )
}

export default function FrameConverter() {
  const [items, setItems] = useState<Item[]>([])
  const [frameColor, setFrameColor] = useState('#f5f2ec')
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [toast, setToast] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [lang, setLang] = useState<Lang>('pt')
  const [langMenuOpen, setLangMenuOpen] = useState(false)
  const [proModalOpen, setProModalOpen] = useState(false)
  const langMenuRef = useRef<HTMLDivElement>(null)

  const t = T[lang]

  const frameColorRef = useRef(frameColor)
  frameColorRef.current = frameColor

  const itemsRef = useRef<Item[]>([])
  itemsRef.current = items

  const fileInputRef = useRef<HTMLInputElement>(null)
  const demoBeforeRef = useRef<HTMLCanvasElement>(null)
  const demoAfterRef = useRef<HTMLCanvasElement>(null)

  const expireFnRef = useRef<(reason?: string) => void>(() => {})
  expireFnRef.current = (reason?: string) => {
    setItems([])
    setExpiresAt(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setToast(reason === 'manual' ? t.toastManual : t.toastAuto)
  }

  const showToast = useCallback((msg: string) => setToast(msg), [])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(''), 2800)
    return () => clearTimeout(id)
  }, [toast])

  useEffect(() => {
    if (!langMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setLangMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [langMenuOpen])

  const drawDemo = useCallback((color: string) => {
    const before = demoBeforeRef.current
    const after = demoAfterRef.current
    if (!before || !after) return
    const bctx = before.getContext('2d')
    if (!bctx) return
    drawSyntheticScene(bctx, before.width, before.height)
    const actx = after.getContext('2d')
    if (!actx) return
    const fit = computeFit(before.width, before.height, TARGET_W, TARGET_H)
    const scale = 108 / fit.canvasH
    after.width = Math.round(fit.canvasW * scale)
    after.height = 108
    actx.fillStyle = color
    actx.fillRect(0, 0, after.width, after.height)
    actx.drawImage(
      before,
      fit.offsetX * scale,
      fit.offsetY * scale,
      before.width * scale,
      before.height * scale,
    )
  }, [])

  useEffect(() => { drawDemo(frameColor) }, [drawDemo, frameColor])

  useEffect(() => {
    setItems(prev => {
      if (prev.length === 0) return prev
      return prev.map(item => ({
        ...item,
        resultUrl: processFileToCanvas(item.img, frameColor, item.orientation).toDataURL('image/jpeg', 0.92),
      }))
    })
  }, [frameColor])

  useEffect(() => {
    if (expiresAt === null) return
    const tick = () => setTimeLeft(Math.max(0, expiresAt - Date.now()))
    tick()
    const intervalId = setInterval(tick, 250)
    const timeoutId = setTimeout(() => expireFnRef.current?.(), Math.max(0, expiresAt - Date.now()))
    return () => { clearInterval(intervalId); clearTimeout(timeoutId) }
  }, [expiresAt])

  const handleOrientationChange = useCallback((id: string, orientation: Orientation) => {
    setItems(prev =>
      prev.map(item => {
        if (item.id !== id || item.orientation === orientation) return item
        const canvas = processFileToCanvas(item.img, frameColorRef.current, orientation)
        return { ...item, orientation, resultUrl: canvas.toDataURL('image/jpeg', 0.92) }
      }),
    )
  }, [])

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return
      const incoming = Array.from(fileList).filter(f => f.type.startsWith('image/'))
      if (!incoming.length) return

      const room = MAX_FILES - itemsRef.current.length
      if (room <= 0) { showToast(T[lang].toastLimit); return }
      const toAdd = incoming.slice(0, room)
      if (incoming.length > room) showToast(T[lang].toastRoom(room))

      toAdd.forEach(file => {
        const reader = new FileReader()
        reader.onerror = () => showToast(T[lang].toastReadError(file.name))
        reader.onload = e => {
          const sourceUrl = e.target!.result as string
          const img = new Image()
          img.onerror = () => showToast(T[lang].toastInvalid(file.name))
          img.onload = () => {
            try {
              const orientation: Orientation = 'horizontal'
              const canvas = processFileToCanvas(img, frameColorRef.current, orientation)
              const resultUrl = canvas.toDataURL('image/jpeg', 0.92)
              const base = file.name.replace(/\.[^.]+$/, '')
              setItems(prev => [
                ...prev,
                { id: makeId(), img, sourceUrl, resultUrl, orientation, filename: file.name, outName: `${base}_15x10.jpg` },
              ])
              setExpiresAt(prev => (prev === null ? Date.now() + LIFETIME_MS : prev))
            } catch {
              showToast(T[lang].toastProcessError)
            }
          }
          img.src = sourceUrl
        }
        reader.readAsDataURL(file)
      })
    },
    [lang, showToast],
  )

  return (
    <div className="text-white font-sans min-h-screen relative">

      {/* Fundo fixo — imagem + overlay escuro */}
      <div
        className="fixed inset-0 -z-20 bg-cover bg-center"
        style={{ backgroundImage: "url('/milad-fakurian-PGdW_bHDbpI-unsplash.jpg')" }}
      />
      <div className="fixed inset-0 -z-10 bg-[#0d0820]/72" />

      {/* Toggle de idioma */}
      <div className="fixed top-5 right-5 z-50" ref={langMenuRef}>
        <button
          onClick={() => setLangMenuOpen(o => !o)}
          className="flex items-center backdrop-blur-md bg-white/[0.10] border border-white/[0.22] rounded-md px-2.5 py-1 text-[10px] font-semibold tracking-widest uppercase transition-all duration-150 hover:bg-white/[0.17]"
        >
          {lang === 'pt' ? 'EN' : 'PT'}
        </button>
        {langMenuOpen && (
          <div className="absolute right-0 mt-1.5 backdrop-blur-2xl bg-white/[0.10] border border-white/[0.18] rounded-xl overflow-hidden shadow-2xl">
            {(['pt', 'en'] as Lang[]).map(l => (
              <button
                key={l}
                onClick={() => { setLang(l); setLangMenuOpen(false) }}
                className={[
                  'block w-full px-5 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-left transition-colors duration-150',
                  lang === l
                    ? 'text-white bg-white/[0.14]'
                    : 'text-white/50 hover:text-white hover:bg-white/[0.08]',
                ].join(' ')}
              >
                {l === 'pt' ? 'Português' : 'English'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative max-w-[960px] mx-auto px-4 pt-12 pb-28 sm:px-6 sm:pt-16 sm:pb-24">

        {/* Header */}
        <header className="mb-10 sm:mb-14 text-center">
          <h1
            className="text-[clamp(36px,6vw,64px)] italic font-bold leading-tight mb-4"
            style={{ fontFamily: 'var(--font-playfair)' }}
          >
            {t.title}
          </h1>
          <p className="text-white/48 text-[14px] sm:text-[15px] max-w-[52ch] leading-relaxed mx-auto">
            {t.subtitle}
          </p>
        </header>

        {/* Diagrama ilustrativo */}
        <div className="max-w-[560px] mx-auto mb-4 p-3 sm:p-6 rounded-2xl backdrop-blur-xl bg-white/[0.07] border border-white/[0.14] flex justify-center items-center gap-3 sm:gap-8">
          <div className="text-center">
            <div className="max-w-[120px] sm:max-w-none">
              <canvas ref={demoBeforeRef} width={192} height={108} className="rounded-xl w-full h-auto" />
            </div>
            <div className="mt-2 font-mono text-[9px] sm:text-[10px] tracking-widest uppercase text-violet-300/60">
              {t.demoOriginal}
            </div>
          </div>
          <div className="text-lg sm:text-2xl text-white/30">→</div>
          <div className="text-center">
            <div className="max-w-[102px] sm:max-w-none">
              <canvas ref={demoAfterRef} width={162} height={108} className="rounded-xl w-full h-auto" />
            </div>
            <div className="mt-2 font-mono text-[9px] sm:text-[10px] tracking-widest uppercase text-violet-300/60">
              {t.demoResult}
            </div>
          </div>
        </div>

        {/* Dropzone */}
        <div
          className={[
            'max-w-[560px] mx-auto mb-8 rounded-2xl border border-dashed py-8 sm:py-12 px-6 text-center cursor-pointer transition-all duration-200 backdrop-blur-md',
            isDragging
              ? 'border-violet-400/60 bg-violet-500/[0.08]'
              : 'border-white/[0.22] bg-white/[0.04] hover:border-white/40 hover:bg-white/[0.07]',
          ].join(' ')}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragEnter={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={e => { e.preventDefault(); setIsDragging(false) }}
          onDrop={e => {
            e.preventDefault()
            setIsDragging(false)
            if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />
          <div className="flex justify-center mb-3">
            <UploadIcon />
          </div>
          <p className="text-[16px] font-medium mb-1">{t.dropTitle}</p>
          <p className="text-[13px] text-white/45">{t.dropSub}</p>
        </div>

        {/* Controles */}
        <div className="flex items-center justify-between gap-4 mt-6 mb-2 flex-wrap">
          <div className="flex gap-3 items-center">
            <span className="text-[11px] font-semibold tracking-widest uppercase text-violet-300/70">
              {t.frameLabel}
            </span>
            {SWATCHES.map(sw => (
              <button
                key={sw.color}
                title={t[sw.labelKey]}
                onClick={() => setFrameColor(sw.color)}
                style={{ background: sw.color }}
                className={[
                  'w-7 h-7 rounded-full cursor-pointer transition-all duration-200',
                  frameColor === sw.color
                    ? 'ring-2 ring-offset-2 ring-offset-[#0d0820] ring-violet-400/80'
                    : 'ring-1 ring-white/25 hover:ring-white/50',
                ].join(' ')}
              />
            ))}
          </div>
          <div className="text-[13px] text-white/40">
            {items.length} / {MAX_FILES} {t.photos}
          </div>
        </div>

        {/* CTA PRO */}
        <div className="flex justify-center mt-4 mb-2">
          <button
            onClick={() => setProModalOpen(true)}
            className="flex items-center gap-2 backdrop-blur-md bg-white/[0.06] border border-violet-400/30 hover:border-violet-400/60 hover:bg-violet-500/[0.08] text-violet-300/80 hover:text-violet-200 text-[12px] font-medium px-4 py-2 rounded-full transition-all duration-200"
          >
            <span className="text-[10px] bg-gradient-to-r from-violet-400 to-indigo-300 bg-clip-text text-transparent font-bold tracking-widest uppercase">PRO</span>
            {t.proCta}
          </button>
        </div>

        {/* Grid de resultados */}
        {items.length > 0 && (
          <div
            className="grid gap-4 mt-6"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
          >
            {items.map(item => (
              <div
                key={item.id}
                className="rounded-2xl overflow-hidden backdrop-blur-xl bg-white/[0.07] border border-white/[0.14] flex flex-col"
              >
                <div
                  className="relative"
                  style={{
                    background:
                      'repeating-conic-gradient(rgba(255,255,255,0.04) 0 90deg, transparent 0 180deg) 0 0/16px 16px',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.resultUrl} alt={item.filename} className="block w-full h-auto" />
                </div>
                <div className="p-4 flex flex-col gap-3 flex-1">
                  <p className="text-[12px] text-white/40 truncate" title={item.filename}>
                    {item.filename}
                  </p>
                  <div className="flex rounded-xl overflow-hidden border border-white/[0.15]">
                    {(['horizontal', 'vertical'] as Orientation[]).map((orient, i) => (
                      <button
                        key={orient}
                        onClick={() => handleOrientationChange(item.id, orient)}
                        className={[
                          'flex-1 text-[11px] font-semibold tracking-widest uppercase py-2 cursor-pointer transition-colors duration-150',
                          i > 0 ? 'border-l border-white/[0.15]' : '',
                          item.orientation === orient
                            ? 'bg-white/[0.14] text-white'
                            : 'bg-transparent text-white/40 hover:text-white',
                        ].join(' ')}
                      >
                        {orient === 'horizontal' ? t.horizontal : t.vertical}
                      </button>
                    ))}
                  </div>
                  <a
                    href={item.resultUrl}
                    download={item.outName}
                    className="block w-full text-center bg-gradient-to-r from-violet-500 to-indigo-400 hover:from-violet-400 hover:to-indigo-300 text-white font-semibold py-2.5 rounded-xl text-[13px] no-underline transition-all duration-200 shadow-lg shadow-violet-900/30"
                  >
                    {t.download}
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Barra de status / timer */}
        {expiresAt !== null && (
          <div className="flex items-center justify-between mt-8 pt-5 border-t border-white/[0.08] text-[12px] text-white/40 flex-wrap gap-3">
            <span>
              {t.timerPrefix}{' '}
              <span className="text-violet-300 font-mono font-medium">{formatTime(timeLeft)}</span>
            </span>
            <button
              onClick={() => expireFnRef.current?.('manual')}
              className="bg-transparent border border-white/[0.18] text-white/40 text-[11px] px-3.5 py-1.5 rounded-lg cursor-pointer transition-colors duration-150 hover:border-white/35 hover:text-white"
            >
              {t.clearNow}
            </button>
          </div>
        )}

      </div>

      {/* Footer */}
      <footer className="relative text-center pb-10">
        <p className="text-[11px] text-white/25 tracking-widest">
          developed by kaleu.dev 2026 ® — All rights reserved.
        </p>
      </footer>

      {/* Modal PRO */}
      {proModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          onClick={() => setProModalOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative max-w-sm w-full backdrop-blur-2xl bg-white/[0.10] border border-white/[0.20] rounded-2xl p-8 shadow-2xl text-center"
            onClick={e => e.stopPropagation()}
          >
            <p
              className="text-[28px] font-bold italic mb-3"
              style={{ fontFamily: 'var(--font-playfair)' }}
            >
              {t.proModalTitle}
            </p>
            <p className="text-white/60 text-[14px] leading-relaxed mb-6">
              {t.proModalBody}
            </p>
            <button
              onClick={() => setProModalOpen(false)}
              className="bg-gradient-to-r from-violet-500 to-indigo-400 hover:from-violet-400 hover:to-indigo-300 text-white font-semibold px-8 py-2.5 rounded-xl text-[13px] transition-all duration-200 shadow-lg shadow-violet-900/30"
            >
              {t.proModalClose}
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 backdrop-blur-2xl bg-white/[0.12] border border-white/[0.22] px-5 py-3 rounded-xl text-[13px] text-white pointer-events-none shadow-2xl whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  )
}
