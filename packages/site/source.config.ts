import { defineDocs } from 'fumadocs-mdx/config'

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    postprocess: {
      valueToExport: ['structuredData'],
    },
  },
})
