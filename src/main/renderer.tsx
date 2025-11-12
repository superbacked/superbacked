import { createRoot } from "react-dom/client"

import App from "@/src/main/App"

const rootElement = document.getElementById("root")

if (!rootElement) {
  throw new Error("Failed to find the root element")
}

const root = createRoot(rootElement)

root.render(<App />)
