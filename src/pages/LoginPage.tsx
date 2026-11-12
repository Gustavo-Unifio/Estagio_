import type { FormEvent } from "react";
import Brand from "../components/Brand";
import Footer from "../components/Footer";

type LoginPageProps = {
  busy: boolean;
  loginError: string;
  error: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

// Apresenta a tela de autenticação quando não há conta ativa.
export default function LoginPage({
  busy,
  loginError,
  error,
  onSubmit,
}: LoginPageProps) {
  return (
    <div className="app-shell app-shell--login">
      <header className="site-header">
        <div className="site-header__inner">
          <Brand />
          <span className="header-caption">Sistema de gestão acadêmica</span>
        </div>
      </header>
      <main className="login-layout">
        <section className="login-intro" aria-labelledby="login-title">
          <span className="eyebrow">GESTÃO ACADÊMICA</span>
          <h1 id="login-title">Atribuição e validação de carga horária</h1>
          <p>
            Consulte as atribuições docentes e valide a disponibilidade de
            carga horária semanal da sua unidade.
          </p>
          <div className="login-rule">
            <span className="login-rule__number">40h</span>
            <span className="login-rule__copy">
              Limite de carga horária semanal por atribuição
            </span>
          </div>
        </section>
        <section className="login-card" aria-labelledby="form-title">
          <span className="eyebrow">ACESSO AO SISTEMA</span>
          <h2 id="form-title">Entrar</h2>
          <p className="muted-copy">
            Use o e-mail e a senha cadastrados para o seu perfil.
          </p>
          <form className="form-stack" onSubmit={onSubmit}>
            <label className="field">
              <span>E-mail institucional</span>
              <input
                type="email"
                name="email"
                autoComplete="username"
                placeholder="nome@cps.sp.gov.br"
                required
              />
            </label>
            <label className="field">
              <span>Senha</span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
              />
            </label>
            {loginError && <p className="form-error" role="alert">{loginError}</p>}
            <button
              className="button button--primary button--full"
              type="submit"
              disabled={busy}
            >
              {busy ? "Verificando…" : "Acessar sistema"}
            </button>
          </form>
          <p className="prototype-note">
            O perfil e a unidade são associados à sua conta pelo administrador.
          </p>
          {error && <p className="form-error" role="alert">{error}</p>}
        </section>
      </main>
      <Footer />
    </div>
  );
}
