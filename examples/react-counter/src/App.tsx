import { useState } from "react";
import Counter from "./Counter.voo";

export function App() {
  const [initial, setInitial] = useState(1);
  const [lastChange, setLastChange] = useState<number>();
  const [visible, setVisible] = useState(true);

  return (
    <main>
      <h1>Vooya inside React</h1>
      {visible ? (
        <Counter
          initial={initial}
          className="counter-host"
          onChange={(value) => setLastChange(value)}
        />
      ) : null}
      <p>React received: {lastChange ?? "no event"}</p>
      <button onClick={() => setInitial(10)}>Set React prop to 10</button>
      <button onClick={() => setVisible((current) => !current)}>Toggle Vooya island</button>
    </main>
  );
}
