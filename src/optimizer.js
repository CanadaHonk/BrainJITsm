import { AST, Token } from './parser.js';
import { enumify } from './util.js';

export const Op = enumify('PointerAdd', 'PointerSet', 'CellAdd', 'CellSet', 'Output', 'Input', 'Loop');

class OST extends AST {
  toString() {
    let out = '';
    let depth = 0;

    const indent = x => ' │ '.repeat(x);

    const beautify = nodes => {
      let i = 0;
      for (const x of nodes) {
        const last = depth > 0 && i === nodes.length - 1 && x.op !== Op.Loop;
        out += indent(depth);

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