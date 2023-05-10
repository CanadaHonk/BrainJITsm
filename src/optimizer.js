import { AST, Token } from './parser.js';
import { enumify } from './util.js';

export const Op = enumify('PointerAdd', 'PointerSet', 'CellAdd', 'CellSet', 'CellAddCell', 'Output', 'Input', 'Loop');

class OST extends AST {
  toString() {
    let out = '';
    let depth = 0;

    const beautify = nodes => {
      let i = 0;
      for (const x of nodes) {
        const last = depth > 0 && i === nodes.length - 1 && x.type !== Token.Loop;
        out += ' │ '.repeat(last ? (depth - 1) : depth);
        if (last) out += ' └ ';

        switch (x.op) {
          case Op.PointerAdd:
            out += `PointerAdd ${x.val}`;
            break;

          case Op.PointerSet:
            out += `PointerSet ${x.val}`;
            break;

          case Op.CellAdd:
            out += `CellAdd ${x.val}`;
            break;

          case Op.CellSet:
            out += `CellSet ${x.val}`;
            break;

          case Op.CellAddCell:
            out += `CellAddCell ${x.offset}`;
            if (x.factor) out += ` * ${x.factor}`;
            break;

          case Op.Output:
            out += 'Output';
            break;

          case Op.Input:
            out += 'Input';
            break;

          case Op.Loop:
            depth++;
            out += 'Loop\n';
            beautify(x.nodes);
            break;
        }

        if (x.op !== Op.Loop) out += '\n';

        i++;
      }

      if (depth > 0) {
        depth--;
      }
    };

    beautify(this.nodes);

    return out;
  }
}

const checkCopyLoop = nodes => {
  const n = (nodes.length - 1) / 3;
  let i = 0;

  // -
  if (nodes[0].type !== Token.Decrement) return;

  if (nodes[1].type === Token.PointerRight) {
    // forward copy loop

    // '>+'.repeat(n)
    for (i = 1; i <= n * 2; i++) {
      if (i % 2 === 0 && nodes[i].type !== Token.Increment) return;
      if (i % 2 === 1 && nodes[i].type !== Token.PointerRight) return;
    }

    // '<'.repeat(n)
    for (; i <= n * 3; i++) {
      if (nodes[i].type !== Token.PointerLeft) return;
    }

    return i === nodes.length && n;
  }

  if (nodes[1].type === Token.PointerLeft) {
    // backward copy loop
    // '<'.repeat(n)
    for (i = 1; i <= n; i++) {
      if (nodes[i].type !== Token.PointerLeft) return;
    }

    // '+>'.repeat(n)
    for (; i <= n * 3; i++) {
      if ((i - n) % 2 === 0 && nodes[i].type !== Token.PointerRight) return;
      if ((i - n) % 2 === 1 && nodes[i].type !== Token.Increment) return;
    }

    return i === nodes.length && (n * -1);
  }
};

const checkMoveLoop = nodes => {
  const n = (nodes.length - 2) / 2;
  let i = 0;

  // -
  if (nodes[0].type !== Token.Decrement) return;

  if (nodes[1].type === Token.PointerRight) {
    // forward move loop
    // '>'.repeat(n)
    for (i = 1; i <= n; i++) {
      if (nodes[i].type !== Token.PointerRight) return;
    }

    // +
    if (nodes[i++].type !== Token.Increment) return;

    // '<'.repeat(n)
    for (; i <= n * 2 + 1; i++) {
      if (nodes[i].type !== Token.PointerLeft) return;
    }

    return i === nodes.length && n;
  }

  if (nodes[1].type === Token.PointerLeft) {
    // backward move loop
    // '<'.repeat(n)
    for (i = 1; i <= n; i++) {
      if (nodes[i].type !== Token.PointerLeft) return;
    }

    // +
    if (nodes[i++].type !== Token.Increment) return;

    // '>'.repeat(n)
    for (; i <= n * 2 + 1; i++) {
      if (nodes[i].type !== Token.PointerRight) return;
    }

    return i === nodes.length && (n * -1);
  }
};

