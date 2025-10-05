import audio from "./audio.ts";
import files from "./file.ts";
import { builder } from "./builder.ts";

const compiledDb = builder.compile({
    audio,
    files,
});

export const dbClient = await compiledDb.createClient();
const audioStore = dbClient.stores.audio;
const fileStore = dbClient.stores.files;

export { audioStore, fileStore };
