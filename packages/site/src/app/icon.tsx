import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50% 50% 50% 28%',
        background: '#17201b',
        color: '#dceb65',
        fontSize: 17,
        fontWeight: 700,
      }}
    >
      P
    </div>,
    size,
  )
}
