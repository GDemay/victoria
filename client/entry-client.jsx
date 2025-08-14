import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./components/App";
import "./base.css";

// Ensure React is in production mode
if (process.env.NODE_ENV === 'production') {
  console.log('Running in production mode');
}

ReactDOM.hydrateRoot(
  document.getElementById("root"),
  <StrictMode>
    <App />
  </StrictMode>,
);
