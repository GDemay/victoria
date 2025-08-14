import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import App from "./components/App";

// Ensure we're in the correct environment for SSR
const isProduction = process.env.NODE_ENV === 'production';

export function render() {
  const html = renderToString(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  return { html };
}
