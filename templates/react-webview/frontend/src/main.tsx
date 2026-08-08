import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function App() {
  const [name, setName] = useState("");
  const [status, setStatus] = useState("Ready");

  return (
    <main>
      <h1>Generated App</h1>
      <label htmlFor="name">Name</label>
      <input id="name" value={name} onChange={(event) => setName(event.target.value)} />
      <button type="button" onClick={() => setStatus("Clicked")}>{status}</button>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
