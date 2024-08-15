const path = require('path');
const fs = require('fs/promises');
const get = require('lodash.get');
const set = require('lodash.set');
const has = require('lodash.has');

class Storage {
  constructor(storageFileName, initStorage) {
    if (!initStorage) {
      throw new Error('initStorage is required');
    }
    this.storageFileName = storageFileName;
    this.initStorage = initStorage;
    this.storagePath = path.join(__dirname, '../data', `${this.storageFileName}`);
    this.data = null; // Will be initialized on the first `get` or `save` call
  }

  async _init() {
    if (this.data !== null) {
      return;
    }
    try {
      const fileContent = await fs.readFile(this.storagePath, 'utf-8');
      if (fileContent === '') {
        this.data = { ...this.initStorage };
      } else {
        this.data = JSON.parse(fileContent);
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        this.data = { ...this.initStorage };
      } else {
        throw err;
      }
    }
  }

  async get(keyString = null) {
    await this._init();
    if (keyString && !has(this.data, keyString)) {
      throw new Error(`Key '${keyString}' does not exist in the storage.`);
    }
    return keyString ? get(this.data, keyString) : this.data;
  }

  async set(keyString, value) {
    await this._init();
    set(this.data, keyString, value);
  }

  // TODO: remove push in favour of set? set(0, value)
  async push(keyString, ...values) {
    await this._init();
    const array = get(this.data, keyString);
    if (!Array.isArray(array)) {
      throw new Error(`Key '${keyString}' is not an array.`);
    }
    array.push(...values);
  }

  async save() {
    await this._init();
    const serialized = JSON.stringify(this.data, null, 2);
    await fs.writeFile(this.storagePath, serialized);
  }
}

module.exports = { Storage };
