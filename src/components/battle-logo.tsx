'use client'

import { cn } from '@/lib/utils'

const sizeMap = {
  sm: 28,
  md: 40,
  lg: 64,
  xl: 80,
  '2xl': 120,
} as const

type Size = keyof typeof sizeMap

interface BattleLogoProps {
  size?: Size
  className?: string
}

export function BattleLogo({ size = 'md', className }: BattleLogoProps) {
  const px = sizeMap[size]
  // If className includes width/height overrides (responsive), skip inline width/height
  // so CSS classes take full control. Otherwise use the pixel value from sizeMap.
  const hasCustomSize = className?.includes('w-') || className?.includes('h-')

  return (
    <svg
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      {...(!hasCustomSize && { width: px, height: px })}
      className={cn('block mx-auto object-contain drop-shadow-[0_0_12px_rgba(220,38,38,0.4)]', className)}
      role="img"
      aria-label="معركة الأسئلة - Battle of Questions"
    >
      <defs>
        {/* === LEFT SIDE: RED METALLIC GRADIENTS === */}
        <linearGradient id="redMetal" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF4444"/>
          <stop offset="25%" stopColor="#DC2626"/>
          <stop offset="50%" stopColor="#B91C1C"/>
          <stop offset="75%" stopColor="#991B1B"/>
          <stop offset="100%" stopColor="#7F1D1D"/>
        </linearGradient>
        <linearGradient id="shieldRed" x1="0%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#EF4444"/>
          <stop offset="30%" stopColor="#DC2626"/>
          <stop offset="60%" stopColor="#B91C1C"/>
          <stop offset="100%" stopColor="#7F1D1D"/>
        </linearGradient>

        {/* === RIGHT SIDE: AMBER/GOLD METALLIC GRADIENTS === */}
        <linearGradient id="amberMetal" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FCD34D"/>
          <stop offset="25%" stopColor="#F59E0B"/>
          <stop offset="50%" stopColor="#D97706"/>
          <stop offset="75%" stopColor="#B45309"/>
          <stop offset="100%" stopColor="#92400E"/>
        </linearGradient>
        <linearGradient id="shieldAmber" x1="50%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FCD34D"/>
          <stop offset="30%" stopColor="#F59E0B"/>
          <stop offset="60%" stopColor="#D97706"/>
          <stop offset="100%" stopColor="#92400E"/>
        </linearGradient>

        {/* === SHIELD BORDER === */}
        <linearGradient id="shieldBorder" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF6B6B"/>
          <stop offset="50%" stopColor="#FBBF24"/>
          <stop offset="100%" stopColor="#F59E0B"/>
        </linearGradient>

        {/* === QUESTION MARK GRADIENT === */}
        <linearGradient id="questionGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FCD34D"/>
          <stop offset="40%" stopColor="#DC2626"/>
          <stop offset="60%" stopColor="#F59E0B"/>
          <stop offset="100%" stopColor="#DC2626"/>
        </linearGradient>

        {/* === SWORD BLADE GRADIENTS === */}
        <linearGradient id="swordRedBlade" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7F1D1D"/>
          <stop offset="20%" stopColor="#B91C1C"/>
          <stop offset="40%" stopColor="#DC2626"/>
          <stop offset="50%" stopColor="#FF6B6B"/>
          <stop offset="60%" stopColor="#DC2626"/>
          <stop offset="80%" stopColor="#B91C1C"/>
          <stop offset="100%" stopColor="#7F1D1D"/>
        </linearGradient>
        <linearGradient id="swordAmberBlade" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#92400E"/>
          <stop offset="20%" stopColor="#B45309"/>
          <stop offset="40%" stopColor="#F59E0B"/>
          <stop offset="50%" stopColor="#FDE68A"/>
          <stop offset="60%" stopColor="#F59E0B"/>
          <stop offset="80%" stopColor="#B45309"/>
          <stop offset="100%" stopColor="#92400E"/>
        </linearGradient>

        {/* === BOOK PAGE GRADIENTS === */}
        <linearGradient id="bookPageLeft" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FCA5A5"/>
          <stop offset="50%" stopColor="#DC2626"/>
          <stop offset="100%" stopColor="#991B1B"/>
        </linearGradient>
        <linearGradient id="bookPageRight" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FDE68A"/>
          <stop offset="50%" stopColor="#F59E0B"/>
          <stop offset="100%" stopColor="#92400E"/>
        </linearGradient>

        {/* === GEM GRADIENTS === */}
        <radialGradient id="gemRed" cx="40%" cy="35%">
          <stop offset="0%" stopColor="#FFFFFF"/>
          <stop offset="20%" stopColor="#FCA5A5"/>
          <stop offset="60%" stopColor="#DC2626"/>
          <stop offset="100%" stopColor="#7F1D1D"/>
        </radialGradient>
        <radialGradient id="gemAmber" cx="40%" cy="35%">
          <stop offset="0%" stopColor="#FFFFFF"/>
          <stop offset="20%" stopColor="#FDE68A"/>
          <stop offset="60%" stopColor="#F59E0B"/>
          <stop offset="100%" stopColor="#92400E"/>
        </radialGradient>
        <radialGradient id="gemCenter" cx="40%" cy="35%">
          <stop offset="0%" stopColor="#FFFFFF"/>
          <stop offset="30%" stopColor="#FDE68A"/>
          <stop offset="100%" stopColor="#DC2626"/>
        </radialGradient>

        {/* === CIRCLE GRADIENT === */}
        <linearGradient id="circleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#DC2626"/>
          <stop offset="50%" stopColor="#FBBF24"/>
          <stop offset="100%" stopColor="#F59E0B"/>
        </linearGradient>

        {/* === FILTERS === */}
        <filter id="redGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur"/>
          <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 0.1 0 0 0  0 0 0.1 0 0  0 0 0 0.6 0" result="redBlur"/>
          <feMerge>
            <feMergeNode in="redBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <filter id="amberGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur"/>
          <feColorMatrix in="blur" type="matrix" values="1 0.7 0 0 0  0.8 0.5 0 0 0  0 0 0 0 0  0 0 0 0.6 0" result="amberBlur"/>
          <feMerge>
            <feMergeNode in="amberBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <filter id="innerShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur"/>
          <feOffset dx="2" dy="3" result="offset"/>
          <feComposite in="offset" in2="SourceAlpha" operator="in" result="shadow"/>
          <feFlood floodColor="#000000" floodOpacity="0.4" result="color"/>
          <feComposite in="color" in2="shadow" operator="in" result="finalShadow"/>
          <feMerge>
            <feMergeNode in="finalShadow"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <filter id="strongGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>

        {/* === CLIPS === */}
        <clipPath id="shieldLeftClip">
          <rect x="0" y="0" width="256" height="512"/>
        </clipPath>
        <clipPath id="shieldRightClip">
          <rect x="256" y="0" width="256" height="512"/>
        </clipPath>

        {/* === SHIELD SHAPE === */}
        <path id="shieldShape" d="M256 48 L388 88 Q420 100 420 136 L420 280 Q420 380 256 460 Q92 380 92 280 L92 136 Q92 100 124 88 Z"/>
      </defs>

      {/* ====== AMBIENT GLOW ====== */}
      <ellipse cx="256" cy="260" rx="200" ry="220" fill="none" stroke="url(#circleGrad)" strokeWidth="2" opacity="0.3" filter="url(#strongGlow)"/>

      {/* ====== OUTER CIRCULAR EMBLEM ====== */}
      <circle cx="256" cy="256" r="230" fill="none" stroke="url(#circleGrad)" strokeWidth="3" opacity="0.5"/>
      <circle cx="256" cy="256" r="224" fill="none" stroke="url(#circleGrad)" strokeWidth="1" opacity="0.3"/>
      <circle cx="256" cy="26" r="6" fill="url(#gemCenter)" filter="url(#strongGlow)"/>
      <circle cx="256" cy="486" r="5" fill="url(#gemCenter)" opacity="0.6"/>
      <circle cx="26" cy="256" r="5" fill="url(#gemRed)" opacity="0.6"/>
      <circle cx="486" cy="256" r="5" fill="url(#gemAmber)" opacity="0.6"/>

      {/* ====== LEFT SWORD - RED/CRIMSON ====== */}
      <g transform="translate(256,256) rotate(-35) translate(-256,-256)" filter="url(#redGlow)">
        {/* Blade - THICK scimitar style */}
        <path d="M190 60 L208 52 L218 56 L228 68 L232 90 L234 120 L236 200 L238 300 L240 340 L230 355 L220 348 L218 300 L216 200 L214 120 L210 90 L206 72 L200 64 Z"
              fill="url(#swordRedBlade)" stroke="#7F1D1D" strokeWidth="1"/>
        {/* Blade highlight edge */}
        <path d="M204 60 L210 54 L216 58 L222 70 L224 90 L226 120 L228 200 L230 300 L232 340 L226 350 L222 346 L220 300 L218 200 L216 120 L212 90 L208 72 Z"
              fill="#FF6B6B" opacity="0.35"/>
        {/* Blade center shine */}
        <path d="M208 70 L212 62 L216 70 L218 90 L220 120 L222 200 L224 300 L226 340 L222 348 L218 342 L216 300 L214 200 L212 120 L210 90 Z"
              fill="#FCA5A5" opacity="0.25"/>
        {/* Cross-guard */}
        <rect x="180" y="340" width="64" height="12" rx="4" fill="url(#redMetal)" stroke="#7F1D1D" strokeWidth="1"/>
        {/* Cross-guard gem */}
        <circle cx="212" cy="346" r="5" fill="url(#gemRed)"/>
        {/* Cross-guard tips */}
        <circle cx="182" cy="346" r="4" fill="url(#redMetal)" stroke="#7F1D1D" strokeWidth="0.5"/>
        <circle cx="242" cy="346" r="4" fill="url(#redMetal)" stroke="#7F1D1D" strokeWidth="0.5"/>
        {/* Grip */}
        <rect x="205" y="352" width="14" height="36" rx="3" fill="#4A0E0E" stroke="#991B1B" strokeWidth="1"/>
        <line x1="206" y1="358" x2="218" y2="358" stroke="#DC2626" strokeWidth="1.5" opacity="0.7"/>
        <line x1="206" y1="364" x2="218" y2="364" stroke="#DC2626" strokeWidth="1.5" opacity="0.7"/>
        <line x1="206" y1="370" x2="218" y2="370" stroke="#DC2626" strokeWidth="1.5" opacity="0.7"/>
        <line x1="206" y1="376" x2="218" y2="376" stroke="#DC2626" strokeWidth="1.5" opacity="0.7"/>
        {/* Pommel */}
        <circle cx="212" cy="394" r="9" fill="url(#redMetal)" stroke="#7F1D1D" strokeWidth="1"/>
        <circle cx="212" cy="394" r="5" fill="url(#gemRed)"/>
      </g>

      {/* ====== RIGHT SWORD - AMBER/GOLD ====== */}
      <g transform="translate(256,256) rotate(35) translate(-256,-256)" filter="url(#amberGlow)">
        {/* Blade - THICK scimitar style */}
        <path d="M272 60 L290 52 L300 56 L310 68 L314 90 L316 120 L318 200 L320 300 L322 340 L312 355 L302 348 L300 300 L298 200 L296 120 L292 90 L288 72 L282 64 Z"
              fill="url(#swordAmberBlade)" stroke="#92400E" strokeWidth="1"/>
        {/* Blade highlight edge */}
        <path d="M286 60 L292 54 L298 58 L304 70 L306 90 L308 120 L310 200 L312 300 L314 340 L308 350 L304 346 L302 300 L300 200 L298 120 L294 90 L290 72 Z"
              fill="#FDE68A" opacity="0.35"/>
        {/* Blade center shine */}
        <path d="M290 70 L294 62 L298 70 L300 90 L302 120 L304 200 L306 300 L308 340 L304 348 L300 342 L298 300 L296 200 L294 120 L292 90 Z"
              fill="#FEF3C7" opacity="0.25"/>
        {/* Cross-guard */}
        <rect x="268" y="340" width="64" height="12" rx="4" fill="url(#amberMetal)" stroke="#92400E" strokeWidth="1"/>
        {/* Cross-guard gem */}
        <circle cx="300" cy="346" r="5" fill="url(#gemAmber)"/>
        {/* Cross-guard tips */}
        <circle cx="270" cy="346" r="4" fill="url(#amberMetal)" stroke="#92400E" strokeWidth="0.5"/>
        <circle cx="330" cy="346" r="4" fill="url(#amberMetal)" stroke="#92400E" strokeWidth="0.5"/>
        {/* Grip */}
        <rect x="293" y="352" width="14" height="36" rx="3" fill="#451A03" stroke="#92400E" strokeWidth="1"/>
        <line x1="294" y1="358" x2="306" y2="358" stroke="#F59E0B" strokeWidth="1.5" opacity="0.7"/>
        <line x1="294" y1="364" x2="306" y2="364" stroke="#F59E0B" strokeWidth="1.5" opacity="0.7"/>
        <line x1="294" y1="370" x2="306" y2="370" stroke="#F59E0B" strokeWidth="1.5" opacity="0.7"/>
        <line x1="294" y1="376" x2="306" y2="376" stroke="#F59E0B" strokeWidth="1.5" opacity="0.7"/>
        {/* Pommel */}
        <circle cx="300" cy="394" r="9" fill="url(#amberMetal)" stroke="#92400E" strokeWidth="1"/>
        <circle cx="300" cy="394" r="5" fill="url(#gemAmber)"/>
      </g>

      {/* ====== SHIELD ====== */}
      <use href="#shieldShape" fill="#000" opacity="0.3" transform="translate(4,4)"/>
      <use href="#shieldShape" fill="url(#shieldRed)" clipPath="url(#shieldLeftClip)"/>
      <use href="#shieldShape" fill="url(#shieldAmber)" clipPath="url(#shieldRightClip)"/>
      <line x1="256" y1="48" x2="256" y2="460" stroke="#FBBF24" strokeWidth="1.5" opacity="0.4"/>
      <use href="#shieldShape" fill="none" stroke="url(#shieldBorder)" strokeWidth="4"/>
      <path d="M256 58 L380 96 Q408 107 408 140 L408 275 Q408 372 256 448 Q104 372 104 275 L104 140 Q104 107 132 96 Z"
            fill="none" stroke="url(#shieldBorder)" strokeWidth="1.5" opacity="0.5"/>
      {/* Decorative swirls */}
      <path d="M140 92 Q170 82 200 88" fill="none" stroke="#FCA5A5" strokeWidth="1.5" opacity="0.6"/>
      <path d="M312 88 Q342 82 372 92" fill="none" stroke="#FDE68A" strokeWidth="1.5" opacity="0.6"/>
      {/* Top gem */}
      <path d="M256 62 L264 72 L256 82 L248 72 Z" fill="url(#gemCenter)" stroke="url(#shieldBorder)" strokeWidth="1" filter="url(#strongGlow)"/>

      {/* ====== QUESTION MARK ====== */}
      <g filter="url(#innerShadow)" transform="translate(0,-10)">
        <path d="M220 140 Q220 110 256 100 Q292 110 292 140 Q292 165 268 180 L268 210 L244 210 L244 175 Q264 163 264 140 Q264 128 256 124 Q248 128 248 140 Z"
              fill="url(#questionGrad)" stroke="#92400E" strokeWidth="1.5"/>
        <circle cx="256" cy="232" r="12" fill="url(#questionGrad)" stroke="#92400E" strokeWidth="1.5"/>
        <path d="M226 135 Q226 118 256 108 Q275 114 282 128"
              fill="none" stroke="#FDE68A" strokeWidth="2" opacity="0.5" strokeLinecap="round"/>
      </g>

      {/* ====== OPEN BOOK ====== */}
      <g transform="translate(256,345)">
        <ellipse cx="0" cy="8" rx="62" ry="8" fill="#000" opacity="0.3"/>
        {/* Left page (red) */}
        <path d="M-4 -30 Q-30 -35 -55 -28 L-55 20 Q-30 14 -4 18 Z" fill="url(#bookPageLeft)" stroke="#991B1B" strokeWidth="1"/>
        <line x1="-48" y1="-18" x2="-10" y2="-22" stroke="#FCA5A5" strokeWidth="0.8" opacity="0.5"/>
        <line x1="-48" y1="-10" x2="-10" y2="-14" stroke="#FCA5A5" strokeWidth="0.8" opacity="0.5"/>
        <line x1="-48" y1="-2" x2="-10" y2="-6" stroke="#FCA5A5" strokeWidth="0.8" opacity="0.5"/>
        <line x1="-48" y1="6" x2="-10" y2="2" stroke="#FCA5A5" strokeWidth="0.8" opacity="0.5"/>
        <path d="M-55 -28 Q-58 -20 -55 20 Q-52 18 -50 20" fill="none" stroke="#B91C1C" strokeWidth="0.8" opacity="0.6"/>
        {/* Right page (amber) */}
        <path d="M4 -30 Q30 -35 55 -28 L55 20 Q30 14 4 18 Z" fill="url(#bookPageRight)" stroke="#92400E" strokeWidth="1"/>
        <line x1="10" y1="-22" x2="48" y2="-18" stroke="#FDE68A" strokeWidth="0.8" opacity="0.5"/>
        <line x1="10" y1="-14" x2="48" y2="-10" stroke="#FDE68A" strokeWidth="0.8" opacity="0.5"/>
        <line x1="10" y1="-6" x2="48" y2="-2" stroke="#FDE68A" strokeWidth="0.8" opacity="0.5"/>
        <line x1="10" y1="2" x2="48" y2="6" stroke="#FDE68A" strokeWidth="0.8" opacity="0.5"/>
        <path d="M55 -28 Q58 -20 55 20 Q52 18 50 20" fill="none" stroke="#B45309" strokeWidth="0.8" opacity="0.6"/>
        {/* Spine */}
        <rect x="-5" y="-32" width="10" height="52" rx="2" fill="#1A1A2E" stroke="#FBBF24" strokeWidth="0.8"/>
        <line x1="0" y1="-28" x2="0" y2="16" stroke="#FBBF24" strokeWidth="0.5" opacity="0.5"/>
        {/* Book glow */}
        <ellipse cx="0" cy="-5" rx="40" ry="25" fill="#F59E0B" opacity="0.06" filter="url(#strongGlow)"/>
      </g>

      {/* ====== ENERGY PARTICLES ====== */}
      {/* Red particles (left) */}
      <circle cx="140" cy="140" r="2.5" fill="#EF4444" opacity="0.8" filter="url(#redGlow)"/>
      <circle cx="120" cy="200" r="1.8" fill="#DC2626" opacity="0.6"/>
      <circle cx="155" cy="300" r="2" fill="#EF4444" opacity="0.7" filter="url(#redGlow)"/>
      <circle cx="135" cy="380" r="1.5" fill="#DC2626" opacity="0.5"/>
      <circle cx="100" cy="260" r="2.5" fill="#EF4444" opacity="0.6" filter="url(#redGlow)"/>
      <circle cx="165" cy="170" r="1.2" fill="#FCA5A5" opacity="0.9"/>
      {/* Amber particles (right) */}
      <circle cx="372" cy="140" r="2.5" fill="#F59E0B" opacity="0.8" filter="url(#amberGlow)"/>
      <circle cx="392" cy="200" r="1.8" fill="#D97706" opacity="0.6"/>
      <circle cx="357" cy="300" r="2" fill="#F59E0B" opacity="0.7" filter="url(#amberGlow)"/>
      <circle cx="377" cy="380" r="1.5" fill="#D97706" opacity="0.5"/>
      <circle cx="412" cy="260" r="2.5" fill="#F59E0B" opacity="0.6" filter="url(#amberGlow)"/>
      <circle cx="347" cy="170" r="1.2" fill="#FDE68A" opacity="0.9"/>
      {/* Center particles */}
      <circle cx="256" cy="90" r="1.5" fill="#FFFFFF" opacity="0.9" filter="url(#strongGlow)"/>
      <circle cx="256" cy="440" r="1.2" fill="#FFFFFF" opacity="0.6"/>
      <circle cx="180" cy="260" r="1.2" fill="#EF4444" opacity="0.8"/>
      <circle cx="332" cy="260" r="1.2" fill="#F59E0B" opacity="0.8"/>

      {/* ====== SIDE SILHOUETTES ====== */}
      <g opacity="0.15" fill="#DC2626">
        <ellipse cx="82" cy="220" rx="8" ry="10"/>
        <path d="M74 232 Q82 228 90 232 L88 270 L76 270 Z"/>
        <path d="M74 240 L60 255 L64 258 L76 246"/>
        <path d="M90 240 L104 255 L100 258 L88 246"/>
        <path d="M78 270 L76 295 L82 295 L82 270"/>
        <path d="M86 270 L84 295 L90 295 L88 270"/>
      </g>
      <g opacity="0.15" fill="#F59E0B">
        <ellipse cx="430" cy="220" rx="8" ry="10"/>
        <path d="M422 232 Q430 228 438 232 L436 270 L424 270 Z"/>
        <path d="M422 240 L408 255 L412 258 L424 246"/>
        <path d="M438 240 L452 255 L448 258 L436 246"/>
        <path d="M426 270 L424 295 L430 295 L430 270"/>
        <path d="M434 270 L432 295 L438 295 L436 270"/>
      </g>

      {/* ====== SWORD GLOW AURAS ====== */}
      <ellipse cx="170" cy="250" rx="50" ry="120" fill="#DC2626" opacity="0.05" transform="rotate(-35,170,250)" filter="url(#strongGlow)"/>
      <ellipse cx="342" cy="250" rx="50" ry="120" fill="#F59E0B" opacity="0.05" transform="rotate(35,342,250)" filter="url(#strongGlow)"/>
    </svg>
  )
}
