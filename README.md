# BrainJITsm
Brainf JIT WASM compiler in JS for browsers

## Optimizations
- [X] Combine pointer and cell operations (`+-><`)
- [X] Simplify cell clear loops
- [X] Simplify cell copy/clone/add loops
- [ ] Simplify add to 0 as set
- [ ] Simplify cell multiply loops