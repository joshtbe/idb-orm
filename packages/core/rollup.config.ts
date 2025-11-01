import typescript from "@rollup/plugin-typescript";
import terser from "@rollup/plugin-terser";
import { nodeResolve } from "@rollup/plugin-node-resolve";

export default {
    input: "src/index.ts",
    output: [
        {
            file: "dist/index.js",
            format: "esm",
            minifyInternalExports: true,
            sourcemap: false,
        },
    ],

    plugins: [
        nodeResolve(),
        terser(),
        typescript({
            tsconfig: "./tsconfig.json",
            sourceMap: false,
            exclude: ["**/tests/*"],
        }),
    ],
};
