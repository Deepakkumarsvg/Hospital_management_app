// Decorative backdrop for the auth screens (login, password reset, patient
// sign-up). Everything here is drawn from the theme tokens, so it stays
// black & white and flips cleanly between light and dark. Fixed to the
// viewport and inert — it never affects layout or takes pointer events.
export default function AuthBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-bg">
      {/* Two grid scales — a fine mesh under coarse blocks — faded out
          towards the edges so the centre stays calm behind the card. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgb(var(--border) / 0.45) 1px, transparent 1px),' +
            'linear-gradient(to bottom, rgb(var(--border) / 0.45) 1px, transparent 1px),' +
            'linear-gradient(to right, rgb(var(--border) / 0.7) 1px, transparent 1px),' +
            'linear-gradient(to bottom, rgb(var(--border) / 0.7) 1px, transparent 1px)',
          backgroundSize: '24px 24px, 24px 24px, 96px 96px, 96px 96px',
          maskImage: 'radial-gradient(ellipse 75% 65% at 50% 45%, #000 10%, transparent 78%)',
          WebkitMaskImage: 'radial-gradient(ellipse 75% 65% at 50% 45%, #000 10%, transparent 78%)',
        }}
      />

      {/* Diagonal sheen across the whole surface. */}
      <div className="absolute inset-0 bg-gradient-to-br from-fg/[0.05] via-transparent to-fg/[0.04]" />

      {/* Soft drifting glows. */}
      <div className="absolute left-1/2 top-0 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/3 animate-float rounded-full bg-fg/[0.06] blur-3xl motion-reduce:animate-none dark:bg-fg/[0.09]" />
      <div className="absolute bottom-0 left-1/2 h-[340px] w-[580px] -translate-x-1/2 translate-y-1/3 animate-float-slow rounded-full bg-fg/[0.05] blur-3xl motion-reduce:animate-none" />

      {/* Frosted glass shapes — translucent panels and outlined rings. */}
      <div className="absolute -left-24 top-[18%] h-64 w-64 animate-float-slow rounded-full border border-fg/10 bg-fg/[0.03] backdrop-blur-sm motion-reduce:animate-none" />
      <div className="absolute -right-28 bottom-[16%] h-80 w-80 animate-float rounded-full border border-fg/10 bg-fg/[0.02] backdrop-blur-sm motion-reduce:animate-none" />
      <div className="absolute -left-10 bottom-[8%] hidden h-40 w-40 rounded-full border border-fg/[0.08] lg:block" />
      <div className="absolute -right-12 top-[10%] hidden h-56 w-56 rounded-full border border-fg/[0.08] lg:block" />
      <div className="absolute right-[10%] top-[12%] hidden h-28 w-28 rotate-12 rounded-3xl border border-fg/10 bg-fg/[0.03] backdrop-blur-sm sm:block" />
      <div className="absolute bottom-[14%] left-[12%] hidden h-20 w-20 -rotate-12 rounded-2xl border border-fg/10 bg-fg/[0.03] backdrop-blur-sm sm:block" />
      <div className="absolute left-[22%] top-[8%] hidden h-12 w-12 rotate-45 rounded-xl border border-fg/10 bg-fg/[0.04] backdrop-blur-sm xl:block" />

      {/* Vignette — settles the edges back into the page background. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 70% at 50% 45%, transparent 40%, rgb(var(--bg) / 0.75) 100%)',
        }}
      />
    </div>
  );
}
