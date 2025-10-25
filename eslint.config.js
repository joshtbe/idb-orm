import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import globals from "globals";

export default defineConfig(
    eslint.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    {
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-unsafe-function-type": "off",
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unsafe-member-access": "off",
            "@typescript-eslint/restrict-template-expressions": "off",
            "@typescript-eslint/no-empty-object-type": "off",
            "@typescript-eslint/switch-exhaustiveness-check": [
                "error",
                {
                    considerDefaultExhaustiveForUnions: true,
                },
            ],
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    args: "all",
                    argsIgnorePattern: "^_",
                    caughtErrors: "all",
                    caughtErrorsIgnorePattern: "^_",
                    destructuredArrayIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    ignoreRestSiblings: true,
                },
            ],
        },
        languageOptions: {
            parserOptions: {
                projectService: true,
            },
            globals: globals.browser,
        },
    },
    {
        ignores: [
            "eslint.config.js",
            "rollup.config.ts",
            "**/dist/*",
            "**/test-client/*",
        ],
    }
);
