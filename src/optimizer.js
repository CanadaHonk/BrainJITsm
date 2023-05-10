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

const checkLoops = nodes => {
  // -
  if (nodes[0].type !== Token.Decrement) return;
  // > || <
  if (nodes[1].type !== Token.PointerRight && nodes[1].type !== Token.PointerLeft) return;

  let i = 1;
  let s = 0, o = [];
  let p = 0, f = 0;
  while (i < nodes.length) {
    switch (nodes[i].type) {
      case Token.PointerRight:
        if (s === 1) {
          o.push([ p, f ]);
          f = 0;
          s = 0;
        }

        p++;
        break;

      case Token.PointerLeft:
        if (s === 1) {
          o.push([ p, f ]);
          f = 0;
          s = 0;
        }

        p--;
        break;

      case Token.Increment:
        if (s === 0) {
          s = 1;
        }

        f++;
        break;

      case Token.Decrement:
        if (s === 0) {
          s = 1;
        }

        f--;
        break;

      default:
        return;
    }

    i++;
  }

  return p === 0 && o;
};

globalThis.opts = {
  combineOps: true,
  AMMLoops: true,
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
          if (x.nodes.length > 3 && (n = checkLoops(x.nodes)) && opts.AMMLoops) { // 3n + 1
            for (const x of n) {
              if (!tainted) memory[index + x[0]] += memory[index] * x[1];
              out.push({
                op: Op.CellAddCell,
                offset: x[0],
                factor: x[1]
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