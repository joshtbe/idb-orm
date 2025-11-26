import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
    build: {
        minify: "terser",
        lib: {
            entry: "src/index.ts",
            name: "@idb-orm/zod-adapter",
            formats: ["es", "cjs"],
            fileName: (format: string) => `index.${format}.js`,
        },
        rollupOptions: {
            external: ["@idb-orm/core", "zod"],
        },
    },
    plugins: [dts({})],
});
