import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '1200px',
          height: '630px',
          padding: '64px 72px 56px 72px',
          backgroundColor: '#FFFFFF',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: '#C45D3E',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span style={{ fontSize: '18px', fontWeight: 700, color: '#1A1816', letterSpacing: '-0.02em' }}>
              Pollen
            </span>
          </div>
          <div style={{ width: '1px', height: '20px', backgroundColor: '#D5D0CA' }} />
          <span style={{ fontSize: '13px', fontWeight: 500, color: '#8A8580', letterSpacing: '0.04em' }}>
            DOCUMENTATION
          </span>
        </div>

        {/* Hero */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '-40px' }}>
          <div style={{ fontSize: '52px', fontWeight: 700, color: '#1A1816', letterSpacing: '-0.035em', lineHeight: 1.08 }}>
            The shared intelligence network for developers.
          </div>
          <div style={{ fontSize: '18px', fontWeight: 400, color: '#8A8580', lineHeight: 1.5, maxWidth: '520px' }}>
            Guides, API reference, and everything you need to contribute data and earn from the network.
          </div>
        </div>

        {/* Category pills */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              padding: '10px 20px',
              borderRadius: '8px',
              backgroundColor: '#1A1816',
              fontSize: '13px',
              fontWeight: 600,
              color: '#FAF8F5',
            }}
          >
            Quickstart
          </div>
          {['CLI Reference', 'Wallet Setup', 'Earning', 'Trends API', 'x402'].map((label) => (
            <div
              key={label}
              style={{
                display: 'flex',
                padding: '10px 20px',
                borderRadius: '8px',
                backgroundColor: '#F0EDE8',
                fontSize: '13px',
                fontWeight: 600,
                color: '#1A1816',
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  )
}
