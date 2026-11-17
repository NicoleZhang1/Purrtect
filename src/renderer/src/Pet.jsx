import { moods } from './moods'

const FRAME = 32
const SCALE = 5 // 32px * 5 = 160px on screen

export default function Pet({ mood = 'neutral' }) {
  const m = moods[mood] ?? moods.neutral
  const size = FRAME * SCALE
  const total = size * m.frames

  return (
    <div
      key={mood}
      className="pet-sprite"
      style={{
        '--size': `${size}px`,
        '--total': `${total}px`,
        '--frames': m.frames,
        '--dur': `${m.frames / m.fps}s`,
        backgroundImage: `url(${m.sheet})`
      }}
    />
  )
}