globalThis.opts = {
  combineOps: true,
  copyLoop: true,
  moveLoop: false,
  clearLoop: true,
  addToZeroAsSet: true,
  asmSetGetAsTee: true,
};


// AST -> OST - optimized, generic ops
export const optimize = ast => {
  let depth = 0, index = 0, memory = new Array(1000).fill(0), tainted = false, canSet = false;
  const walk = nodes => {
    let out = [];
    let val = 0;

    for (let i = 0; i < nodes.length; i++) {
      const x = nodes[i];
      const next = nodes[i + 1];
      const nextSameOp = next !== undefined && (
        (x.type === Token.PointerRight || x.type === Token.PointerLeft) && (next.type === Token.PointerRight || next.type === Token.PointerLeft) ||
        (x.type === Token.Increment || x.type === Token.Decrement) && (next.type === Token.Increment || next.type === Token.Decrement)
      );

      if (nextSameOp && opts.combineOps) {
        switch (x.type) {
          case Token.PointerRight:
          case Token.Increment:
            val++;
            break;

          default:
            val--;
            break;
        }

        continue;
      }

      switch (x.type) {
        case Token.PointerRight:
          canSet = !tainted && opts.addToZeroAsSet && index === 0;
          if (!tainted) index += val + 1;

          out.push({ op: canSet ? Op.PointerSet : Op.PointerAdd, val: val + 1 });
          break;

        case Token.PointerLeft:
          canSet = !tainted && opts.addToZeroAsSet && index === 0;
          if (!tainted) index += val - 1;

          out.push({ op: canSet ? Op.PointerSet : Op.PointerAdd, val: val - 1 });
          break;

        case Token.Increment:
          canSet = !tainted && opts.addToZeroAsSet && memory[index] === 0;
          if (!tainted) memory[index] += val + 1;

          out.push({ op: canSet ? Op.CellSet : Op.CellAdd, val: val + 1 });
          break;

        case Token.Decrement:
          canSet = !tainted && opts.addToZeroAsSet && memory[index] === 0;
          if (!tainted) memory[index] += val - 1;

          out.push({ op: canSet ? Op.CellSet : Op.CellAdd, val: val - 1 });
          break;

        case Token.Output:
          out.push({ op: Op.Output });
          break;

        case Token.Input:
          out.push({ op: Op.Input });
          break;

        case Token.Loop:
          if (x.nodes.length === 1 && x.nodes[0].type === Token.Decrement && opts.clearLoop) {
            // [-] = Loop { Decrement } = set cell to 0
            if (!tainted) memory[index] = 0;
            out.push({
              op: Op.CellSet,
              val: 0
            });
            break;
          }

          let n;
          if ((x.nodes.length - 1) % 3 === 0 && x.nodes.length > 1 && (n = checkCopyLoop(x.nodes)) && opts.copyLoop) { // 3n + 1
            const isBackward = n < 0;

            for (let i = 0; i < Math.abs(n); i++) {
              // CellAddCell { offset } - mem[index + offset] += mem[index]
              const offset = isBackward ? -(i + 1) : (i + 1)
              if (!tainted) memory[index + offset] += memory[index];

              out.push({
                op: Op.CellAddCell,
                offset
              });
            }

            if (!tainted) memory[index] = 0;
            // set current cell to 0
            out.push({
              op: Op.CellSet,
              val: 0
            });

            break;
          }

          if (x.nodes.length % 2 === 0 && (n = checkMoveLoop(x.nodes)) && opts.moveLoop) { // 2n + 2
            console.log(n, x);

            if (!tainted) memory[index + n] += memory[index];
            out.push({
              op: Op.CellAddCell,
              offset: n
            });

            if (!tainted) memory[index] = 0;
            // set current cell to 0
            out.push({
              op: Op.CellSet,
              val: 0
            });

            break;
          }

          depth++;
          tainted = true; // cannot keep track easily

          out.push({
            op: Op.Loop,
            nodes: walk(x.nodes)
          });
          break;
      }

      val = 0;
    }

    if (depth > 0) {
      depth--;
    }

    return out;
  };

  return new OST(walk(ast.nodes));
};