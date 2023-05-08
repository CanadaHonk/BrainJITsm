export const enumify = (...args) => {
  const obj = {};

  for (let i = 0; i < args.length; i++) {
    obj[i] = args[i];
    obj[args[i]] = i;
  }

  return obj;
};