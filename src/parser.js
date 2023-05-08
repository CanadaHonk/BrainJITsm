import { enumify } from "./util.js";

export const Token = enumify('PointerRight', 'PointerLeft', 'Increment', 'Decrement', 'Output', 'Input', 'LoopStart', 'LoopEnd', 'Loop');

export const CharMap = {
  '>': Token.PointerRight,
  '<': Token.PointerLeft,
  '+': Token.Increment,
  '-': Token.Decrement,
  '.': Token.Output,
  ',': Token.Input,
  '[': Token.LoopStart,
  ']': Token.LoopEnd,
};

export class AST {
  constructor(nodes) {
    this.nodes = nodes;
  }

  length() {
    let out = 0;
    const walk = x => {
      for (const y of x) {
        out++;
        if (y.nodes) walk(y.nodes);
      }
    };

    walk(this.nodes);
    return out;
  }

  toCode() {
    let out = '';
    let depth = 0;

    const codify = nodes => {
      for (const x of nodes) {
        switch (x.type) {
          case Token.Loop:
            depth++;
            out += '[';
            codify(x.nodes);
            break;

          default:
            out += Object.keys(CharMap)[x.type];
        }
      }

      if (depth > 0) {
        out += ']';
        depth--;
      }
    };

    codify(this.nodes);

    return out;
  }

  toString() {
    let out = '';
    let depth = 0;

    const indent = x => ' │ '.repeat(x);

    const beautify = nodes => {
      let i = 0;
      for (const x of nodes) {
        const last = depth > 0 && i === nodes.length - 1 && x.type !== Token.Loop;
        out += indent(depth);

        if (last) out = out.slice(0, -2) + '└ ';

        switch (x.type) {
          case Token.PointerRight:
            out += 'PointerRight';
            break;

          case Token.PointerLeft:
            out += 'PointerLeft';
            break;

          case Token.Increment:
            out += 'Increment';
            break;

          case Token.Decrement:
            out += 'Decrement';
            break;

          case Token.Output:
            out += 'Output';
            break;

          case Token.Input:
            out += 'Input';
            break;

          case Token.Loop:
            depth++;
            out += 'Loop\n';
            beautify(x.nodes);
            break;
        }

        if (x.type !== Token.Loop) out += '\n';

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

export const parse = input => {
  let ast = [];
  let children = [];

  for (const char of input.split('')) {
    const type = CharMap[char];
    if (type === undefined) {
      // unmapped character - comment, ignore
      continue;
    }

    switch (type) {
      case Token.LoopStart:
        children.push([]);
        break;

      case Token.LoopEnd:
        const nodes = children.pop();
        (children.length > 0 ? children[children.length - 1] : ast).push({
          type: Token.Loop,
          nodes
        });
        break;

      default:
        (children.length > 0 ? children[children.length - 1] : ast).push({ type });
    }
  }

  return new AST(ast);
};