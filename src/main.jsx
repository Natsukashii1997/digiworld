import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import FloatingNotes from "./FloatingNotes.jsx";
import { installDisclosure } from "./disclosure.js";
import "./tokens.css";
import "./styles.css";
import "./base.css";
import "./interaction.css";
import "./ui-v14.css";
installDisclosure();
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {['#/float','#float'].includes(location.hash)?<FloatingNotes/>:<App/>}
  </React.StrictMode>,
);
