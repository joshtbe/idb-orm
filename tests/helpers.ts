import { Page, expect } from "@playwright/test";

type Keyof<T> = Extract<keyof T, string>;

/**
 * Will navigate to the served page and import zod and the package
 *
 * Will also ensure that the package is properly loaded
 * @param context Playwright BrowserContext
 */
export async function populatePage<P extends Record<string, any>>(
    page: Page,
    vars: Record<keyof P, string | EvalFn<P, any>>
) {
    await page.goto("http://localhost:4173/");
    const manager = new ContextSession<P>(page, vars);
    await manager.populate();
    return manager;
}

function getFn(fn: Function) {
    return fn.toString().match(/^async \(\{([^\}]+)\}\) \=\> \{([\s\S]*)\}$/m);
}

export type EvalFn<
    Types extends Record<string, any>,
    This extends keyof Types
> = (args: Omit<Types, This>) => Promise<any>;

export class ContextSession<Types extends Record<string, any>> {
    constructor(
        private page: Page,
        private variables: {
            [K in keyof Types]: string | EvalFn<Types, K>;
        }
    ) {}

    async populate() {
        // Construct the script
        await this.page.addScriptTag({
            type: "module",
            content: `
              window.isReady = (async () => {
              window.vars = {};
              ${Object.keys(this.variables)
                  .map((key) => {
                      const element = this.variables[key];
                      switch (typeof element) {
                          case "function":
                              return `window.vars.${key} = await (${element.toString()})(window.vars);`;
                          default:
                              return `window.vars.${key} = await ${element};`;
                      }
                  })
                  .join("\n")}
              })();
              `,
        });

        await this.page.evaluate(async () => {
            await (window as any).isReady;
            await new Promise((res) => setTimeout(res, 100));
        });
    }

    async evaluate<Result>(
        fn: (args: Types) => Promise<Result>
    ): Promise<Result> {
        return await this.page.evaluate(
            `(async () => await (${fn.toString()})(window.vars))();`
        );
    }
}

export function expectEach(
    value: unknown,
    fn: (item: unknown) => boolean,
    message?: string
) {
    if (!Array.isArray(value)) {
        throw new Error("Value is not an array");
    } else {
        for (const element of value) {
            if (!fn(element)) {
                throw new Error(message ? `${JSON.stringify(element)}: ${message}` : "Element expectation failed");
            }
        }
    }
}
