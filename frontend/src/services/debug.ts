// STEP-013: modo debug (spec seção 27). Ativado abrindo qualquer página
// com ?debug=1 (fica salvo na aba via sessionStorage); ?debug=0 desativa.
// Usuário final nunca vê isso.
export function isDebugEnabled(): boolean {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get("debug") === "1") sessionStorage.setItem("debug", "1");
    if (q.get("debug") === "0") sessionStorage.removeItem("debug");
    return sessionStorage.getItem("debug") === "1";
  } catch {
    return false;
  }
}
