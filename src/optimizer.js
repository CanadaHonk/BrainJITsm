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
        const last = depth > 0 && i === nodes.length - 1 && x.op !== Op.Loop;
        out += ' │ '.repeat(depth);

        if (last) out = out.slice(0, -2) + '└ ';

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

const isCopyLoop = nodes => {
  const n = (nodes.length - 1) / 3;
  let i = 0;
  if (nodes[i].type !== Token.Decrement) return;

  // '>+'.repeat(n)
  for (i = 1; i <= n * 2; i++) {
    if (i % 2 === 0 && nodes[i].type !== Token.Increment) return;
    if (i % 2 === 1 && nodes[i].type !== Token.PointerRight) return;
  }

  // '<'.repeat(n)
  for (; i <= n * 3; i++) {
    if (nodes[i].type !== Token.PointerLeft) return;
  }

  return i === nodes.length;
};


// AST -> OST - optimized, generic ops
export const optimize = ast => {
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

      if (nextSameOp) {
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
          out.push({ op: Op.PointerAdd, val: val + 1 });
          break;

        case Token.PointerLeft:
          out.push({ op: Op.PointerAdd, val: val - 1 });
          break;

        case Token.Increment:
          out.push({ op: Op.CellAdd, val: val + 1 });
          break;

        case Token.Decrement:
          out.push({ op: Op.CellAdd, val: val - 1 });
          break;

        case Token.Output:
          out.push({ op: Op.Output });
          break;

        case Token.Input:
          out.push({ op: Op.Input });
          break;

        case Token.Loop:
          if (x.nodes.length === 1 && x.nodes[0].type === Token.Decrement) {
            // [-] = Loop { Decrement } = set cell to 0
            out.push({
              op: Op.CellSet,
              val: 0
            });
            break;
          }

          // [->+<] 4, [->+>+<<] 7, [->+>+>+<<<] 10, etc
          if ((x.nodes.length - 1) % 3 === 0 && isCopyLoop(x.nodes)) { // 3n + 1
            const n = (x.nodes.length - 1) / 3;

            for (let i = 0; i < n; i++) {
              // CellAddCell { offset } - mem[index + offset] += mem[index]
              out.push({
                op: Op.CellAddCell,
                offset: i + 1
              });
            }

            // set current cell to 0
            out.push({
              op: Op.CellSet,
              val: 0
            });

            break;
          }

          out.push({
            op: Op.Loop,
            nodes: walk(x.nodes)
          });
          break;
      }

      val = 0;
    }

    return out;
  };

  return new OST(walk(ast.nodes));
};