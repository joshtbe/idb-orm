import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
    build: {
        minify: "terser",
        lib: {
            entry: "src/index.ts",
            name: "@idb-orm/core",
            formats: ["es", "cjs"],
            fileName: (format: string) => `index.${format}.js`,
        },
    },
    plugins: [dts({})],
});
