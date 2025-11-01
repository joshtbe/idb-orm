import typescript from "@rollup/plugin-typescript";
import terser from "@rollup/plugin-terser";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import path from "path";
import alias from "@rollup/plugin-alias";

export default {
    input: "src/index.ts",
    output: [
        {
            file: "dist/index.js",
            format: "esm",
            sourcemap: false,
            minifyInternalExports: true,
        },
    ],

    plugins: [
        alias({
            entries: [
                {
                    find: "@idb-orm/core/dev",
                    replacement: path.resolve("../core/dist/dev.d.ts"),
                },
            ],
        }),
        nodeResolve(),
        terser(),
        typescript({
            tsconfig: "./tsconfig.json",
            sourceMap: false,
            exclude: ["**/tests/*"],
        }),
    ],
    // external: [path.resolve("../core/dist/dev.d.ts")],
};
