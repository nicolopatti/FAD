// Pannello di destra delle pagine di accesso: racconta che è una piattaforma
// video e cosa succede dentro. Condiviso da login, password dimenticata e
// reimpostazione.
export function LoginPreview() {
  return (
    <section className="login__preview" aria-hidden="true">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 460 }}>
        <h2>Video, ritmo tuo, risultato certo.</h2>
        <p>Le lezioni si sbloccano una dopo l&apos;altra e ogni completamento resta registrato: a fine corso il risultato è già pronto, senza altri passaggi.</p>
      </div>
      <div className="login__player">
        <span className="login__play">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l12 7-12 7z" /></svg>
        </span>
        <div className="login__bar">
          <div className="login__bar-meta"><span>Lezione 3 · Il sistema dei finanziamenti privati</span><span>5:31 / 8:39</span></div>
          <div className="login__bar-track"><div className="login__bar-fill" /></div>
        </div>
      </div>
      <div className="login__card">
        <span className="ok">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        </span>
        <span><strong>Lezione 2 completata</strong> · registrata alle 09:31</span>
      </div>
    </section>
  );
}

export function LoginBrand() {
  return (
    <span className="topbar__brand">
      <span className="topbar__mark" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M6 4l14 8-14 8z" /></svg>
      </span>
      FAD
    </span>
  );
}
