import { unsignedLEB128, signedLEB128, encodeString, encodeLocal, encodeVector, codifyString } from './encoding.js';
// import { Token } from './parser.js';
import { Op } from './optimizer.js';
import { enumify } from './util.js';

const Section = enumify('custom', 'type', 'import', 'func', 'table', 'memory', 'global', 'export', 'start', 'element', 'code', 'data');
const ExportDesc = enumify('func', 'table', 'mem', 'global');

const Valtype = {
  i32: 0x7f,
};

const Blocktype = {
  void: 0x40,
};

const Opcodes = {
  unreachable: 0x00,
  nop: 0x01,

  block: 0x02,
  loop: 0x03,
  if: 0x04,

  end: 0x0b,
  br: 0x0c,
  br_if: 0x0d,
  call: 0x10,

  local_get: 0x20,
  local_set: 0x21,
  local_tee: 0x22, // set and return value (set and get combined)

  i32_load: 0x28,
  i32_load8_s: 0x2c,
  i32_store: 0x36,
  i32_store8: 0x3a,

  i32_const: 0x41,

  i32_eqz: 0x45,
  i32_eq: 0x46,

  i32_add: 0x6a,
  i32_sub: 0x6b,
  i32_mul: 0x6c,
};

const FuncType = 0x60;
const Empty = 0x00;

const Magic = [0x00, 0x61, 0x73, 0x6d];
const ModuleVersion = [0x01, 0x00, 0x00, 0x00];

const createSection = (type, data) => [
  type,
  ...encodeVector(data)
];

globalThis.debug = false;

