import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig(
    eslint.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    tseslint.configs.strictTypeChecked,
    {
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "prefer-const": "warn"
        },
    },
    globalIgnores(["**/dist/", "**/node_modules/"])
);
