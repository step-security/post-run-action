// See: https://rollupjs.org/introduction/

import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'

const config = [
  {
    input: 'src/main/index.ts',
    output: {
      esModule: true,
      file: 'dist/main/index.js',
      format: 'es',
      sourcemap: true
    },
    context: 'this',
    plugins: [
      typescript(),
      nodeResolve({ preferBuiltins: true }),
      commonjs(),
      json()
    ]
  },
  {
    input: 'src/post/index.ts',
    output: {
      esModule: true,
      file: 'dist/post/index.js',
      format: 'es',
      sourcemap: true
    },
    context: 'this',
    plugins: [
      typescript(),
      nodeResolve({ preferBuiltins: true }),
      commonjs(),
      json()
    ]
  }
]

export default config
