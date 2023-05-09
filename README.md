# BrainJITsm
Brainf JIT WASM compiler in JS for browsers

## Optimizations
- [X] Combine pointer and cell operations (`+-><`)
- [X] Cell clear loops
- [X] Cell copy/clone/add loops
- [X] Add to 0 as set
- [ ] Cell multiply loops

## References
- https://bfc.wilfred.me.uk/docs/optimisations
- https://www.wilfred.me.uk/blog/2015/08/29/an-optimising-bf-compiler/#speculative-execution
- https://www.wilfred.me.uk/blog/2015/10/18/even-more-bf-optimisations/
- https://www.wilfred.me.uk/blog/2016/02/07/an-industrial-grade-bf-compiler/
- http://calmerthanyouare.org/2015/01/07/optimizing-brainfuck.html
