import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
    build: {
        minify: "terser",
        lib: {
            entry: "src/index.tsx",
            name: "@idb-orm/react-query",
            formats: ["es", "cjs"],
            fileName: (format: string) => `index.${format}.js`,
        },
        rollupOptions: {
            external: ["@idb-orm/core", "react", "@tanstack/react-query"],
        },
    },
    plugins: [dts({})],
});
