const isNumeric = k => k === (+k).toString();

const resultAsObject = result => {
  const entries = Object.entries(result).filter(([k]) => !isNumeric(k));
  return Object.fromEntries(entries);
};

module.exports = { resultAsObject };
