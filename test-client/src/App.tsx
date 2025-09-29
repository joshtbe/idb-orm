import { useState } from "react";
import viteLogo from "/vite.svg";
import "./App.css";
import { Builder, client } from "./db3/builder.ts";

// client.stores.classes.add({
//     id: 324,
//     help: "324",
// });

function App() {
    const [count, setCount] = useState(0);

    return (
        <>
            <button
                onClick={() =>
                    client.stores.classes.add({
                        name: "hello",
                        subclasses: ["Wizard"],
                        c_race: {
                            $create: {
                                name: "Tiefling",
                            },
                        },
                    })
                }
            >
                Add Audio
            </button>
            <button onClick={async () => client.stores.traits.add({})}>
                Add Trait
            </button>
            <div>
                <a href="https://vite.dev" target="_blank">
                    <img src={viteLogo} className="logo" alt="Vite logo" />
                </a>
            </div>
            <h1>Vite + React</h1>
            <div className="card">
                <button onClick={() => setCount((count) => count + 1)}>
                    count is {count}
                </button>
                <p>
                    Edit <code>src/App.tsx</code> and save to test HMR
                </p>
            </div>
            <p className="read-the-docs">
                Click on the Vite and React logos to learn more
            </p>
        </>
    );
}

export default App;
