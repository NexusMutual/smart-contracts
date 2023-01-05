// Used for generic compiler inserted panics.
const COMPILER = 0x00;

// If you call assert with an argument that evaluates to false.
const FALSE_ASSERT = 0x01;

// If an arithmetic operation results in underflow
// or overflow outside of an unchecked { ... } block.
const UNDER_OR_OVERFLOW = 0x11;

// If you divide or modulo by zero (e.g. 5 / 0 or 23 % 0).
const DIVIDE_BY_ZERO = 0x12;

// If you convert a value that is too big or negative into an enum type.
const INVALID_CONVERSION = 0x21;

// If you access a storage byte array that is incorrectly encoded.
const INCORRECT_STORAGE_ENCODING = 0x22;

// If you call .pop() on an empty array.
const POP_EMPTY_ARRAY = 0x31;

// If you access an array, bytesN or an array slice
//  at an out-of-bounds or negative index
// (i.e. x[i] where i >= x.length or i < 0).
const INVALID_ARRAY_ACCESS = 0x32;

// If you allocate too much memory or create an array that is too large.
const MEMORY_TOO_LARGE = 0x41;

// If you call a zero-initialized variable of internal function type.
const ZERO_INITIALIZED_VARIABLE = 0x51;

module.exports = {
  COMPILER,
  FALSE_ASSERT,
  UNDER_OR_OVERFLOW,
  DIVIDE_BY_ZERO,
  INVALID_CONVERSION,
  INCORRECT_STORAGE_ENCODING,
  POP_EMPTY_ARRAY,
  INVALID_ARRAY_ACCESS,
  MEMORY_TOO_LARGE,
  ZERO_INITIALIZED_VARIABLE,
};
