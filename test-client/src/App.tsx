import { useState } from "react";
import viteLogo from "/vite.svg";
import "./App.css";
import { Field } from "./db/field";
import z from "zod";
import { db } from "./db.ts";

const f = new File([], "hel");

// Usage
const client = await db.createClient("test_db", 10);
const stores = client.stores;
console.log(
    stores.files.add({
        name: "boi",
        file: f,
        type: "video",
        audio: {
            $create: {
                name: "hello",
            },
        },
    })
);

// client.stores.classes.add({
//     id: 324,
//     help: "324",
// });

function App() {
    const [count, setCount] = useState(0);

    return (
        <>
            <button
                onClick={() => {
                    client.stores.audio.add({
                        name: "Your Mom",
                        duration: 67,
                        file: {
                            $create: {
                                name: "hello",
                                type: "audio",
                                file: f,
                            },
                        },
                    });
                }}
            >
                Add Audio
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
