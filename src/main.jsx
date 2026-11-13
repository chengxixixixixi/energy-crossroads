import React from "react";
import { createRoot } from "react-dom/client";
import AppGame from "./AppGame";
import "@fontsource/press-start-2p/latin-400.css";
import "@fontsource/pixelify-sans/latin-400.css";
import "@fontsource/pixelify-sans/latin-500.css";
import "./index.css";

createRoot(document.getElementById("root")).render(<AppGame />);
