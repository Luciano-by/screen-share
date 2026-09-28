import { useNavigate } from "react-router-dom";

// STEP-006: botões agora navegam de verdade.
// - "Iniciar transmissão": vai para /s/new com intent=create; a página
//   Room.tsx é quem efetivamente conecta e pede a criação da sala.
// - "Assistir": pede o link/código da sala e navega até ele.
//
// Prompt de link ainda é a forma mais simples (sem modal customizado
// nesta etapa) — pode ser substituído por um input mais bonito depois.

function extractRoomId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? null;
  } catch {
    // não é uma URL válida, trata como código puro
    return trimmed;
  }
}

export function Home() {
  const navigate = useNavigate();

  function handleStart() {
    navigate("/s/new", { state: { intent: "create" } });
  }

  function handleWatch() {
    const input = window.prompt("Cole o link ou código da sala:");
    if (!input) return;
    const roomId = extractRoomId(input);
    if (!roomId) return;
    navigate(`/s/${roomId}`);
  }

  return (
    <main className="home">
      <h1 className="home__title">Transmissão de Tela</h1>
      <p className="home__subtitle">
        Compartilhe sua tela com um link. Sem cadastro, sem chat, sem câmera.
      </p>

      <div className="home__actions">
        <button className="btn btn--primary" onClick={handleStart}>
          Iniciar transmissão
        </button>
        <button className="btn btn--secondary" onClick={handleWatch}>
          Assistir
        </button>
      </div>
    </main>
  );
}
