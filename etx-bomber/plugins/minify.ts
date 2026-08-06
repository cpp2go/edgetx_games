import * as ts from "typescript";
import * as tstl from "typescript-to-lua";
const luamin = require('luamin');

const plugin: tstl.Plugin = {
  afterPrint(
    program: ts.Program,
    options: tstl.CompilerOptions,
    emitHost: tstl.EmitHost,
    result: tstl.ProcessedFile[]
  ) {
    for (const file of result) {
      file.code = "-- etx-sudoku\n" + luamin.minify(file.code);
    }
  },
};

export default plugin;
