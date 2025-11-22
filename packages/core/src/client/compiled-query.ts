import type { CollectionObject } from "../builder.ts";
import { Transaction } from "../transaction.js";
import {
    generateSelector,
    getAccessedStores,
    getSearchableQuery,
} from "./helpers.js";
import type { DbClient } from "./index.ts";
import type { FindInput, FindOutput } from "./types/find.ts";

export class CompiledQuery<
    Stores extends string,
    Models extends CollectionObject<string>,
    Db extends DbClient<string, Stores, Models>,
    Input extends FindInput<Stores, Models[Stores], Models> = FindInput<
        Stores,
        Models[Stores],
        Models
    >,
    Output = FindOutput<Stores, Models[Stores], Models, Input>
> {
    private readonly accessedStores: Stores[];
    private readonly selectClause: (
        value: unknown,
        tx: Transaction<IDBTransactionMode, Stores>
    ) => Promise<Output | undefined>;
    constructor(
        private readonly client: Db,
        private readonly name: Stores,
        input: Input
    ) {
        this.accessedStores = Array.from(
            getAccessedStores(
                name,
                getSearchableQuery(input),
                false,
                this.client
            )
        );
        this.selectClause = generateSelector<Stores, Models, typeof client>(
            name,
            this.client,
            input
        ) as typeof this.selectClause;
    }

    async find(): Promise<Output[]> {
        return await this._find(false);
    }

    async findFirst() {
        return (await this._find(true))[0];
    }

    private async _find(stopOnFirst: boolean): Promise<Output[]> {
        const tx = this.client.createTransaction(
            "readonly",
            this.accessedStores
        );
        return await tx.wrap(async (tx) => {
            const result: Output[] = [];
            const initStore = tx.getStore(this.name);
            await initStore.openCursor(async (cursor) => {
                const selection = await this.selectClause(cursor.value, tx);

                if (selection) {
                    result.push(selection);
                }
                // Stop early and return if it's just finding the first one
                if (stopOnFirst && result.length) {
                    return false;
                }

                cursor.continue();
                return true;
            });
            return result;
        });
    }
}
