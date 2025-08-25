import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./polyfills.js"; // Import polyfills before other modules
import "./index.css";
// Choose which version to use:
// import App from './App.jsx'            // Original with simple-peer
import AppWebRTC from "./AppWebRTC.jsx"; // With direct WebRTC API
// import TestApp from './TestApp.jsx'    // Simple test component

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AppWebRTC />
  </StrictMode>
);
