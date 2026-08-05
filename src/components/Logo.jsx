// The RentLoja brandmark — a house with a keyhole, for rental access & tenancy.
// Renders in `currentColor` so it takes the accent colour of whatever tile
// (.mark / .tb-mark) it sits inside. Used as the DEFAULT mark when a workspace
// hasn't set its own brand name or logo.
export default function Logo({ size = 22, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className}
      fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" fill="currentColor"
        d="M16 4.4 L27.5 13 V27.6 H4.5 V13 Z M13 16.5 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0 Z M14.6 19 L17.4 19 L18.2 24.8 L13.8 24.8 Z" />
    </svg>
  )
}
