import { test, expect, Page } from "@playwright/test";
import { ContextSession, EvalFn, populatePage } from "../helpers.js";
import * as core from "../../packages/core";
import * as zodPackage from "../../packages/zod-adapter";
import * as ZOD from "zod";

export type Packages = {
    pkg: typeof core;
    adapter: typeof zodPackage;
    z: typeof ZOD;
};
export type SessionArguments = Packages;

// TODO: Fix this not working in vscode
test.describe("Simple Validation", () => {
    let page: Page;
    let session: ContextSession<SessionArguments>;
    test.beforeAll(async ({ browser }) => {
        const context = await browser.newContext();
        page = await context.newPage();
        session = await populatePage<SessionArguments>(page, {
            pkg: "import('./core/dist/index.js')",
            adapter: "import('./zod-adapter/dist/index.js')",
            z: "import('https://cdn.jsdelivr.net/npm/zod@4.1.12/+esm')",
        });
    });

    test.afterAll(async ({ browser }) => {
        await browser.close();
    });

    test("Sample DB", async () => {
        const result = await session.evaluate(async ({ z }) => {
            const string = z.string();
            const parse = string.safeParse("Hello");
            return parse.success;
        });
        expect(result).toBeTruthy();
    });
});