export let asm = [];
const genCode = ost => {
  asm = [];
  const code = [];
  const symbols = new Map();

  const localIndexForSymbol = name => {
    if (!symbols.has(name)) {
      symbols.set(name, symbols.size);
    }

    return symbols.get(name);
  };

  const localIndex = localIndexForSymbol('index');

  const loadIndex = () => {
    if (globalThis.opts.asmSetGetAsTee && code[code.length - 1] === localIndex && code[code.length - 2] === Opcodes.local_set) {
      // rewrite local.set, local.get as local.tee (sets and returns value)
      code.pop();
      code.pop();

      code.push(Opcodes.local_tee);
      code.push(localIndex);

      if (globalThis.debug) {
        asm.pop();
        if (globalThis.debug) asm.push(`local.tee 0`);
      }

      return;
    }

    code.push(Opcodes.local_get);
    code.push(localIndex);
    if (globalThis.debug) asm.push(`local.get 0`);
  };

  const writeIndex = () => { // ($value)
    code.push(Opcodes.local_set);
    code.push(localIndex);
    if (globalThis.debug) asm.push(`local.set 0`);
  };

  const loadCell = (offset = 0) => {
    loadIndex();
    if (offset !== 0) addI32(offset);

    code.push(Opcodes.i32_load8_s);
    code.push(...[0x00, 0x00]);
    if (globalThis.debug) asm.push(`i32.load8_s`);
  };

  const writeCell = () => { // ($value, $location)
    code.push(Opcodes.i32_store8);
    code.push(...[0x00, 0x00]);
    if (globalThis.debug) asm.push(`i32.store8`);
  };

  const loadI32 = val => {
    code.push(Opcodes.i32_const);
    code.push(...signedLEB128(val));
    if (globalThis.debug) asm.push(`i32.const ${val}`);
  };

  const addI32 = val => { // ($value) -> ($value + val)
    loadI32(val);
    code.push(Opcodes.i32_add);
    if (globalThis.debug) asm.push(`i32.add`);
  };

  const mulI32 = val => { // ($value) -> ($value * val)
    loadI32(val);
    code.push(Opcodes.i32_mul);
    if (globalThis.debug) asm.push(`i32.mul`);
  };

  const debug = str => {
    for (const x of codifyString(str + '\n')) {
      loadI32(x);

      code.push(Opcodes.call);
      code.push(...unsignedLEB128(0));
      if (globalThis.debug) asm.push(`call 0`);
    }
  };

  const unreachable = msg => {
    debug(`unreachable! ` + msg);
    code.push(Opcodes.unreachable);
    if (globalThis.debug) asm.push(`unreachable`);
  };

  const emitCode = nodes => {
    for (const x of nodes) {
      switch (x.op) {
        case Op.PointerAdd:
          loadIndex();
          addI32(x.val);
          writeIndex();
          break;

        case Op.PointerSet:
          loadI32(x.val);
          writeIndex();
          break;

        case Op.CellAdd:
          loadIndex();
          loadCell();
          addI32(x.val);
          writeCell();
          break;

        case Op.CellSet:
          loadIndex();
          loadI32(x.val);
          writeCell();
          break;

        case Op.CellAddCell:
          // load index + offset for writing later
          loadIndex();
          addI32(x.offset);

          // load current and offset cell to add
          loadCell();

          // if factor is provided, mul current cell by factor
          if (x.factor !== 1) mulI32(x.factor);

          loadCell(x.offset);
          code.push(Opcodes.i32_add);
          if (globalThis.debug) asm.push(`i32.add`);

          writeCell();
          break;

        case Op.Output:
          loadCell();
          code.push(Opcodes.call);
          code.push(...unsignedLEB128(0));
          if (globalThis.debug) asm.push(`call 0`);
          break;

        case Op.Input:
          unreachable('input is not implemented');
          break;

        case Op.Loop:
          code.push(Opcodes.loop);
          code.push(Blocktype.void);
          if (globalThis.debug) asm.push(`loop 0`);

          // compute the while-like expression
          loadCell();

          // if $label0
          code.push(Opcodes.if);
          code.push(Blocktype.void);
          if (globalThis.debug) asm.push(`if 1`);

          // the nested logic
          emitCode(x.nodes);

          // br $label1
          code.push(Opcodes.br);
          code.push(...signedLEB128(1));
          if (globalThis.debug) asm.push(`br 1`);

          code.push(Opcodes.end);
          code.push(Opcodes.end);
          break;
      }
    }
  };

  emitCode(ost.nodes);

  const localCount = symbols.size;
  const locals = localCount > 0 ? [encodeLocal(localCount, Valtype.i32)] : [];

  return encodeVector([...encodeVector(locals), ...code, Opcodes.end]);
};

export const compile = ost => {
  const printFunctionType = [
    FuncType,
    ...encodeVector([Valtype.i32]),
    Empty,
  ];

  const typeSection = createSection(
    Section.type,
    encodeVector([printFunctionType, [ FuncType, Empty, Empty ]])
  );

  const funcSection = createSection(
    Section.func,
    encodeVector([1]) // 1 func - main
  );

  const printFunctionImport = [
    0,
    ...encodeString("print"),
    ExportDesc.func,
    0x00
  ];

  const memoryImport = [
    0,
    ...encodeString("memory"),
    ExportDesc.mem,
    0x00,
    0x01
  ];

  const importSection = createSection(
    Section.import,
    encodeVector([printFunctionImport, memoryImport])
  );

  const exportSection = createSection(
    Section.export,
    encodeVector([
      [
        ...encodeString("run"),
        ExportDesc.func,
        1,
      ]
    ])
  );

  const codeSection = createSection(
    Section.code,
    encodeVector([ genCode(ost) ])
  );

  /* console.log({
    typeSection: typeSection.map(x => x.toString(16)),
    importSection: importSection.map(x => x.toString(16)),
    funcSection: funcSection.map(x => x.toString(16)),
    exportSection: exportSection.map(x => x.toString(16)),
    codeSection: codeSection.map(x => x.toString(16))
  }) */

  return Uint8Array.from([
    ...Magic,
    ...ModuleVersion,
    ...typeSection,
    ...importSection,
    ...funcSection,
    ...exportSection,
    ...codeSection
  ]);
};