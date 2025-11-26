import { test, expect, Page } from "@playwright/test";
import { ContextSession, EvalFn, populatePage } from "../helpers.js";
import * as core from "../../packages/core";
import * as zodPackage from "../../packages/zod-adapter";
import * as ZOD from "zod";
import { coreTests } from "../core/create-db.js";
import { createZodDb, SessionArguments } from "./create-db.js";

const IMPORTS = {
    a: "import('./zod-adapter/dist/index.es.js')",
    z: "import('https://cdn.jsdelivr.net/npm/zod@4.1.13/+esm')",
};

coreTests(createZodDb, IMPORTS);
