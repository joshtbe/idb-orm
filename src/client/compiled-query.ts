import type { CollectionObject } from "../builder.ts";
import { UnknownError } from "../error.js";
import { removeDuplicates } from "../utils.js";
import {
    generateSelectClause,
    generateWhereClause,
    getAccessedStores,
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
    private readonly whereClause?: (value: unknown) => boolean;
    private readonly selectClause: (value: unknown) => Promise<Output>;
    constructor(
        private readonly client: Db,
        private readonly name: Stores,
        input: Input
    ) {
        this.accessedStores = Array.from(
            getAccessedStores(name, input.select ?? {}, "query", this.client)
        );
        this.whereClause = input.where
            ? generateWhereClause(input.where)
            : undefined;
        this.selectClause = generateSelectClause<Stores, Models, typeof client>(
            name,
            this.client,
            input as any
        ) as (value: unknown) => Promise<Output>;
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
        const result: Output[] = [];
        const initStore = tx.getStore(this.name);
        const request = initStore.openCursor();

        await new Promise<void>((res) => {
            request.onsuccess = async (event) => {
                const cursor = (event.target as any)
                    .result as IDBCursorWithValue;
                if (cursor) {
                    const value = cursor.value;
                    if (!this.whereClause || this.whereClause(value)) {
                        result.push(await this.selectClause(value));
                    }

                    // Stop early and return if it's just finding the first one
                    if (stopOnFirst && result.length) {
                        res();
                        return;
                    }
                    cursor.continue();
                } else res();
            };
            request.onerror = () => {
                throw tx.abort(new UnknownError());
            };
        });

        return result;
    }
}
