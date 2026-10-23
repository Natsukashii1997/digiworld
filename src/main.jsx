import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import FloatingNotes from "./FloatingNotes.jsx";
import "./styles.css";
import "./interaction.css";
import "./ui-v14.css";
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {['#/float','#float'].includes(location.hash)?<FloatingNotes/>:<App/>}
  </React.StrictMode>,
);
