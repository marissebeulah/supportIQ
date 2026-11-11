import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource/lora/400.css";
import "@fontsource/lora/700.css";
import "@fontsource-variable/dm-sans/wght.css";
import "@fontsource-variable/nunito-sans/wght.css";
import "./styles.css";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import { AppearanceProvider } from "./lib/appearance";
import { ToastProvider } from "./components/toast";
import { CallProvider } from "./lib/calls";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppearanceProvider>
          <ToastProvider>
            <CallProvider>
              <App />
            </CallProvider>
          </ToastProvider>
        </AppearanceProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
