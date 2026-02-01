import { core, Model } from "@idb-orm/core";
import {
    useQuery,
    QueryClient,
    QueryClientProvider,
    DefinedUseQueryResult,
    UndefinedInitialDataOptions,
    QueryClientConfig,
} from "@tanstack/react-query";
import React, {
    Context,
    createContext,
    PropsWithChildren,
    ReactNode,
    useContext,
    useEffect,
    useState,
} from "react";
import { ClientProviderProps } from "@idb-orm/react";

export interface QueryOptions<O> extends Omit<
    UndefinedInitialDataOptions<O>,
    "queryFn" | "queryKey"
> {}

// TODO: Use Object.assign to assign query functions to OG client object.
// TODO: Add support for mutations
// TODO: Add custom endpoints
export interface ModelQueryInterface<
    Name extends Names,
    Names extends string,
    Models extends core.CollectionObject<Names>,
> {
    /**
     * Query instance on a particular primary key. This query will acquire **only** the given document and no related documents.
     */
    useGet: Models[Name] extends Model<any, infer Fields, any>
        ? <O = core.Simplify<core.ModelStructure<Fields, Models>>>(
              primaryKey: {
                  key: core.PrimaryKeyType<Models[Name]>;
              } & QueryOptions<O>,
              deps?: React.DependencyList,
          ) => DefinedUseQueryResult<O | undefined>
        : never;
    useFind: <
        I extends core.FindInput<Names, Name, Models>,
        O = core.Simplify<
            NonNullable<core.FindOutput<Names, Name, Models, I>>
        >[],
    >(
        options: QueryOptions<O> & { query: I },
        deps?: React.DependencyList,
    ) => DefinedUseQueryResult<O | undefined>;
    useFindFirst: <
        I extends core.FindInput<Names, Name, Models>,
        O = core.Simplify<core.FindOutput<Names, Name, Models, I>>,
    >(
        options: QueryOptions<O> & { query: I },
        deps?: React.DependencyList,
    ) => DefinedUseQueryResult<O | undefined>;
}

export interface ModelQueryClient {
    // TODO: Include more member functions
    invalidate(): Promise<void>;
}

type IDBClientInterface<
    Names extends string,
    _Models extends core.CollectionObject<Names>,
> = core.Simplify<
    {
        [K in Names]: {
            get: ModelQueryClient;
            findFirst: ModelQueryClient;
            find: ModelQueryClient;
        } & core.Simplify<ModelQueryClient>;
    } & ModelQueryClient
>;

export interface UseQueryClientReturn<
    Name extends string,
    ModelNames extends string,
    Models extends core.CollectionObject<ModelNames>,
> {
    client: core.DbClient<Name, ModelNames, Models>;
    queryClient: IDBQueryClient<ModelNames, Models>;
    stores: IDBClientInterface<ModelNames, Models>;
}

export interface QueryClientProviderFactoryReturn<
    Name extends string,
    ModelNames extends string,
    Models extends core.CollectionObject<ModelNames>,
> {
    Context: Context<UseQueryClientReturn<Name, ModelNames, Models> | null>;
    useDbClient: () => core.DbClient<Name, ModelNames, Models>;
    useQueryClient: () => IDBQueryClient<ModelNames, Models>;
    useQueryInterface: () => IDBClientInterface<ModelNames, Models>;
    useIDBQuery: () => UseQueryClientReturn<Name, ModelNames, Models>;
    DbClientProvider: (
        props: PropsWithChildren<ClientProviderProps>,
    ) => ReactNode;
}

const ctxMissingMsg =
    "Query Client Context not found. Please ensure this component is wrapped in a <DbClientProvider /> component.";

export function queryClientProviderFactory<
    Name extends string,
    ModelNames extends string,
    Models extends core.CollectionObject<ModelNames>,
