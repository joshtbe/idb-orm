import { core, Model } from "@idb-orm/core";
import {
    useQuery,
    QueryClient,
    QueryClientProvider,
    DefinedUseQueryResult,
    UndefinedInitialDataOptions,
    QueryClientConfig,
} from "@tanstack/react-query";
import React from "react";

type QueryOptions<O> = Omit<
    UndefinedInitialDataOptions<O>,
    "queryFn" | "queryKey"
>;

// TODO: Add support for mutations
interface ModelQueryInterface<
    M extends Model<any, any, any>,
    Names extends string,
    Models extends core.CollectionObject<Names>
> {
    /**
     * Query instance on a particular primary key. This query will acquire **only** the given document and no related documents.
     */
    useGet: M extends Model<any, infer Fields, any>
        ? <O = core.Simplify<core.ModelStructure<Fields, Models>>>(
              primaryKey: { key: core.PrimaryKeyType<M> } & QueryOptions<O>,
              deps?: React.DependencyList
          ) => DefinedUseQueryResult<O | undefined>
        : never;
    useFind: <
        I extends core.FindInput<Names, M, Models>,
        O = core.Simplify<NonNullable<core.FindOutput<Names, M, Models, I>>>[]
    >(
        options: QueryOptions<O> & { query: I },
        deps?: React.DependencyList
    ) => DefinedUseQueryResult<O | undefined>;
    useFindFirst: <
        I extends core.FindInput<Names, M, Models>,
        O = core.Simplify<core.FindOutput<Names, M, Models, I>>
    >(
        options: QueryOptions<O> & { query: I },
        deps?: React.DependencyList
    ) => DefinedUseQueryResult<O | undefined>;
}

interface ModelQueryClient {
    // TODO: Include more member functions
    invalidate(): Promise<void>;
}

type IDBClientInterface<
    Names extends string,
    _Models extends core.CollectionObject<Names>
> = core.Simplify<
    {
        [K in Names]: {
            get: ModelQueryClient;
            findFirst: ModelQueryClient;
            find: ModelQueryClient;
        } & core.Simplify<ModelQueryClient>;
    } & ModelQueryClient
>;

export function createIDBQueryClient<
    Names extends string,
    Models extends core.CollectionObject<Names>
>(client: core.DbClient<string, Names, Models>, config?: QueryClientConfig) {
    type C = IDBClientInterface<Names, Models>;
    const idbClient = new IDBQueryClient(client, config);
    const context = React.createContext<C>({} as C);

    return {
        queryClient: idbClient,
        context,
        Provider: ({
            client,
            children,
        }: React.PropsWithChildren<{
            client: IDBQueryClient<Names, Models>;
        }>) => {
            const clientInterfaces = React.useMemo<C>(() => {
                function makeModelQueryClient(
                    path: readonly string[]
                ): ModelQueryClient {
                    return {
                        invalidate: () =>
                            client.invalidateQueries({
                                queryKey: path,
                            }),
                    };
                }

                const result: C = makeModelQueryClient([]) as C;
                const stores = client.db.getStoreNames();

                for (const name of stores) {
                    if (name === "invalidate") {
                        console.warn(
                            "Model name 'invalidate' causes the invalidate() function of useClient() to not work. Please fix by renaming the model."
                        );
                    }
                    result[name] = {
                        ...makeModelQueryClient([name]),
                        get: makeModelQueryClient([name, "get"]),
                        find: makeModelQueryClient([name, "find"]),
                        findFirst: makeModelQueryClient([name, "findFirst"]),
                    } as C[Names];
                }

                return result;
            }, [client]);

            return (
                <QueryClientProvider client={client}>
                    <context.Provider value={clientInterfaces}>
                        {children}
                    </context.Provider>
                </QueryClientProvider>
            );
        },
        stores: idbClient.createInterface(context),
    };
}

class IDBQueryClient<
    Names extends string,
    Models extends core.CollectionObject<Names>
> extends QueryClient {
    constructor(
        public readonly db: core.DbClient<string, Names, Models>,
        config?: QueryClientConfig
    ) {
        super(config);
    }

    createInterface(
        context: React.Context<IDBClientInterface<Names, Models>>
    ): IDBQueryInterface<Names, Models> {
        const result = {} as IDBQueryInterface<Names, Models>;
        const storeNames = this.db.getStoreNames();
        const stores = this.db.stores;
        for (const store of storeNames) {
            result[store] = {
                useFind(options, deps = []) {
                    return useQuery({
                        ...(options as {}),
                        queryKey: [store, "find", options.query, ...deps],
                        queryFn: () => stores[store].find(options.query),
                    });
                },
                useFindFirst(options, deps = []) {
                    return useQuery({
                        ...(options as {}),
                        queryKey: [store, "findFirst", options.query, ...deps],
                        queryFn: () => stores[store].findFirst(options.query),
                    });
                },
                useGet: (options, deps = []) => {
                    useQuery({
                        ...options,
                        queryKey: [store, "get", options.key, ...deps],
                        queryFn: () =>
                            // I don't feel like sacrificing runtime to fix these type/linter errors
                            // eslint-disable-next-line
                            stores[store].get(options.key as any) as any,
                    });
                },
            } as IDBQueryInterface<Names, Models>[Names];
        }

        return {
            ...result,
            useClient: () => React.useContext(context),
        };
    }
}

export type IDBQueryInterface<
    Names extends string,
    Models extends core.CollectionObject<Names>
> = {
    useClient(): IDBClientInterface<Names, Models>;
} & {
    [K in Names]: ModelQueryInterface<Models[K], Names, Models>;
};
