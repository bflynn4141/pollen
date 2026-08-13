// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser';
import type * as Config from '../source.config';

const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();
const browserCollections = {
  docs: create.doc("docs", {"api.mdx": () => import("../content/docs/api.mdx?collection=docs"), "index.mdx": () => import("../content/docs/index.mdx?collection=docs"), "quickstart.mdx": () => import("../content/docs/quickstart.mdx?collection=docs"), "cli/hooks.mdx": () => import("../content/docs/cli/hooks.mdx?collection=docs"), "cli/index.mdx": () => import("../content/docs/cli/index.mdx?collection=docs"), "developers/index.mdx": () => import("../content/docs/developers/index.mdx?collection=docs"), "developers/trends-api.mdx": () => import("../content/docs/developers/trends-api.mdx?collection=docs"), "developers/use-cases.mdx": () => import("../content/docs/developers/use-cases.mdx?collection=docs"), "developers/x402.mdx": () => import("../content/docs/developers/x402.mdx?collection=docs"), "earning/claiming.mdx": () => import("../content/docs/earning/claiming.mdx?collection=docs"), "earning/epochs.mdx": () => import("../content/docs/earning/epochs.mdx?collection=docs"), "earning/index.mdx": () => import("../content/docs/earning/index.mdx?collection=docs"), "wallet/bring-your-own.mdx": () => import("../content/docs/wallet/bring-your-own.mdx?collection=docs"), "wallet/index.mdx": () => import("../content/docs/wallet/index.mdx?collection=docs"), "wallet/local.mdx": () => import("../content/docs/wallet/local.mdx?collection=docs"), "wallet/managed.mdx": () => import("../content/docs/wallet/managed.mdx?collection=docs"), }),
};
export default browserCollections;