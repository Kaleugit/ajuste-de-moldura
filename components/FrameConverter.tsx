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
    <div className="bg-[#161d2f] text-white font-sans min-h-screen relative overflow-hidden">
      {/* Blobs de fundo */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-[#1e3a5f]/30 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full bg-[#0f2240]/40 blur-3xl" />
      </div>

      {/* Toggle de idioma */}
      <div className="fixed top-5 right-5 z-50" ref={langMenuRef}>
        <button
          onClick={() => setLangMenuOpen(o => !o)}
          className="flex items-center bg-[#1c2540] border border-white/[0.12] rounded-md px-2 py-1 text-[10px] font-semibold tracking-widest uppercase transition-colors duration-150 hover:border-white/25"
        >
          {lang === 'pt' ? 'EN' : 'PT'}
        </button>
        {langMenuOpen && (
          <div className="absolute right-0 mt-1.5 bg-[#1c2540] border border-white/[0.12] rounded-lg overflow-hidden shadow-xl">
            {(['pt', 'en'] as Lang[]).map(l => (
              <button
                key={l}
                onClick={() => { setLang(l); setLangMenuOpen(false) }}
                className={[
                  'block w-full px-4 py-2 text-[10px] font-semibold tracking-widest uppercase text-left transition-colors duration-150',
                  lang === l
                    ? 'text-white bg-white/[0.08]'
                    : 'text-[#7b8db0] hover:text-white hover:bg-white/[0.04]',
                ].join(' ')}
              >
                {l === 'pt' ? 'Português' : 'English'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative max-w-[960px] mx-auto px-4 pt-10 pb-28 sm:px-6 sm:pt-14 sm:pb-24">

        {/* Header */}
        <header className="mb-8 sm:mb-12 text-center">
          <h1 className="text-[clamp(28px,5vw,52px)] font-bold tracking-tight leading-none mb-3 sm:mb-4">
            {t.title}
          </h1>
          <p className="text-[#7b8db0] text-[14px] sm:text-[15px] max-w-[58ch] leading-relaxed mx-auto">
            {t.subtitle}
          </p>
        </header>

        {/* Diagrama ilustrativo */}
        <div className="max-w-[560px] mx-auto mb-4 p-3 sm:p-6 rounded-2xl bg-[#1c2540] border border-white/[0.06] flex justify-center items-center gap-3 sm:gap-8">
          <div className="text-center">
            <div className="max-w-[120px] sm:max-w-none">
              <canvas ref={demoBeforeRef} width={192} height={108} className="rounded-lg w-full h-auto" />
            </div>
            <div className="mt-2 font-mono text-[9px] sm:text-[10px] tracking-widest uppercase text-[#7b8db0]">
              {t.demoOriginal}
            </div>
          </div>
          <div className="text-lg sm:text-2xl text-[#7b8db0]">→</div>
          <div className="text-center">
            <div className="max-w-[102px] sm:max-w-none">
              <canvas ref={demoAfterRef} width={162} height={108} className="rounded-lg w-full h-auto" />
            </div>
            <div className="mt-2 font-mono text-[9px] sm:text-[10px] tracking-widest uppercase text-[#7b8db0]">
              {t.demoResult}
            </div>
          </div>
        </div>

        {/* Dropzone */}
        <div
          className={[
            'max-w-[560px] mx-auto mb-8 rounded-xl border border-dashed py-7 sm:py-10 px-6 text-center cursor-pointer transition-all duration-200',
            isDragging
              ? 'border-white/40 bg-white/[0.04]'
              : 'border-white/[0.18] hover:border-white/30 hover:bg-white/[0.02]',
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
          <p className="text-[13px] text-[#7b8db0]">{t.dropSub}</p>
        </div>

        {/* Controles */}
        <div className="flex items-center justify-between gap-4 mt-6 mb-2 flex-wrap">
          <div className="flex gap-3 items-center">
            <span className="text-[11px] font-semibold tracking-widest uppercase text-[#7b8db0]">
              {t.frameLabel}
            </span>
            {SWATCHES.map(sw => (
              <button
                key={sw.color}
                title={t[sw.labelKey]}
                onClick={() => setFrameColor(sw.color)}
                style={{ background: sw.color }}
                className={[
                  'w-7 h-7 rounded-full cursor-pointer transition-all duration-150',
                  frameColor === sw.color
                    ? 'ring-2 ring-offset-2 ring-offset-[#161d2f] ring-white/70'
                    : 'ring-1 ring-white/20',
                ].join(' ')}
              />
            ))}
          </div>
          <div className="text-[13px] text-[#7b8db0]">
            {items.length} / {MAX_FILES} {t.photos}
          </div>
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
                className="rounded-xl overflow-hidden bg-[#1c2540] border border-white/[0.06] flex flex-col"
              >
                <div
                  className="relative"
                  style={{
                    background:
                      'repeating-conic-gradient(#252e47 0 90deg, #1c2540 0 180deg) 0 0/16px 16px',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.resultUrl} alt={item.filename} className="block w-full h-auto" />
                </div>
                <div className="p-4 flex flex-col gap-3 flex-1">
                  <p className="text-[12px] text-[#7b8db0] truncate" title={item.filename}>
                    {item.filename}
                  </p>
                  <div className="flex rounded-lg overflow-hidden border border-white/[0.12]">
                    {(['horizontal', 'vertical'] as Orientation[]).map((orient, i) => (
                      <button
                        key={orient}
                        onClick={() => handleOrientationChange(item.id, orient)}
                        className={[
                          'flex-1 text-[11px] font-semibold tracking-widest uppercase py-2 cursor-pointer transition-colors duration-150',
                          i > 0 ? 'border-l border-white/[0.12]' : '',
                          item.orientation === orient
                            ? 'bg-white/[0.12] text-white'
                            : 'bg-transparent text-[#7b8db0] hover:text-white',
                        ].join(' ')}
                      >
                        {orient === 'horizontal' ? t.horizontal : t.vertical}
                      </button>
                    ))}
                  </div>
                  <a
                    href={item.resultUrl}
                    download={item.outName}
                    className="block w-full text-center bg-[#0fcfa0] hover:bg-[#0db58c] text-[#061a12] font-semibold py-2.5 rounded-lg text-[13px] no-underline transition-colors duration-150"
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
          <div className="flex items-center justify-between mt-8 pt-5 border-t border-white/[0.06] text-[12px] text-[#7b8db0] flex-wrap gap-3">
            <span>
              {t.timerPrefix}{' '}
              <span className="text-white font-mono font-medium">{formatTime(timeLeft)}</span>
            </span>
            <button
              onClick={() => expireFnRef.current?.('manual')}
              className="bg-transparent border border-white/[0.15] text-[#7b8db0] text-[11px] px-3.5 py-1.5 rounded-lg cursor-pointer transition-colors duration-150 hover:border-white/30 hover:text-white"
            >
              {t.clearNow}
            </button>
          </div>
        )}

      </div>

      {/* Footer */}
      <footer className="relative text-center pb-8">
        <p className="text-[12px] text-[#7b8db0]/50 tracking-widest">
          developed by kaleu.dev 2026 ® — All rights reserved.
        </p>
      </footer>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1c2540] border border-white/[0.15] px-5 py-3 rounded-xl text-[13px] text-white pointer-events-none shadow-xl whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  )
}
