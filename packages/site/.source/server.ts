// @ts-nocheck
import { default as __fd_glob_21 } from "../content/docs/wallet/meta.json?collection=docs"
import { default as __fd_glob_20 } from "../content/docs/earning/meta.json?collection=docs"
import { default as __fd_glob_19 } from "../content/docs/developers/meta.json?collection=docs"
import { default as __fd_glob_18 } from "../content/docs/cli/meta.json?collection=docs"
import { default as __fd_glob_17 } from "../content/docs/meta.json?collection=docs"
import * as __fd_glob_16 from "../content/docs/wallet/managed.mdx?collection=docs"
import * as __fd_glob_15 from "../content/docs/wallet/index.mdx?collection=docs"
import * as __fd_glob_14 from "../content/docs/wallet/bring-your-own.mdx?collection=docs"
import * as __fd_glob_13 from "../content/docs/earning/index.mdx?collection=docs"
import * as __fd_glob_12 from "../content/docs/earning/epochs.mdx?collection=docs"
import * as __fd_glob_11 from "../content/docs/earning/claiming.mdx?collection=docs"
import * as __fd_glob_10 from "../content/docs/developers/x402.mdx?collection=docs"
import * as __fd_glob_9 from "../content/docs/developers/use-cases.mdx?collection=docs"
import * as __fd_glob_8 from "../content/docs/developers/trends-api.mdx?collection=docs"
import * as __fd_glob_7 from "../content/docs/developers/index.mdx?collection=docs"
import * as __fd_glob_6 from "../content/docs/developers/catalog.mdx?collection=docs"
import * as __fd_glob_5 from "../content/docs/cli/index.mdx?collection=docs"
import * as __fd_glob_4 from "../content/docs/cli/hooks.mdx?collection=docs"
import * as __fd_glob_3 from "../content/docs/quickstart.mdx?collection=docs"
import * as __fd_glob_2 from "../content/docs/index.mdx?collection=docs"
import * as __fd_glob_1 from "../content/docs/contributing-data.mdx?collection=docs"
import * as __fd_glob_0 from "../content/docs/api.mdx?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.docs("docs", "content/docs", {"meta.json": __fd_glob_17, "cli/meta.json": __fd_glob_18, "developers/meta.json": __fd_glob_19, "earning/meta.json": __fd_glob_20, "wallet/meta.json": __fd_glob_21, }, {"api.mdx": __fd_glob_0, "contributing-data.mdx": __fd_glob_1, "index.mdx": __fd_glob_2, "quickstart.mdx": __fd_glob_3, "cli/hooks.mdx": __fd_glob_4, "cli/index.mdx": __fd_glob_5, "developers/catalog.mdx": __fd_glob_6, "developers/index.mdx": __fd_glob_7, "developers/trends-api.mdx": __fd_glob_8, "developers/use-cases.mdx": __fd_glob_9, "developers/x402.mdx": __fd_glob_10, "earning/claiming.mdx": __fd_glob_11, "earning/epochs.mdx": __fd_glob_12, "earning/index.mdx": __fd_glob_13, "wallet/bring-your-own.mdx": __fd_glob_14, "wallet/index.mdx": __fd_glob_15, "wallet/managed.mdx": __fd_glob_16, });