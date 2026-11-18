// Exibe a marca institucional e o nome do sistema.
export default function Brand() {
  return (
    <a className="brand" href="#" aria-label="Centro Paula Souza — Carga Docente">
      <img
        className="brand__logo"
        src="https://bkpsitecpsnew.blob.core.windows.net/uploadsitecps/sites/1/2022/09/logo-cps-2022.svg"
        alt="Centro Paula Souza"
      />
      <span className="brand__divider" aria-hidden="true" />
      <span className="brand__product">Carga horária docente</span>
    </a>
  );
}
