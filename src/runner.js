import { parse } from './parser.js';
import { optimize } from './optimizer.js';
import { compile, asm } from './compiler.js';

let times = [];

const print = str => out.textContent += str;
const reportTime = (what, ms) => {
  times.push(ms);

  if (out_stats.textContent) out_stats.textContent += ', ';
  out_stats.textContent += `${what}: ${(ms).toFixed(0)}ms`;
};


const memoryToString = buf => {
  let out = '';
  for (let i = 0; i < Math.floor((window.innerWidth * 0.4) / 28); i++) {
    out += buf[i].toString(16).padStart(2, '0') + ' ';
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
  reportTime('exec', performance.now() - t2);

  document.getElementById('memory').textContent = memoryToString(new Uint8Array(memory.buffer));
};

const highlightAsm = asm =>
  asm
    .replace(/local\.[^\s]*/g, _ => `<span class="highlight-var">${_}</span>`)
    .replace(/(call|block|loop|br_if|br)/g, _ => `<span class="highlight-flow">${_}</span>`)
    .replace(/i32\.[^\s]*/g, _ => `<span class="highlight-num">${_}</span>`)
    .replace(/ [0-9\-]+/g, _ => ` <span class="highlight-const">${_.slice(1)}</span>`)

const execute = async src => {
  times = [];
  out_stats.textContent = '';
  code_stats.textContent = `${src.length} chars`;

  out.textContent = '';

  document.getElementById('code').textContent = src;

  const t1 = performance.now();
  const ast = parse(src);
  reportTime('parse', performance.now() - t1);

  const reportAST = (name, ast) => {
    ast_name.textContent = name;
    ast_stats.textContent = `${ast.length()} nodes`;
    document.getElementById('ast').textContent = ast.toString();
  };

  const t2 = performance.now();
  const ost = optimize(ast);
  reportTime('opt', performance.now() - t2);

  reportAST('AST', ast);
  ast_wrapper.onclick = () => {
    if (ast_name.textContent === 'AST') reportAST('OST', ost);
      else reportAST('AST', ast);
  };

  ost_stats.textContent = `${ost.length()} nodes`;
  document.getElementById('ost').textContent = ost.toString();

  const t3 = performance.now();
  const wasm = compile(ost);
  reportTime('compile', performance.now() - t3);

  await run(wasm);

  reportTime('total', times.reduce((acc, x) => acc + x, 0));

  window.debug = true;
  compile(ost);
  document.getElementById('asm').innerHTML = highlightAsm(asm.join('\n'));
  asm_stats.textContent = `${asm.length} ops`;
  window.debug = false;
};

// execute(`++>+><++`);

// execute(`++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++.`);

execute(await (await fetch(`examples/mandelbrot.bf`)).text());
// execute(await (await fetch(`examples/hanoi.bf`)).text());

document.onauxclick = () => {
  execute(code.textContent);
};