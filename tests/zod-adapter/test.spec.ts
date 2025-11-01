import { test, expect, Page } from "@playwright/test";
import { ContextSession, EvalFn, populatePage } from "../helpers.js";
import * as core from "../../packages/core";
import * as zodPackage from "../../packages/zod-adapter";

export type Packages = {
    pkg: typeof core;
    adapter: typeof zodPackage;
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
        });
    });

    test.afterAll(async ({ browser }) => {
        await browser.close();
    });

    test("Sample DB", async () => {
        const result = await session.evaluate(async ({ adapter }) => {
            const string = adapter.Property.string();
            const parse = string.validate("Hello");
            return parse.success;
        });
        expect(result).toBeTruthy();
    });
});
