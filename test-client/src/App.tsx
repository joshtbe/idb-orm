import { useState } from "react";
import viteLogo from "/vite.svg";
import "./App.css";

import { audioStore, dbClient, fileStore } from "./stores/index.ts";
import { CompiledQuery } from "./db/client/compiled-query.ts";

const rootFile = new File(["hello"], "A test name");

const compiled = fileStore.compileQuery({
    where: {
        type: "audio",
    },
    select: {
        name: true,
    },
});

function App() {
    const [count, setCount] = useState(0);

    return (
        <>
            <div>
                <h1>Real Db</h1>
                <label>
                    Upload an audio file <br />
                    <input
                        type="file"
                        accept="audio/mp3"
                        onChange={async (e) => {
                            const arr = Array.from(e.target.files ?? []);
                            await audioStore.add({
                                name: "BEG audio",
                                duration: arr[0].size,
                                file: {
                                    $create: {
                                        name: arr[0].name,
                                        data: arr[0],
                                        type: "audio",
                                    },
                                },
                            });
                        }}
                    />
                </label>
                <button
                    onClick={async () => {
                        const first = await fileStore.findFirst({})!;

                        await fileStore.add({
                            name: rootFile.name,
                            type: "image",
                            data: rootFile,
                            parent: { $connect: first!.id },
                        });
                    }}
                >
                    Create with children
                </button>
            </div>
            <button
                onClick={async () => {
                    const r = await audioStore.findFirst({
                        select: {
                            name: true,
                            duration: true,
                            file: {
                                name: true,
                                data: true,
                                type: true,
                            },
                        },
                    });
                    console.log(r);
                    
                }}
            >
                Find Test
            </button>
            <button
                onClick={async () => {
                    console.log(await compiled.find());
                }}
            >
                Compile test
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
