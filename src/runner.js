import { parse } from './parser.js';
import { optimize } from './optimizer.js';
import { compile, asm } from './compiler.js';

let times = [];

const print = str => out.textContent += str;
const sleep = ms => new Promise(res => setTimeout(res, ms));

const reportTime = (what, ms) => {
  times.push(ms);

  if (out_stats.textContent) out_stats.textContent += ', ';
  out_stats.textContent += `${what}: ${(ms).toFixed(1)}ms`;
};


const memoryToString = buf => {
  let out = '';
  const xCells = Math.floor((window.innerWidth * 0.4) / 26);
  const yCells = Math.floor(((window.innerHeight * 0.2) - 32) / 22);

  for (let j = 0; j < yCells; j++) {
    for (let i = 0; i < xCells; i++) {
      const val = buf[j * xCells + i];
      if (val === 0) out += '<span class="memory-empty">';
      out += val.toString(16).padStart(2, '0');
      if (val === 0) out += '</span>';
      out += ' ';
    }
    out += '\n';
  }

  return out;
};

const run = async wasm => {
  const t1 = performance.now();

  let outputBuffer = [];

  const memory = new WebAssembly.Memory({ initial: 1 });
  const { instance } = await WebAssembly.instantiate(wasm, {
    '': {
      print: i => outputBuffer.push(i), // print(String.fromCharCode(i)),
      memory
    }
  });
  reportTime('wasmInit', performance.now() - t1);

  const t2 = performance.now();
  instance.exports.run();
  reportTime('exec', performance.now() - t2);

  print(outputBuffer.reduce((acc, x) => acc += String.fromCharCode(x), ''));

  setTimeout(() => {
    document.getElementById('memory').innerHTML = memoryToString(new Uint8Array(memory.buffer));
  }, 10);
};

const highlightAsm = asm =>
  asm
    .replace(/local\.[^\s]*/g, _ => `<span class="highlight-var">${_}</span>`)
    .replace(/(call|block|loop|br_if|br)/g, _ => `<span class="highlight-flow">${_}</span>`)
    .replace(/i32\.[^\s]*/g, _ => `<span class="highlight-num">${_}</span>`)
    .replace(/ [0-9\-]+/g, _ => ` <span class="highlight-const">${_.slice(1)}</span>`)

const execute = async (src, toRun = true) => {
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

  const t3 = performance.now();
  const wasm = compile(ost);
  reportTime('compile', performance.now() - t3);

  if (toRun === true) await run(wasm);

  reportTime('total', times.reduce((acc, x) => acc + x, 0));

  await sleep(100);

  window.debug = true;
  compile(ost);
  document.getElementById('asm').innerHTML = highlightAsm(asm.join('\n'));
  asm_stats.textContent = `${asm.length} ops, ${wasm.byteLength} bytes`;
  window.debug = false;

  await sleep(50);

  reportAST('AST', ast);
  ast_wrapper.onclick = () => {
    if (ast_name.textContent === 'AST') reportAST('OST', ost);
      else reportAST('AST', ast);
  };

  await sleep(50);

  ost_stats.textContent = `${ost.length()} nodes`;
  document.getElementById('ost').textContent = ost.toString();
};

const genOptsUI = () => {
  const inps = {};

  for (const x in globalThis.opts) {
    const el = document.createElement('div');

    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.checked = globalThis.opts[x];

    el.onclick = () => {
      inp.checked = !globalThis.opts[x];
      globalThis.opts[x] = inp.checked;
      reExecute(false);
    };

    inps[x] = inp;

    el.appendChild(inp);
    el.appendChild(document.createTextNode(x));

    document.getElementById('opts').appendChild(el);
  }

  opt_level.onchange = () => {
    globalThis.opts = ({
      0: {
        combineOps: false,
        copyLoop: false,
        moveLoop: false,
        clearLoop: false,
        addToZeroAsSet: false,
        asmSetGetAsTee: false,
      },
      1: {
        combineOps: true,
        copyLoop: false,
        moveLoop: false,
        clearLoop: false,
        addToZeroAsSet: false,
        asmSetGetAsTee: false,
      },
      2: {
        combineOps: true,
        copyLoop: true,
        moveLoop: false,
        clearLoop: true,
        addToZeroAsSet: false,
        asmSetGetAsTee: false,
      },
      3: {
        combineOps: true,
        copyLoop: true,
        moveLoop: false,
        clearLoop: true,
        addToZeroAsSet: true,
        asmSetGetAsTee: true,
      },
    })[parseInt(opt_level.value)];

    for (const x in inps) {
      inps[x].checked = globalThis.opts[x];
    }

    reExecute(false);
  };
};
genOptsUI();

const reExecute = (toRun = true) => {
  execute(code.textContent, toRun);
};

document.onauxclick = e => {
  reExecute(true);

  e.preventDefault();
  return false;
};

// execute(`++>+><++`);

// execute(`++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++.`);

// execute(`>>>+++++ [-<<<+>>>]`);

// execute(await (await fetch(`examples/mandelbrot.bf`)).text());
execute(await (await fetch(`examples/hanoi.bf`)).text());
// execute(`+>`.repeat(500));