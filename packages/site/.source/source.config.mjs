// source.config.ts
import { defineDocs } from "fumadocs-mdx/config";
var docs = defineDocs({
  dir: "content/docs",
  docs: {
    postprocess: {
      valueToExport: ["structuredData"]
    }
  }
});
export {
  docs
};