>(
    db: core.CompiledDb<Name, ModelNames, Models>,
    config?: QueryClientConfig,
): QueryClientProviderFactoryReturn<Name, ModelNames, Models> {
    const Context = createContext<UseQueryClientReturn<
        Name,
        ModelNames,
        Models
    > | null>(null);
    type I = IDBClientInterface<ModelNames, Models>;

    return {
        Context,
        useDbClient: () => {
            const ctx = useContext(Context);
            if (!ctx) {
                throw new Error(ctxMissingMsg);
            }
            return ctx.client;
        },
        useQueryClient: () => {
            const ctx = useContext(Context);
            if (!ctx) {
                throw new Error(ctxMissingMsg);
            }
            return ctx.queryClient;
        },
        useQueryInterface: () => {
            const ctx = useContext(Context);
            if (!ctx) {
                throw new Error(ctxMissingMsg);
            }
            return ctx.stores;
        },
        useIDBQuery: () => {
            const ctx = useContext(Context);
            if (!ctx) {
                throw new Error(ctxMissingMsg);
            }
            return ctx;
        },
        DbClientProvider: ({ fallback, children, version }): ReactNode => {
            const [providerValues, setProviderValues] =
                useState<UseQueryClientReturn<Name, ModelNames, Models> | null>(
                    null,
                );

            useEffect(() => {
                db.createClientAsync(version)
                    .then((cli) => {
                        const qClient = new IDBQueryClient(cli, config);

                        function makeModelQueryClient(
                            path: readonly string[],
                        ): ModelQueryClient {
                            return {
                                invalidate: () =>
                                    qClient.invalidateQueries({
                                        queryKey: path,
                                    }),
                            };
                        }

                        const interfaces = makeModelQueryClient([]) as I;
                        const stores = qClient.db.getStoreNames();

                        for (const name of stores) {
                            if (name === "invalidate") {
                                console.warn(
                                    "Model name 'invalidate' causes the invalidate() function of useClient() to not work. Please fix by renaming the model.",
                                );
                            }
                            interfaces[name] = {
                                ...makeModelQueryClient([name]),
                                get: makeModelQueryClient([name, "get"]),
                                find: makeModelQueryClient([name, "find"]),
                                findFirst: makeModelQueryClient([
                                    name,
                                    "findFirst",
                                ]),
                            } as I[ModelNames];
                        }

                        setProviderValues({
                            client: cli,
                            queryClient: qClient,
                            stores: interfaces,
                        });
                    })
                    .catch((err) => {
                        throw new Error(
                            `@idb-orm Query Client Creation Failed: ${err}`,
                        );
                    });
                return;
            }, [version]);

            if (!providerValues) return fallback;

            return (
                <QueryClientProvider client={providerValues.queryClient}>
                    <Context.Provider value={providerValues}>
                        {children}
                    </Context.Provider>
                </QueryClientProvider>
            );
        },
    };
}

export class IDBQueryClient<
    Names extends string,
    Models extends core.CollectionObject<Names>,
> extends QueryClient {
    constructor(
        public readonly db: core.DbClient<string, Names, Models>,
        config?: QueryClientConfig,
    ) {
        super(config);
    }

    createInterface(
        context: React.Context<IDBClientInterface<Names, Models>>,
    ): IDBQueryInterface<Names, Models> {
        const result = {} as IDBQueryInterface<Names, Models>;
        const storeNames = this.db.getStoreNames();
        const stores = this.db.stores;
        for (const store of storeNames) {
            result[store] = {
                useFind: (options, deps = []) => {
                    return useQuery({
                        ...(options as {}),
                        queryKey: [store, "find", options.query, ...deps],
                        queryFn: () => stores[store].find(options.query),
                    });
                },
                useFindFirst: (options, deps = []) => {
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
                            /*  eslint-disable */
                            // @ts-ignore
                            stores[store].get(options.key) as any,
                        /*  eslint-enable */
                    });
                },
            } as IDBQueryInterface<Names, Models>[Names];
        }

        return {
            ...result,
            useClient: () => {
                const ctx = React.useContext(context);
                if (!ctx)
                    throw new Error(
                        "Query Context Not Found. Make sure you wrap your application in the <Provider/> Component.",
                    );
                return ctx;
            },
        };
    }
}

export type IDBQueryInterface<
    Names extends string,
    Models extends core.CollectionObject<Names>,
> = {
    useClient(): IDBClientInterface<Names, Models>;
} & {
    [K in Names]: ModelQueryInterface<K, Names, Models>;
};
