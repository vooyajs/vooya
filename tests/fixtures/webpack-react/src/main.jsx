import { createRoot } from "react-dom/client";
import { useState } from "react";
import Counter from "./Counter.voo";
function App() { const [value, setValue] = useState(1); const [events, setEvents] = useState([]); return <main><Counter initial={value} onChange={(next) => setEvents((items) => [...items, next])}/><button id="update" onClick={() => setValue((item) => item + 1)}>Update</button><output id="events">{events.join(",")}</output></main>; }
createRoot(document.getElementById("app")).render(<App/>);
