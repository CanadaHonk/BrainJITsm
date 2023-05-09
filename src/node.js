import { parse } from './parser.js';
import { optimize } from './optimizer.js';
import { compile, asm } from './compiler.js';

import fs from 'fs';

let times = [];

const print = str => process.stdout.write(str);
const reportTime = (what, ms) => {
  times.push(ms);
  console.log(`${what}: ${ms.toFixed(0)}ms`);
};


const memoryToString = buf => {
  let out = '';
  const xCells = 36;
  const yCells = 8;

  for (let j = 0; j < yCells; j++) {
    for (let i = 0; i < xCells; i++) {
      const val = buf[j * xCells + i];
      if (val === 0) out += '\x1B[2m';
      out += val.toString(16).padStart(2, '0');
      if (val === 0) out += '\x1B[22m';
      out += ' ';
    }
    out += '\n';
  }

  return out;
};

const run = async wasm => {
  const t1 = performance.now();

  const memory = new WebAssembly.Memory({ initial: 1 });
  const { instance } = await WebAssembly.instantiate(wasm, {
    env: {
      print: i => print(String.fromCharCode(i)),
      memory
    }
  });
  reportTime('wasmInit', performance.now() - t1);

  const t2 = performance.now();
  instance.exports.run();
  console.log('\n'.repeat(30));
  reportTime('exec', performance.now() - t2);

  console.log('memory:\n' + memoryToString(new Uint8Array(memory.buffer)));
};

const highlightAsm = asm =>
  asm
    .replace(/local\.[^\s]*/g, _ => `<span class="highlight-var">${_}</span>`)
    .replace(/(call|block|loop|br_if|br)/g, _ => `<span class="highlight-flow">${_}</span>`)
    .replace(/i32\.[^\s]*/g, _ => `<span class="highlight-num">${_}</span>`)
    .replace(/ [0-9\-]+/g, _ => ` <span class="highlight-const">${_.slice(1)}</span>`)

const execute = async src => {
  times = [];
  const t1 = performance.now();
  const ast = parse(src);
  reportTime('parse', performance.now() - t1);

  const t2 = performance.now();
  const ost = optimize(ast);
  reportTime('opt', performance.now() - t2);

  const t3 = performance.now();
  const wasm = compile(ost);
  reportTime('compile', performance.now() - t3);

  await run(wasm);

  reportTime('total', times.reduce((acc, x) => acc + x, 0));

  compile(ost);
  // console.log(asm.join('\n'));
};
// execute(`++>+><++`);

// execute(`++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++.`);

/* console.log(optimize(parse(`[-<+>]`)).toString());
console.log(optimize(parse(`[-<<+>+>]`)).toString());
console.log(optimize(parse(`[->+<]`)).toString());
console.log(optimize(parse(`[->+>+<<]`)).toString()); */

// execute(`+++++++++++++[->++>>>+++++>++>+<<<<<<]`)

// execute(fs.readFileSync(`examples/mandelbrot.bf`, 'utf8'));
execute(fs.readFileSync(`examples/hanoi.bf`, 'utf8'));

// execute(await (await fetch(`http://localhost:1337/examples/mandelbrot.bf`)).text());
// execute(await (await fetch(`examples/hanoi.bf`)).text());
// execute(`+>`.repeat(500));