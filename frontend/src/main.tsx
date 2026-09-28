import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Home } from "./pages/Home";
import { Room } from "./pages/Room";
import { isDebugEnabled } from "./services/debug";
import "./styles/global.css";

isDebugEnabled(); // persiste ?debug=1 na aba antes do roteamento

// STEP-006: roteamento real com react-router-dom.
// "/"        -> tela inicial
// "/s/:id"   -> sala (broadcaster ou viewer, conforme o fluxo)

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/s/:roomId" element={<Room />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
