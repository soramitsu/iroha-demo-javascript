var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/base64-js/index.js
var require_base64_js = __commonJS({
  "node_modules/base64-js/index.js"(exports) {
    "use strict";
    init_esbuild_buffer_shim();
    exports.byteLength = byteLength;
    exports.toByteArray = toByteArray;
    exports.fromByteArray = fromByteArray;
    var lookup = [];
    var revLookup = [];
    var Arr = typeof Uint8Array !== "undefined" ? Uint8Array : Array;
    var code = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    for (i = 0, len = code.length; i < len; ++i) {
      lookup[i] = code[i];
      revLookup[code.charCodeAt(i)] = i;
    }
    var i;
    var len;
    revLookup["-".charCodeAt(0)] = 62;
    revLookup["_".charCodeAt(0)] = 63;
    function getLens(b64) {
      var len2 = b64.length;
      if (len2 % 4 > 0) {
        throw new Error("Invalid string. Length must be a multiple of 4");
      }
      var validLen = b64.indexOf("=");
      if (validLen === -1) validLen = len2;
      var placeHoldersLen = validLen === len2 ? 0 : 4 - validLen % 4;
      return [validLen, placeHoldersLen];
    }
    function byteLength(b64) {
      var lens = getLens(b64);
      var validLen = lens[0];
      var placeHoldersLen = lens[1];
      return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
    }
    function _byteLength(b64, validLen, placeHoldersLen) {
      return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
    }
    function toByteArray(b64) {
      var tmp;
      var lens = getLens(b64);
      var validLen = lens[0];
      var placeHoldersLen = lens[1];
      var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen));
      var curByte = 0;
      var len2 = placeHoldersLen > 0 ? validLen - 4 : validLen;
      var i2;
      for (i2 = 0; i2 < len2; i2 += 4) {
        tmp = revLookup[b64.charCodeAt(i2)] << 18 | revLookup[b64.charCodeAt(i2 + 1)] << 12 | revLookup[b64.charCodeAt(i2 + 2)] << 6 | revLookup[b64.charCodeAt(i2 + 3)];
        arr[curByte++] = tmp >> 16 & 255;
        arr[curByte++] = tmp >> 8 & 255;
        arr[curByte++] = tmp & 255;
      }
      if (placeHoldersLen === 2) {
        tmp = revLookup[b64.charCodeAt(i2)] << 2 | revLookup[b64.charCodeAt(i2 + 1)] >> 4;
        arr[curByte++] = tmp & 255;
      }
      if (placeHoldersLen === 1) {
        tmp = revLookup[b64.charCodeAt(i2)] << 10 | revLookup[b64.charCodeAt(i2 + 1)] << 4 | revLookup[b64.charCodeAt(i2 + 2)] >> 2;
        arr[curByte++] = tmp >> 8 & 255;
        arr[curByte++] = tmp & 255;
      }
      return arr;
    }
    function tripletToBase64(num) {
      return lookup[num >> 18 & 63] + lookup[num >> 12 & 63] + lookup[num >> 6 & 63] + lookup[num & 63];
    }
    function encodeChunk(uint8, start, end) {
      var tmp;
      var output = [];
      for (var i2 = start; i2 < end; i2 += 3) {
        tmp = (uint8[i2] << 16 & 16711680) + (uint8[i2 + 1] << 8 & 65280) + (uint8[i2 + 2] & 255);
        output.push(tripletToBase64(tmp));
      }
      return output.join("");
    }
    function fromByteArray(uint8) {
      var tmp;
      var len2 = uint8.length;
      var extraBytes = len2 % 3;
      var parts = [];
      var maxChunkLength = 16383;
      for (var i2 = 0, len22 = len2 - extraBytes; i2 < len22; i2 += maxChunkLength) {
        parts.push(encodeChunk(uint8, i2, i2 + maxChunkLength > len22 ? len22 : i2 + maxChunkLength));
      }
      if (extraBytes === 1) {
        tmp = uint8[len2 - 1];
        parts.push(
          lookup[tmp >> 2] + lookup[tmp << 4 & 63] + "=="
        );
      } else if (extraBytes === 2) {
        tmp = (uint8[len2 - 2] << 8) + uint8[len2 - 1];
        parts.push(
          lookup[tmp >> 10] + lookup[tmp >> 4 & 63] + lookup[tmp << 2 & 63] + "="
        );
      }
      return parts.join("");
    }
  }
});

// node_modules/ieee754/index.js
var require_ieee754 = __commonJS({
  "node_modules/ieee754/index.js"(exports) {
    init_esbuild_buffer_shim();
    exports.read = function(buffer, offset, isLE2, mLen, nBytes) {
      var e, m;
      var eLen = nBytes * 8 - mLen - 1;
      var eMax = (1 << eLen) - 1;
      var eBias = eMax >> 1;
      var nBits = -7;
      var i = isLE2 ? nBytes - 1 : 0;
      var d = isLE2 ? -1 : 1;
      var s = buffer[offset + i];
      i += d;
      e = s & (1 << -nBits) - 1;
      s >>= -nBits;
      nBits += eLen;
      for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {
      }
      m = e & (1 << -nBits) - 1;
      e >>= -nBits;
      nBits += mLen;
      for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {
      }
      if (e === 0) {
        e = 1 - eBias;
      } else if (e === eMax) {
        return m ? NaN : (s ? -1 : 1) * Infinity;
      } else {
        m = m + Math.pow(2, mLen);
        e = e - eBias;
      }
      return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
    };
    exports.write = function(buffer, value, offset, isLE2, mLen, nBytes) {
      var e, m, c;
      var eLen = nBytes * 8 - mLen - 1;
      var eMax = (1 << eLen) - 1;
      var eBias = eMax >> 1;
      var rt = mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0;
      var i = isLE2 ? 0 : nBytes - 1;
      var d = isLE2 ? 1 : -1;
      var s = value < 0 || value === 0 && 1 / value < 0 ? 1 : 0;
      value = Math.abs(value);
      if (isNaN(value) || value === Infinity) {
        m = isNaN(value) ? 1 : 0;
        e = eMax;
      } else {
        e = Math.floor(Math.log(value) / Math.LN2);
        if (value * (c = Math.pow(2, -e)) < 1) {
          e--;
          c *= 2;
        }
        if (e + eBias >= 1) {
          value += rt / c;
        } else {
          value += rt * Math.pow(2, 1 - eBias);
        }
        if (value * c >= 2) {
          e++;
          c /= 2;
        }
        if (e + eBias >= eMax) {
          m = 0;
          e = eMax;
        } else if (e + eBias >= 1) {
          m = (value * c - 1) * Math.pow(2, mLen);
          e = e + eBias;
        } else {
          m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
          e = 0;
        }
      }
      for (; mLen >= 8; buffer[offset + i] = m & 255, i += d, m /= 256, mLen -= 8) {
      }
      e = e << mLen | m;
      eLen += mLen;
      for (; eLen > 0; buffer[offset + i] = e & 255, i += d, e /= 256, eLen -= 8) {
      }
      buffer[offset + i - d] |= s * 128;
    };
  }
});

// node_modules/buffer/index.js
var require_buffer = __commonJS({
  "node_modules/buffer/index.js"(exports) {
    "use strict";
    init_esbuild_buffer_shim();
    var base64 = require_base64_js();
    var ieee754 = require_ieee754();
    var customInspectSymbol = typeof Symbol === "function" && typeof Symbol["for"] === "function" ? Symbol["for"]("nodejs.util.inspect.custom") : null;
    exports.Buffer = Buffer3;
    exports.SlowBuffer = SlowBuffer;
    exports.INSPECT_MAX_BYTES = 50;
    var K_MAX_LENGTH = 2147483647;
    exports.kMaxLength = K_MAX_LENGTH;
    Buffer3.TYPED_ARRAY_SUPPORT = typedArraySupport();
    if (!Buffer3.TYPED_ARRAY_SUPPORT && typeof console !== "undefined" && typeof console.error === "function") {
      console.error(
        "This browser lacks typed array (Uint8Array) support which is required by `buffer` v5.x. Use `buffer` v4.x if you require old browser support."
      );
    }
    function typedArraySupport() {
      try {
        const arr = new Uint8Array(1);
        const proto = { foo: function() {
          return 42;
        } };
        Object.setPrototypeOf(proto, Uint8Array.prototype);
        Object.setPrototypeOf(arr, proto);
        return arr.foo() === 42;
      } catch (e) {
        return false;
      }
    }
    Object.defineProperty(Buffer3.prototype, "parent", {
      enumerable: true,
      get: function() {
        if (!Buffer3.isBuffer(this)) return void 0;
        return this.buffer;
      }
    });
    Object.defineProperty(Buffer3.prototype, "offset", {
      enumerable: true,
      get: function() {
        if (!Buffer3.isBuffer(this)) return void 0;
        return this.byteOffset;
      }
    });
    function createBuffer(length) {
      if (length > K_MAX_LENGTH) {
        throw new RangeError('The value "' + length + '" is invalid for option "size"');
      }
      const buf = new Uint8Array(length);
      Object.setPrototypeOf(buf, Buffer3.prototype);
      return buf;
    }
    function Buffer3(arg, encodingOrOffset, length) {
      if (typeof arg === "number") {
        if (typeof encodingOrOffset === "string") {
          throw new TypeError(
            'The "string" argument must be of type string. Received type number'
          );
        }
        return allocUnsafe(arg);
      }
      return from(arg, encodingOrOffset, length);
    }
    Buffer3.poolSize = 8192;
    function from(value, encodingOrOffset, length) {
      if (typeof value === "string") {
        return fromString(value, encodingOrOffset);
      }
      if (ArrayBuffer.isView(value)) {
        return fromArrayView(value);
      }
      if (value == null) {
        throw new TypeError(
          "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value
        );
      }
      if (isInstance(value, ArrayBuffer) || value && isInstance(value.buffer, ArrayBuffer)) {
        return fromArrayBuffer(value, encodingOrOffset, length);
      }
      if (typeof SharedArrayBuffer !== "undefined" && (isInstance(value, SharedArrayBuffer) || value && isInstance(value.buffer, SharedArrayBuffer))) {
        return fromArrayBuffer(value, encodingOrOffset, length);
      }
      if (typeof value === "number") {
        throw new TypeError(
          'The "value" argument must not be of type number. Received type number'
        );
      }
      const valueOf = value.valueOf && value.valueOf();
      if (valueOf != null && valueOf !== value) {
        return Buffer3.from(valueOf, encodingOrOffset, length);
      }
      const b = fromObject(value);
      if (b) return b;
      if (typeof Symbol !== "undefined" && Symbol.toPrimitive != null && typeof value[Symbol.toPrimitive] === "function") {
        return Buffer3.from(value[Symbol.toPrimitive]("string"), encodingOrOffset, length);
      }
      throw new TypeError(
        "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value
      );
    }
    Buffer3.from = function(value, encodingOrOffset, length) {
      return from(value, encodingOrOffset, length);
    };
    Object.setPrototypeOf(Buffer3.prototype, Uint8Array.prototype);
    Object.setPrototypeOf(Buffer3, Uint8Array);
    function assertSize(size) {
      if (typeof size !== "number") {
        throw new TypeError('"size" argument must be of type number');
      } else if (size < 0) {
        throw new RangeError('The value "' + size + '" is invalid for option "size"');
      }
    }
    function alloc(size, fill, encoding) {
      assertSize(size);
      if (size <= 0) {
        return createBuffer(size);
      }
      if (fill !== void 0) {
        return typeof encoding === "string" ? createBuffer(size).fill(fill, encoding) : createBuffer(size).fill(fill);
      }
      return createBuffer(size);
    }
    Buffer3.alloc = function(size, fill, encoding) {
      return alloc(size, fill, encoding);
    };
    function allocUnsafe(size) {
      assertSize(size);
      return createBuffer(size < 0 ? 0 : checked(size) | 0);
    }
    Buffer3.allocUnsafe = function(size) {
      return allocUnsafe(size);
    };
    Buffer3.allocUnsafeSlow = function(size) {
      return allocUnsafe(size);
    };
    function fromString(string, encoding) {
      if (typeof encoding !== "string" || encoding === "") {
        encoding = "utf8";
      }
      if (!Buffer3.isEncoding(encoding)) {
        throw new TypeError("Unknown encoding: " + encoding);
      }
      const length = byteLength(string, encoding) | 0;
      let buf = createBuffer(length);
      const actual = buf.write(string, encoding);
      if (actual !== length) {
        buf = buf.slice(0, actual);
      }
      return buf;
    }
    function fromArrayLike(array) {
      const length = array.length < 0 ? 0 : checked(array.length) | 0;
      const buf = createBuffer(length);
      for (let i = 0; i < length; i += 1) {
        buf[i] = array[i] & 255;
      }
      return buf;
    }
    function fromArrayView(arrayView) {
      if (isInstance(arrayView, Uint8Array)) {
        const copy = new Uint8Array(arrayView);
        return fromArrayBuffer(copy.buffer, copy.byteOffset, copy.byteLength);
      }
      return fromArrayLike(arrayView);
    }
    function fromArrayBuffer(array, byteOffset, length) {
      if (byteOffset < 0 || array.byteLength < byteOffset) {
        throw new RangeError('"offset" is outside of buffer bounds');
      }
      if (array.byteLength < byteOffset + (length || 0)) {
        throw new RangeError('"length" is outside of buffer bounds');
      }
      let buf;
      if (byteOffset === void 0 && length === void 0) {
        buf = new Uint8Array(array);
      } else if (length === void 0) {
        buf = new Uint8Array(array, byteOffset);
      } else {
        buf = new Uint8Array(array, byteOffset, length);
      }
      Object.setPrototypeOf(buf, Buffer3.prototype);
      return buf;
    }
    function fromObject(obj) {
      if (Buffer3.isBuffer(obj)) {
        const len = checked(obj.length) | 0;
        const buf = createBuffer(len);
        if (buf.length === 0) {
          return buf;
        }
        obj.copy(buf, 0, 0, len);
        return buf;
      }
      if (obj.length !== void 0) {
        if (typeof obj.length !== "number" || numberIsNaN(obj.length)) {
          return createBuffer(0);
        }
        return fromArrayLike(obj);
      }
      if (obj.type === "Buffer" && Array.isArray(obj.data)) {
        return fromArrayLike(obj.data);
      }
    }
    function checked(length) {
      if (length >= K_MAX_LENGTH) {
        throw new RangeError("Attempt to allocate Buffer larger than maximum size: 0x" + K_MAX_LENGTH.toString(16) + " bytes");
      }
      return length | 0;
    }
    function SlowBuffer(length) {
      if (+length != length) {
        length = 0;
      }
      return Buffer3.alloc(+length);
    }
    Buffer3.isBuffer = function isBuffer(b) {
      return b != null && b._isBuffer === true && b !== Buffer3.prototype;
    };
    Buffer3.compare = function compare(a, b) {
      if (isInstance(a, Uint8Array)) a = Buffer3.from(a, a.offset, a.byteLength);
      if (isInstance(b, Uint8Array)) b = Buffer3.from(b, b.offset, b.byteLength);
      if (!Buffer3.isBuffer(a) || !Buffer3.isBuffer(b)) {
        throw new TypeError(
          'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
        );
      }
      if (a === b) return 0;
      let x = a.length;
      let y = b.length;
      for (let i = 0, len = Math.min(x, y); i < len; ++i) {
        if (a[i] !== b[i]) {
          x = a[i];
          y = b[i];
          break;
        }
      }
      if (x < y) return -1;
      if (y < x) return 1;
      return 0;
    };
    Buffer3.isEncoding = function isEncoding(encoding) {
      switch (String(encoding).toLowerCase()) {
        case "hex":
        case "utf8":
        case "utf-8":
        case "ascii":
        case "latin1":
        case "binary":
        case "base64":
        case "ucs2":
        case "ucs-2":
        case "utf16le":
        case "utf-16le":
          return true;
        default:
          return false;
      }
    };
    Buffer3.concat = function concat(list, length) {
      if (!Array.isArray(list)) {
        throw new TypeError('"list" argument must be an Array of Buffers');
      }
      if (list.length === 0) {
        return Buffer3.alloc(0);
      }
      let i;
      if (length === void 0) {
        length = 0;
        for (i = 0; i < list.length; ++i) {
          length += list[i].length;
        }
      }
      const buffer = Buffer3.allocUnsafe(length);
      let pos = 0;
      for (i = 0; i < list.length; ++i) {
        let buf = list[i];
        if (isInstance(buf, Uint8Array)) {
          if (pos + buf.length > buffer.length) {
            if (!Buffer3.isBuffer(buf)) buf = Buffer3.from(buf);
            buf.copy(buffer, pos);
          } else {
            Uint8Array.prototype.set.call(
              buffer,
              buf,
              pos
            );
          }
        } else if (!Buffer3.isBuffer(buf)) {
          throw new TypeError('"list" argument must be an Array of Buffers');
        } else {
          buf.copy(buffer, pos);
        }
        pos += buf.length;
      }
      return buffer;
    };
    function byteLength(string, encoding) {
      if (Buffer3.isBuffer(string)) {
        return string.length;
      }
      if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
        return string.byteLength;
      }
      if (typeof string !== "string") {
        throw new TypeError(
          'The "string" argument must be one of type string, Buffer, or ArrayBuffer. Received type ' + typeof string
        );
      }
      const len = string.length;
      const mustMatch = arguments.length > 2 && arguments[2] === true;
      if (!mustMatch && len === 0) return 0;
      let loweredCase = false;
      for (; ; ) {
        switch (encoding) {
          case "ascii":
          case "latin1":
          case "binary":
            return len;
          case "utf8":
          case "utf-8":
            return utf8ToBytes2(string).length;
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return len * 2;
          case "hex":
            return len >>> 1;
          case "base64":
            return base64ToBytes(string).length;
          default:
            if (loweredCase) {
              return mustMatch ? -1 : utf8ToBytes2(string).length;
            }
            encoding = ("" + encoding).toLowerCase();
            loweredCase = true;
        }
      }
    }
    Buffer3.byteLength = byteLength;
    function slowToString(encoding, start, end) {
      let loweredCase = false;
      if (start === void 0 || start < 0) {
        start = 0;
      }
      if (start > this.length) {
        return "";
      }
      if (end === void 0 || end > this.length) {
        end = this.length;
      }
      if (end <= 0) {
        return "";
      }
      end >>>= 0;
      start >>>= 0;
      if (end <= start) {
        return "";
      }
      if (!encoding) encoding = "utf8";
      while (true) {
        switch (encoding) {
          case "hex":
            return hexSlice(this, start, end);
          case "utf8":
          case "utf-8":
            return utf8Slice(this, start, end);
          case "ascii":
            return asciiSlice(this, start, end);
          case "latin1":
          case "binary":
            return latin1Slice(this, start, end);
          case "base64":
            return base64Slice(this, start, end);
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return utf16leSlice(this, start, end);
          default:
            if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
            encoding = (encoding + "").toLowerCase();
            loweredCase = true;
        }
      }
    }
    Buffer3.prototype._isBuffer = true;
    function swap(b, n, m) {
      const i = b[n];
      b[n] = b[m];
      b[m] = i;
    }
    Buffer3.prototype.swap16 = function swap16() {
      const len = this.length;
      if (len % 2 !== 0) {
        throw new RangeError("Buffer size must be a multiple of 16-bits");
      }
      for (let i = 0; i < len; i += 2) {
        swap(this, i, i + 1);
      }
      return this;
    };
    Buffer3.prototype.swap32 = function swap32() {
      const len = this.length;
      if (len % 4 !== 0) {
        throw new RangeError("Buffer size must be a multiple of 32-bits");
      }
      for (let i = 0; i < len; i += 4) {
        swap(this, i, i + 3);
        swap(this, i + 1, i + 2);
      }
      return this;
    };
    Buffer3.prototype.swap64 = function swap64() {
      const len = this.length;
      if (len % 8 !== 0) {
        throw new RangeError("Buffer size must be a multiple of 64-bits");
      }
      for (let i = 0; i < len; i += 8) {
        swap(this, i, i + 7);
        swap(this, i + 1, i + 6);
        swap(this, i + 2, i + 5);
        swap(this, i + 3, i + 4);
      }
      return this;
    };
    Buffer3.prototype.toString = function toString() {
      const length = this.length;
      if (length === 0) return "";
      if (arguments.length === 0) return utf8Slice(this, 0, length);
      return slowToString.apply(this, arguments);
    };
    Buffer3.prototype.toLocaleString = Buffer3.prototype.toString;
    Buffer3.prototype.equals = function equals(b) {
      if (!Buffer3.isBuffer(b)) throw new TypeError("Argument must be a Buffer");
      if (this === b) return true;
      return Buffer3.compare(this, b) === 0;
    };
    Buffer3.prototype.inspect = function inspect() {
      let str = "";
      const max = exports.INSPECT_MAX_BYTES;
      str = this.toString("hex", 0, max).replace(/(.{2})/g, "$1 ").trim();
      if (this.length > max) str += " ... ";
      return "<Buffer " + str + ">";
    };
    if (customInspectSymbol) {
      Buffer3.prototype[customInspectSymbol] = Buffer3.prototype.inspect;
    }
    Buffer3.prototype.compare = function compare(target, start, end, thisStart, thisEnd) {
      if (isInstance(target, Uint8Array)) {
        target = Buffer3.from(target, target.offset, target.byteLength);
      }
      if (!Buffer3.isBuffer(target)) {
        throw new TypeError(
          'The "target" argument must be one of type Buffer or Uint8Array. Received type ' + typeof target
        );
      }
      if (start === void 0) {
        start = 0;
      }
      if (end === void 0) {
        end = target ? target.length : 0;
      }
      if (thisStart === void 0) {
        thisStart = 0;
      }
      if (thisEnd === void 0) {
        thisEnd = this.length;
      }
      if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
        throw new RangeError("out of range index");
      }
      if (thisStart >= thisEnd && start >= end) {
        return 0;
      }
      if (thisStart >= thisEnd) {
        return -1;
      }
      if (start >= end) {
        return 1;
      }
      start >>>= 0;
      end >>>= 0;
      thisStart >>>= 0;
      thisEnd >>>= 0;
      if (this === target) return 0;
      let x = thisEnd - thisStart;
      let y = end - start;
      const len = Math.min(x, y);
      const thisCopy = this.slice(thisStart, thisEnd);
      const targetCopy = target.slice(start, end);
      for (let i = 0; i < len; ++i) {
        if (thisCopy[i] !== targetCopy[i]) {
          x = thisCopy[i];
          y = targetCopy[i];
          break;
        }
      }
      if (x < y) return -1;
      if (y < x) return 1;
      return 0;
    };
    function bidirectionalIndexOf(buffer, val, byteOffset, encoding, dir) {
      if (buffer.length === 0) return -1;
      if (typeof byteOffset === "string") {
        encoding = byteOffset;
        byteOffset = 0;
      } else if (byteOffset > 2147483647) {
        byteOffset = 2147483647;
      } else if (byteOffset < -2147483648) {
        byteOffset = -2147483648;
      }
      byteOffset = +byteOffset;
      if (numberIsNaN(byteOffset)) {
        byteOffset = dir ? 0 : buffer.length - 1;
      }
      if (byteOffset < 0) byteOffset = buffer.length + byteOffset;
      if (byteOffset >= buffer.length) {
        if (dir) return -1;
        else byteOffset = buffer.length - 1;
      } else if (byteOffset < 0) {
        if (dir) byteOffset = 0;
        else return -1;
      }
      if (typeof val === "string") {
        val = Buffer3.from(val, encoding);
      }
      if (Buffer3.isBuffer(val)) {
        if (val.length === 0) {
          return -1;
        }
        return arrayIndexOf(buffer, val, byteOffset, encoding, dir);
      } else if (typeof val === "number") {
        val = val & 255;
        if (typeof Uint8Array.prototype.indexOf === "function") {
          if (dir) {
            return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset);
          } else {
            return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset);
          }
        }
        return arrayIndexOf(buffer, [val], byteOffset, encoding, dir);
      }
      throw new TypeError("val must be string, number or Buffer");
    }
    function arrayIndexOf(arr, val, byteOffset, encoding, dir) {
      let indexSize = 1;
      let arrLength = arr.length;
      let valLength = val.length;
      if (encoding !== void 0) {
        encoding = String(encoding).toLowerCase();
        if (encoding === "ucs2" || encoding === "ucs-2" || encoding === "utf16le" || encoding === "utf-16le") {
          if (arr.length < 2 || val.length < 2) {
            return -1;
          }
          indexSize = 2;
          arrLength /= 2;
          valLength /= 2;
          byteOffset /= 2;
        }
      }
      function read(buf, i2) {
        if (indexSize === 1) {
          return buf[i2];
        } else {
          return buf.readUInt16BE(i2 * indexSize);
        }
      }
      let i;
      if (dir) {
        let foundIndex = -1;
        for (i = byteOffset; i < arrLength; i++) {
          if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
            if (foundIndex === -1) foundIndex = i;
            if (i - foundIndex + 1 === valLength) return foundIndex * indexSize;
          } else {
            if (foundIndex !== -1) i -= i - foundIndex;
            foundIndex = -1;
          }
        }
      } else {
        if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
        for (i = byteOffset; i >= 0; i--) {
          let found = true;
          for (let j = 0; j < valLength; j++) {
            if (read(arr, i + j) !== read(val, j)) {
              found = false;
              break;
            }
          }
          if (found) return i;
        }
      }
      return -1;
    }
    Buffer3.prototype.includes = function includes(val, byteOffset, encoding) {
      return this.indexOf(val, byteOffset, encoding) !== -1;
    };
    Buffer3.prototype.indexOf = function indexOf(val, byteOffset, encoding) {
      return bidirectionalIndexOf(this, val, byteOffset, encoding, true);
    };
    Buffer3.prototype.lastIndexOf = function lastIndexOf(val, byteOffset, encoding) {
      return bidirectionalIndexOf(this, val, byteOffset, encoding, false);
    };
    function hexWrite(buf, string, offset, length) {
      offset = Number(offset) || 0;
      const remaining = buf.length - offset;
      if (!length) {
        length = remaining;
      } else {
        length = Number(length);
        if (length > remaining) {
          length = remaining;
        }
      }
      const strLen = string.length;
      if (length > strLen / 2) {
        length = strLen / 2;
      }
      let i;
      for (i = 0; i < length; ++i) {
        const parsed = parseInt(string.substr(i * 2, 2), 16);
        if (numberIsNaN(parsed)) return i;
        buf[offset + i] = parsed;
      }
      return i;
    }
    function utf8Write(buf, string, offset, length) {
      return blitBuffer(utf8ToBytes2(string, buf.length - offset), buf, offset, length);
    }
    function asciiWrite(buf, string, offset, length) {
      return blitBuffer(asciiToBytes(string), buf, offset, length);
    }
    function base64Write(buf, string, offset, length) {
      return blitBuffer(base64ToBytes(string), buf, offset, length);
    }
    function ucs2Write(buf, string, offset, length) {
      return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length);
    }
    Buffer3.prototype.write = function write(string, offset, length, encoding) {
      if (offset === void 0) {
        encoding = "utf8";
        length = this.length;
        offset = 0;
      } else if (length === void 0 && typeof offset === "string") {
        encoding = offset;
        length = this.length;
        offset = 0;
      } else if (isFinite(offset)) {
        offset = offset >>> 0;
        if (isFinite(length)) {
          length = length >>> 0;
          if (encoding === void 0) encoding = "utf8";
        } else {
          encoding = length;
          length = void 0;
        }
      } else {
        throw new Error(
          "Buffer.write(string, encoding, offset[, length]) is no longer supported"
        );
      }
      const remaining = this.length - offset;
      if (length === void 0 || length > remaining) length = remaining;
      if (string.length > 0 && (length < 0 || offset < 0) || offset > this.length) {
        throw new RangeError("Attempt to write outside buffer bounds");
      }
      if (!encoding) encoding = "utf8";
      let loweredCase = false;
      for (; ; ) {
        switch (encoding) {
          case "hex":
            return hexWrite(this, string, offset, length);
          case "utf8":
          case "utf-8":
            return utf8Write(this, string, offset, length);
          case "ascii":
          case "latin1":
          case "binary":
            return asciiWrite(this, string, offset, length);
          case "base64":
            return base64Write(this, string, offset, length);
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return ucs2Write(this, string, offset, length);
          default:
            if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
            encoding = ("" + encoding).toLowerCase();
            loweredCase = true;
        }
      }
    };
    Buffer3.prototype.toJSON = function toJSON() {
      return {
        type: "Buffer",
        data: Array.prototype.slice.call(this._arr || this, 0)
      };
    };
    function base64Slice(buf, start, end) {
      if (start === 0 && end === buf.length) {
        return base64.fromByteArray(buf);
      } else {
        return base64.fromByteArray(buf.slice(start, end));
      }
    }
    function utf8Slice(buf, start, end) {
      end = Math.min(buf.length, end);
      const res = [];
      let i = start;
      while (i < end) {
        const firstByte = buf[i];
        let codePoint = null;
        let bytesPerSequence = firstByte > 239 ? 4 : firstByte > 223 ? 3 : firstByte > 191 ? 2 : 1;
        if (i + bytesPerSequence <= end) {
          let secondByte, thirdByte, fourthByte, tempCodePoint;
          switch (bytesPerSequence) {
            case 1:
              if (firstByte < 128) {
                codePoint = firstByte;
              }
              break;
            case 2:
              secondByte = buf[i + 1];
              if ((secondByte & 192) === 128) {
                tempCodePoint = (firstByte & 31) << 6 | secondByte & 63;
                if (tempCodePoint > 127) {
                  codePoint = tempCodePoint;
                }
              }
              break;
            case 3:
              secondByte = buf[i + 1];
              thirdByte = buf[i + 2];
              if ((secondByte & 192) === 128 && (thirdByte & 192) === 128) {
                tempCodePoint = (firstByte & 15) << 12 | (secondByte & 63) << 6 | thirdByte & 63;
                if (tempCodePoint > 2047 && (tempCodePoint < 55296 || tempCodePoint > 57343)) {
                  codePoint = tempCodePoint;
                }
              }
              break;
            case 4:
              secondByte = buf[i + 1];
              thirdByte = buf[i + 2];
              fourthByte = buf[i + 3];
              if ((secondByte & 192) === 128 && (thirdByte & 192) === 128 && (fourthByte & 192) === 128) {
                tempCodePoint = (firstByte & 15) << 18 | (secondByte & 63) << 12 | (thirdByte & 63) << 6 | fourthByte & 63;
                if (tempCodePoint > 65535 && tempCodePoint < 1114112) {
                  codePoint = tempCodePoint;
                }
              }
          }
        }
        if (codePoint === null) {
          codePoint = 65533;
          bytesPerSequence = 1;
        } else if (codePoint > 65535) {
          codePoint -= 65536;
          res.push(codePoint >>> 10 & 1023 | 55296);
          codePoint = 56320 | codePoint & 1023;
        }
        res.push(codePoint);
        i += bytesPerSequence;
      }
      return decodeCodePointsArray(res);
    }
    var MAX_ARGUMENTS_LENGTH = 4096;
    function decodeCodePointsArray(codePoints) {
      const len = codePoints.length;
      if (len <= MAX_ARGUMENTS_LENGTH) {
        return String.fromCharCode.apply(String, codePoints);
      }
      let res = "";
      let i = 0;
      while (i < len) {
        res += String.fromCharCode.apply(
          String,
          codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
        );
      }
      return res;
    }
    function asciiSlice(buf, start, end) {
      let ret = "";
      end = Math.min(buf.length, end);
      for (let i = start; i < end; ++i) {
        ret += String.fromCharCode(buf[i] & 127);
      }
      return ret;
    }
    function latin1Slice(buf, start, end) {
      let ret = "";
      end = Math.min(buf.length, end);
      for (let i = start; i < end; ++i) {
        ret += String.fromCharCode(buf[i]);
      }
      return ret;
    }
    function hexSlice(buf, start, end) {
      const len = buf.length;
      if (!start || start < 0) start = 0;
      if (!end || end < 0 || end > len) end = len;
      let out = "";
      for (let i = start; i < end; ++i) {
        out += hexSliceLookupTable[buf[i]];
      }
      return out;
    }
    function utf16leSlice(buf, start, end) {
      const bytes = buf.slice(start, end);
      let res = "";
      for (let i = 0; i < bytes.length - 1; i += 2) {
        res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256);
      }
      return res;
    }
    Buffer3.prototype.slice = function slice(start, end) {
      const len = this.length;
      start = ~~start;
      end = end === void 0 ? len : ~~end;
      if (start < 0) {
        start += len;
        if (start < 0) start = 0;
      } else if (start > len) {
        start = len;
      }
      if (end < 0) {
        end += len;
        if (end < 0) end = 0;
      } else if (end > len) {
        end = len;
      }
      if (end < start) end = start;
      const newBuf = this.subarray(start, end);
      Object.setPrototypeOf(newBuf, Buffer3.prototype);
      return newBuf;
    };
    function checkOffset(offset, ext, length) {
      if (offset % 1 !== 0 || offset < 0) throw new RangeError("offset is not uint");
      if (offset + ext > length) throw new RangeError("Trying to access beyond buffer length");
    }
    Buffer3.prototype.readUintLE = Buffer3.prototype.readUIntLE = function readUIntLE(offset, byteLength2, noAssert) {
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) checkOffset(offset, byteLength2, this.length);
      let val = this[offset];
      let mul = 1;
      let i = 0;
      while (++i < byteLength2 && (mul *= 256)) {
        val += this[offset + i] * mul;
      }
      return val;
    };
    Buffer3.prototype.readUintBE = Buffer3.prototype.readUIntBE = function readUIntBE(offset, byteLength2, noAssert) {
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) {
        checkOffset(offset, byteLength2, this.length);
      }
      let val = this[offset + --byteLength2];
      let mul = 1;
      while (byteLength2 > 0 && (mul *= 256)) {
        val += this[offset + --byteLength2] * mul;
      }
      return val;
    };
    Buffer3.prototype.readUint8 = Buffer3.prototype.readUInt8 = function readUInt8(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 1, this.length);
      return this[offset];
    };
    Buffer3.prototype.readUint16LE = Buffer3.prototype.readUInt16LE = function readUInt16LE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 2, this.length);
      return this[offset] | this[offset + 1] << 8;
    };
    Buffer3.prototype.readUint16BE = Buffer3.prototype.readUInt16BE = function readUInt16BE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 2, this.length);
      return this[offset] << 8 | this[offset + 1];
    };
    Buffer3.prototype.readUint32LE = Buffer3.prototype.readUInt32LE = function readUInt32LE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return (this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16) + this[offset + 3] * 16777216;
    };
    Buffer3.prototype.readUint32BE = Buffer3.prototype.readUInt32BE = function readUInt32BE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return this[offset] * 16777216 + (this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3]);
    };
    Buffer3.prototype.readBigUInt64LE = defineBigIntMethod(function readBigUInt64LE(offset) {
      offset = offset >>> 0;
      validateNumber(offset, "offset");
      const first = this[offset];
      const last = this[offset + 7];
      if (first === void 0 || last === void 0) {
        boundsError(offset, this.length - 8);
      }
      const lo = first + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 24;
      const hi = this[++offset] + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + last * 2 ** 24;
      return BigInt(lo) + (BigInt(hi) << BigInt(32));
    });
    Buffer3.prototype.readBigUInt64BE = defineBigIntMethod(function readBigUInt64BE(offset) {
      offset = offset >>> 0;
      validateNumber(offset, "offset");
      const first = this[offset];
      const last = this[offset + 7];
      if (first === void 0 || last === void 0) {
        boundsError(offset, this.length - 8);
      }
      const hi = first * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + this[++offset];
      const lo = this[++offset] * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + last;
      return (BigInt(hi) << BigInt(32)) + BigInt(lo);
    });
    Buffer3.prototype.readIntLE = function readIntLE(offset, byteLength2, noAssert) {
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) checkOffset(offset, byteLength2, this.length);
      let val = this[offset];
      let mul = 1;
      let i = 0;
      while (++i < byteLength2 && (mul *= 256)) {
        val += this[offset + i] * mul;
      }
      mul *= 128;
      if (val >= mul) val -= Math.pow(2, 8 * byteLength2);
      return val;
    };
    Buffer3.prototype.readIntBE = function readIntBE(offset, byteLength2, noAssert) {
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) checkOffset(offset, byteLength2, this.length);
      let i = byteLength2;
      let mul = 1;
      let val = this[offset + --i];
      while (i > 0 && (mul *= 256)) {
        val += this[offset + --i] * mul;
      }
      mul *= 128;
      if (val >= mul) val -= Math.pow(2, 8 * byteLength2);
      return val;
    };
    Buffer3.prototype.readInt8 = function readInt8(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 1, this.length);
      if (!(this[offset] & 128)) return this[offset];
      return (255 - this[offset] + 1) * -1;
    };
    Buffer3.prototype.readInt16LE = function readInt16LE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 2, this.length);
      const val = this[offset] | this[offset + 1] << 8;
      return val & 32768 ? val | 4294901760 : val;
    };
    Buffer3.prototype.readInt16BE = function readInt16BE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 2, this.length);
      const val = this[offset + 1] | this[offset] << 8;
      return val & 32768 ? val | 4294901760 : val;
    };
    Buffer3.prototype.readInt32LE = function readInt32LE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16 | this[offset + 3] << 24;
    };
    Buffer3.prototype.readInt32BE = function readInt32BE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return this[offset] << 24 | this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3];
    };
    Buffer3.prototype.readBigInt64LE = defineBigIntMethod(function readBigInt64LE(offset) {
      offset = offset >>> 0;
      validateNumber(offset, "offset");
      const first = this[offset];
      const last = this[offset + 7];
      if (first === void 0 || last === void 0) {
        boundsError(offset, this.length - 8);
      }
      const val = this[offset + 4] + this[offset + 5] * 2 ** 8 + this[offset + 6] * 2 ** 16 + (last << 24);
      return (BigInt(val) << BigInt(32)) + BigInt(first + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 24);
    });
    Buffer3.prototype.readBigInt64BE = defineBigIntMethod(function readBigInt64BE(offset) {
      offset = offset >>> 0;
      validateNumber(offset, "offset");
      const first = this[offset];
      const last = this[offset + 7];
      if (first === void 0 || last === void 0) {
        boundsError(offset, this.length - 8);
      }
      const val = (first << 24) + // Overflow
      this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + this[++offset];
      return (BigInt(val) << BigInt(32)) + BigInt(this[++offset] * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + last);
    });
    Buffer3.prototype.readFloatLE = function readFloatLE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return ieee754.read(this, offset, true, 23, 4);
    };
    Buffer3.prototype.readFloatBE = function readFloatBE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return ieee754.read(this, offset, false, 23, 4);
    };
    Buffer3.prototype.readDoubleLE = function readDoubleLE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 8, this.length);
      return ieee754.read(this, offset, true, 52, 8);
    };
    Buffer3.prototype.readDoubleBE = function readDoubleBE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 8, this.length);
      return ieee754.read(this, offset, false, 52, 8);
    };
    function checkInt(buf, value, offset, ext, max, min) {
      if (!Buffer3.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance');
      if (value > max || value < min) throw new RangeError('"value" argument is out of bounds');
      if (offset + ext > buf.length) throw new RangeError("Index out of range");
    }
    Buffer3.prototype.writeUintLE = Buffer3.prototype.writeUIntLE = function writeUIntLE(value, offset, byteLength2, noAssert) {
      value = +value;
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) {
        const maxBytes = Math.pow(2, 8 * byteLength2) - 1;
        checkInt(this, value, offset, byteLength2, maxBytes, 0);
      }
      let mul = 1;
      let i = 0;
      this[offset] = value & 255;
      while (++i < byteLength2 && (mul *= 256)) {
        this[offset + i] = value / mul & 255;
      }
      return offset + byteLength2;
    };
    Buffer3.prototype.writeUintBE = Buffer3.prototype.writeUIntBE = function writeUIntBE(value, offset, byteLength2, noAssert) {
      value = +value;
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) {
        const maxBytes = Math.pow(2, 8 * byteLength2) - 1;
        checkInt(this, value, offset, byteLength2, maxBytes, 0);
      }
      let i = byteLength2 - 1;
      let mul = 1;
      this[offset + i] = value & 255;
      while (--i >= 0 && (mul *= 256)) {
        this[offset + i] = value / mul & 255;
      }
      return offset + byteLength2;
    };
    Buffer3.prototype.writeUint8 = Buffer3.prototype.writeUInt8 = function writeUInt8(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 1, 255, 0);
      this[offset] = value & 255;
      return offset + 1;
    };
    Buffer3.prototype.writeUint16LE = Buffer3.prototype.writeUInt16LE = function writeUInt16LE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
      this[offset] = value & 255;
      this[offset + 1] = value >>> 8;
      return offset + 2;
    };
    Buffer3.prototype.writeUint16BE = Buffer3.prototype.writeUInt16BE = function writeUInt16BE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
      this[offset] = value >>> 8;
      this[offset + 1] = value & 255;
      return offset + 2;
    };
    Buffer3.prototype.writeUint32LE = Buffer3.prototype.writeUInt32LE = function writeUInt32LE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
      this[offset + 3] = value >>> 24;
      this[offset + 2] = value >>> 16;
      this[offset + 1] = value >>> 8;
      this[offset] = value & 255;
      return offset + 4;
    };
    Buffer3.prototype.writeUint32BE = Buffer3.prototype.writeUInt32BE = function writeUInt32BE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
      this[offset] = value >>> 24;
      this[offset + 1] = value >>> 16;
      this[offset + 2] = value >>> 8;
      this[offset + 3] = value & 255;
      return offset + 4;
    };
    function wrtBigUInt64LE(buf, value, offset, min, max) {
      checkIntBI(value, min, max, buf, offset, 7);
      let lo = Number(value & BigInt(4294967295));
      buf[offset++] = lo;
      lo = lo >> 8;
      buf[offset++] = lo;
      lo = lo >> 8;
      buf[offset++] = lo;
      lo = lo >> 8;
      buf[offset++] = lo;
      let hi = Number(value >> BigInt(32) & BigInt(4294967295));
      buf[offset++] = hi;
      hi = hi >> 8;
      buf[offset++] = hi;
      hi = hi >> 8;
      buf[offset++] = hi;
      hi = hi >> 8;
      buf[offset++] = hi;
      return offset;
    }
    function wrtBigUInt64BE(buf, value, offset, min, max) {
      checkIntBI(value, min, max, buf, offset, 7);
      let lo = Number(value & BigInt(4294967295));
      buf[offset + 7] = lo;
      lo = lo >> 8;
      buf[offset + 6] = lo;
      lo = lo >> 8;
      buf[offset + 5] = lo;
      lo = lo >> 8;
      buf[offset + 4] = lo;
      let hi = Number(value >> BigInt(32) & BigInt(4294967295));
      buf[offset + 3] = hi;
      hi = hi >> 8;
      buf[offset + 2] = hi;
      hi = hi >> 8;
      buf[offset + 1] = hi;
      hi = hi >> 8;
      buf[offset] = hi;
      return offset + 8;
    }
    Buffer3.prototype.writeBigUInt64LE = defineBigIntMethod(function writeBigUInt64LE(value, offset = 0) {
      return wrtBigUInt64LE(this, value, offset, BigInt(0), BigInt("0xffffffffffffffff"));
    });
    Buffer3.prototype.writeBigUInt64BE = defineBigIntMethod(function writeBigUInt64BE(value, offset = 0) {
      return wrtBigUInt64BE(this, value, offset, BigInt(0), BigInt("0xffffffffffffffff"));
    });
    Buffer3.prototype.writeIntLE = function writeIntLE(value, offset, byteLength2, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) {
        const limit = Math.pow(2, 8 * byteLength2 - 1);
        checkInt(this, value, offset, byteLength2, limit - 1, -limit);
      }
      let i = 0;
      let mul = 1;
      let sub = 0;
      this[offset] = value & 255;
      while (++i < byteLength2 && (mul *= 256)) {
        if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
          sub = 1;
        }
        this[offset + i] = (value / mul >> 0) - sub & 255;
      }
      return offset + byteLength2;
    };
    Buffer3.prototype.writeIntBE = function writeIntBE(value, offset, byteLength2, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) {
        const limit = Math.pow(2, 8 * byteLength2 - 1);
        checkInt(this, value, offset, byteLength2, limit - 1, -limit);
      }
      let i = byteLength2 - 1;
      let mul = 1;
      let sub = 0;
      this[offset + i] = value & 255;
      while (--i >= 0 && (mul *= 256)) {
        if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
          sub = 1;
        }
        this[offset + i] = (value / mul >> 0) - sub & 255;
      }
      return offset + byteLength2;
    };
    Buffer3.prototype.writeInt8 = function writeInt8(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 1, 127, -128);
      if (value < 0) value = 255 + value + 1;
      this[offset] = value & 255;
      return offset + 1;
    };
    Buffer3.prototype.writeInt16LE = function writeInt16LE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
      this[offset] = value & 255;
      this[offset + 1] = value >>> 8;
      return offset + 2;
    };
    Buffer3.prototype.writeInt16BE = function writeInt16BE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
      this[offset] = value >>> 8;
      this[offset + 1] = value & 255;
      return offset + 2;
    };
    Buffer3.prototype.writeInt32LE = function writeInt32LE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
      this[offset] = value & 255;
      this[offset + 1] = value >>> 8;
      this[offset + 2] = value >>> 16;
      this[offset + 3] = value >>> 24;
      return offset + 4;
    };
    Buffer3.prototype.writeInt32BE = function writeInt32BE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
      if (value < 0) value = 4294967295 + value + 1;
      this[offset] = value >>> 24;
      this[offset + 1] = value >>> 16;
      this[offset + 2] = value >>> 8;
      this[offset + 3] = value & 255;
      return offset + 4;
    };
    Buffer3.prototype.writeBigInt64LE = defineBigIntMethod(function writeBigInt64LE(value, offset = 0) {
      return wrtBigUInt64LE(this, value, offset, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
    });
    Buffer3.prototype.writeBigInt64BE = defineBigIntMethod(function writeBigInt64BE(value, offset = 0) {
      return wrtBigUInt64BE(this, value, offset, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
    });
    function checkIEEE754(buf, value, offset, ext, max, min) {
      if (offset + ext > buf.length) throw new RangeError("Index out of range");
      if (offset < 0) throw new RangeError("Index out of range");
    }
    function writeFloat(buf, value, offset, littleEndian, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) {
        checkIEEE754(buf, value, offset, 4, 34028234663852886e22, -34028234663852886e22);
      }
      ieee754.write(buf, value, offset, littleEndian, 23, 4);
      return offset + 4;
    }
    Buffer3.prototype.writeFloatLE = function writeFloatLE(value, offset, noAssert) {
      return writeFloat(this, value, offset, true, noAssert);
    };
    Buffer3.prototype.writeFloatBE = function writeFloatBE(value, offset, noAssert) {
      return writeFloat(this, value, offset, false, noAssert);
    };
    function writeDouble(buf, value, offset, littleEndian, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) {
        checkIEEE754(buf, value, offset, 8, 17976931348623157e292, -17976931348623157e292);
      }
      ieee754.write(buf, value, offset, littleEndian, 52, 8);
      return offset + 8;
    }
    Buffer3.prototype.writeDoubleLE = function writeDoubleLE(value, offset, noAssert) {
      return writeDouble(this, value, offset, true, noAssert);
    };
    Buffer3.prototype.writeDoubleBE = function writeDoubleBE(value, offset, noAssert) {
      return writeDouble(this, value, offset, false, noAssert);
    };
    Buffer3.prototype.copy = function copy(target, targetStart, start, end) {
      if (!Buffer3.isBuffer(target)) throw new TypeError("argument should be a Buffer");
      if (!start) start = 0;
      if (!end && end !== 0) end = this.length;
      if (targetStart >= target.length) targetStart = target.length;
      if (!targetStart) targetStart = 0;
      if (end > 0 && end < start) end = start;
      if (end === start) return 0;
      if (target.length === 0 || this.length === 0) return 0;
      if (targetStart < 0) {
        throw new RangeError("targetStart out of bounds");
      }
      if (start < 0 || start >= this.length) throw new RangeError("Index out of range");
      if (end < 0) throw new RangeError("sourceEnd out of bounds");
      if (end > this.length) end = this.length;
      if (target.length - targetStart < end - start) {
        end = target.length - targetStart + start;
      }
      const len = end - start;
      if (this === target && typeof Uint8Array.prototype.copyWithin === "function") {
        this.copyWithin(targetStart, start, end);
      } else {
        Uint8Array.prototype.set.call(
          target,
          this.subarray(start, end),
          targetStart
        );
      }
      return len;
    };
    Buffer3.prototype.fill = function fill(val, start, end, encoding) {
      if (typeof val === "string") {
        if (typeof start === "string") {
          encoding = start;
          start = 0;
          end = this.length;
        } else if (typeof end === "string") {
          encoding = end;
          end = this.length;
        }
        if (encoding !== void 0 && typeof encoding !== "string") {
          throw new TypeError("encoding must be a string");
        }
        if (typeof encoding === "string" && !Buffer3.isEncoding(encoding)) {
          throw new TypeError("Unknown encoding: " + encoding);
        }
        if (val.length === 1) {
          const code = val.charCodeAt(0);
          if (encoding === "utf8" && code < 128 || encoding === "latin1") {
            val = code;
          }
        }
      } else if (typeof val === "number") {
        val = val & 255;
      } else if (typeof val === "boolean") {
        val = Number(val);
      }
      if (start < 0 || this.length < start || this.length < end) {
        throw new RangeError("Out of range index");
      }
      if (end <= start) {
        return this;
      }
      start = start >>> 0;
      end = end === void 0 ? this.length : end >>> 0;
      if (!val) val = 0;
      let i;
      if (typeof val === "number") {
        for (i = start; i < end; ++i) {
          this[i] = val;
        }
      } else {
        const bytes = Buffer3.isBuffer(val) ? val : Buffer3.from(val, encoding);
        const len = bytes.length;
        if (len === 0) {
          throw new TypeError('The value "' + val + '" is invalid for argument "value"');
        }
        for (i = 0; i < end - start; ++i) {
          this[i + start] = bytes[i % len];
        }
      }
      return this;
    };
    var errors = {};
    function E(sym, getMessage, Base) {
      errors[sym] = class NodeError extends Base {
        constructor() {
          super();
          Object.defineProperty(this, "message", {
            value: getMessage.apply(this, arguments),
            writable: true,
            configurable: true
          });
          this.name = `${this.name} [${sym}]`;
          this.stack;
          delete this.name;
        }
        get code() {
          return sym;
        }
        set code(value) {
          Object.defineProperty(this, "code", {
            configurable: true,
            enumerable: true,
            value,
            writable: true
          });
        }
        toString() {
          return `${this.name} [${sym}]: ${this.message}`;
        }
      };
    }
    E(
      "ERR_BUFFER_OUT_OF_BOUNDS",
      function(name) {
        if (name) {
          return `${name} is outside of buffer bounds`;
        }
        return "Attempt to access memory outside buffer bounds";
      },
      RangeError
    );
    E(
      "ERR_INVALID_ARG_TYPE",
      function(name, actual) {
        return `The "${name}" argument must be of type number. Received type ${typeof actual}`;
      },
      TypeError
    );
    E(
      "ERR_OUT_OF_RANGE",
      function(str, range, input) {
        let msg = `The value of "${str}" is out of range.`;
        let received = input;
        if (Number.isInteger(input) && Math.abs(input) > 2 ** 32) {
          received = addNumericalSeparator(String(input));
        } else if (typeof input === "bigint") {
          received = String(input);
          if (input > BigInt(2) ** BigInt(32) || input < -(BigInt(2) ** BigInt(32))) {
            received = addNumericalSeparator(received);
          }
          received += "n";
        }
        msg += ` It must be ${range}. Received ${received}`;
        return msg;
      },
      RangeError
    );
    function addNumericalSeparator(val) {
      let res = "";
      let i = val.length;
      const start = val[0] === "-" ? 1 : 0;
      for (; i >= start + 4; i -= 3) {
        res = `_${val.slice(i - 3, i)}${res}`;
      }
      return `${val.slice(0, i)}${res}`;
    }
    function checkBounds(buf, offset, byteLength2) {
      validateNumber(offset, "offset");
      if (buf[offset] === void 0 || buf[offset + byteLength2] === void 0) {
        boundsError(offset, buf.length - (byteLength2 + 1));
      }
    }
    function checkIntBI(value, min, max, buf, offset, byteLength2) {
      if (value > max || value < min) {
        const n = typeof min === "bigint" ? "n" : "";
        let range;
        if (byteLength2 > 3) {
          if (min === 0 || min === BigInt(0)) {
            range = `>= 0${n} and < 2${n} ** ${(byteLength2 + 1) * 8}${n}`;
          } else {
            range = `>= -(2${n} ** ${(byteLength2 + 1) * 8 - 1}${n}) and < 2 ** ${(byteLength2 + 1) * 8 - 1}${n}`;
          }
        } else {
          range = `>= ${min}${n} and <= ${max}${n}`;
        }
        throw new errors.ERR_OUT_OF_RANGE("value", range, value);
      }
      checkBounds(buf, offset, byteLength2);
    }
    function validateNumber(value, name) {
      if (typeof value !== "number") {
        throw new errors.ERR_INVALID_ARG_TYPE(name, "number", value);
      }
    }
    function boundsError(value, length, type) {
      if (Math.floor(value) !== value) {
        validateNumber(value, type);
        throw new errors.ERR_OUT_OF_RANGE(type || "offset", "an integer", value);
      }
      if (length < 0) {
        throw new errors.ERR_BUFFER_OUT_OF_BOUNDS();
      }
      throw new errors.ERR_OUT_OF_RANGE(
        type || "offset",
        `>= ${type ? 1 : 0} and <= ${length}`,
        value
      );
    }
    var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g;
    function base64clean(str) {
      str = str.split("=")[0];
      str = str.trim().replace(INVALID_BASE64_RE, "");
      if (str.length < 2) return "";
      while (str.length % 4 !== 0) {
        str = str + "=";
      }
      return str;
    }
    function utf8ToBytes2(string, units) {
      units = units || Infinity;
      let codePoint;
      const length = string.length;
      let leadSurrogate = null;
      const bytes = [];
      for (let i = 0; i < length; ++i) {
        codePoint = string.charCodeAt(i);
        if (codePoint > 55295 && codePoint < 57344) {
          if (!leadSurrogate) {
            if (codePoint > 56319) {
              if ((units -= 3) > -1) bytes.push(239, 191, 189);
              continue;
            } else if (i + 1 === length) {
              if ((units -= 3) > -1) bytes.push(239, 191, 189);
              continue;
            }
            leadSurrogate = codePoint;
            continue;
          }
          if (codePoint < 56320) {
            if ((units -= 3) > -1) bytes.push(239, 191, 189);
            leadSurrogate = codePoint;
            continue;
          }
          codePoint = (leadSurrogate - 55296 << 10 | codePoint - 56320) + 65536;
        } else if (leadSurrogate) {
          if ((units -= 3) > -1) bytes.push(239, 191, 189);
        }
        leadSurrogate = null;
        if (codePoint < 128) {
          if ((units -= 1) < 0) break;
          bytes.push(codePoint);
        } else if (codePoint < 2048) {
          if ((units -= 2) < 0) break;
          bytes.push(
            codePoint >> 6 | 192,
            codePoint & 63 | 128
          );
        } else if (codePoint < 65536) {
          if ((units -= 3) < 0) break;
          bytes.push(
            codePoint >> 12 | 224,
            codePoint >> 6 & 63 | 128,
            codePoint & 63 | 128
          );
        } else if (codePoint < 1114112) {
          if ((units -= 4) < 0) break;
          bytes.push(
            codePoint >> 18 | 240,
            codePoint >> 12 & 63 | 128,
            codePoint >> 6 & 63 | 128,
            codePoint & 63 | 128
          );
        } else {
          throw new Error("Invalid code point");
        }
      }
      return bytes;
    }
    function asciiToBytes(str) {
      const byteArray = [];
      for (let i = 0; i < str.length; ++i) {
        byteArray.push(str.charCodeAt(i) & 255);
      }
      return byteArray;
    }
    function utf16leToBytes(str, units) {
      let c, hi, lo;
      const byteArray = [];
      for (let i = 0; i < str.length; ++i) {
        if ((units -= 2) < 0) break;
        c = str.charCodeAt(i);
        hi = c >> 8;
        lo = c % 256;
        byteArray.push(lo);
        byteArray.push(hi);
      }
      return byteArray;
    }
    function base64ToBytes(str) {
      return base64.toByteArray(base64clean(str));
    }
    function blitBuffer(src, dst, offset, length) {
      let i;
      for (i = 0; i < length; ++i) {
        if (i + offset >= dst.length || i >= src.length) break;
        dst[i + offset] = src[i];
      }
      return i;
    }
    function isInstance(obj, type) {
      return obj instanceof type || obj != null && obj.constructor != null && obj.constructor.name != null && obj.constructor.name === type.name;
    }
    function numberIsNaN(obj) {
      return obj !== obj;
    }
    var hexSliceLookupTable = (function() {
      const alphabet = "0123456789abcdef";
      const table = new Array(256);
      for (let i = 0; i < 16; ++i) {
        const i16 = i * 16;
        for (let j = 0; j < 16; ++j) {
          table[i16 + j] = alphabet[i] + alphabet[j];
        }
      }
      return table;
    })();
    function defineBigIntMethod(fn) {
      return typeof BigInt === "undefined" ? BufferBigIntNotDefined : fn;
    }
    function BufferBigIntNotDefined() {
      throw new Error("BigInt not supported");
    }
  }
});

// scripts/esbuild-buffer-shim.js
var import_buffer;
var init_esbuild_buffer_shim = __esm({
  "scripts/esbuild-buffer-shim.js"() {
    "use strict";
    import_buffer = __toESM(require_buffer(), 1);
  }
});

// src/provers/sccp-ton-source-prover.js
init_esbuild_buffer_shim();

// ../iroha/javascript/iroha_js/dist/sccp.js
init_esbuild_buffer_shim();

// ../iroha/javascript/iroha_js/node_modules/@noble/hashes/esm/blake2b.js
init_esbuild_buffer_shim();

// ../iroha/javascript/iroha_js/node_modules/@noble/hashes/esm/blake2.js
init_esbuild_buffer_shim();

// ../iroha/javascript/iroha_js/node_modules/@noble/hashes/esm/_blake.js
init_esbuild_buffer_shim();

// ../iroha/javascript/iroha_js/node_modules/@noble/hashes/esm/utils.js
init_esbuild_buffer_shim();
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function anumber(n) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error("positive integer expected, got " + n);
}
function abytes(b, ...lengths) {
  if (!isBytes(b))
    throw new Error("Uint8Array expected");
  if (lengths.length > 0 && !lengths.includes(b.length))
    throw new Error("Uint8Array expected of length " + lengths + ", got length=" + b.length);
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput(out, instance) {
  abytes(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error("digestInto() expects output buffer of length at least " + min);
  }
}
function u32(arr) {
  return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
var isLE = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68)();
function byteSwap(word) {
  return word << 24 & 4278190080 | word << 8 & 16711680 | word >>> 8 & 65280 | word >>> 24 & 255;
}
var swap8IfBE = isLE ? (n) => n : (n) => byteSwap(n);
function byteSwap32(arr) {
  for (let i = 0; i < arr.length; i++) {
    arr[i] = byteSwap(arr[i]);
  }
  return arr;
}
var swap32IfBE = isLE ? (u) => u : byteSwap32;
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(str));
}
function toBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  abytes(data);
  return data;
}
var Hash = class {
};
function createHasher(hashCons) {
  const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}
function createOptHasher(hashCons) {
  const hashC = (msg, opts) => hashCons(opts).update(toBytes(msg)).digest();
  const tmp = hashCons({});
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = (opts) => hashCons(opts);
  return hashC;
}

// ../iroha/javascript/iroha_js/node_modules/@noble/hashes/esm/_blake.js
var BSIGMA = /* @__PURE__ */ Uint8Array.from([
  0,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  14,
  10,
  4,
  8,
  9,
  15,
  13,
  6,
  1,
  12,
  0,
  2,
  11,
  7,
  5,
  3,
  11,
  8,
  12,
  0,
  5,
  2,
  15,
  13,
  10,
  14,
  3,
  6,
  7,
  1,
  9,
  4,
  7,
  9,
  3,
  1,
  13,
  12,
  11,
  14,
  2,
  6,
  5,
  10,
  4,
  0,
  15,
  8,
  9,
  0,
  5,
  7,
  2,
  4,
  10,
  15,
  14,
  1,
  11,
  12,
  6,
  8,
  3,
  13,
  2,
  12,
  6,
  10,
  0,
  11,
  8,
  3,
  4,
  13,
  7,
  5,
  15,
  14,
  1,
  9,
  12,
  5,
  1,
  15,
  14,
  13,
  4,
  10,
  0,
  7,
  6,
  3,
  9,
  2,
  8,
  11,
  13,
  11,
  7,
  14,
  12,
  1,
  3,
  9,
  5,
  0,
  15,
  4,
  8,
  6,
  2,
  10,
  6,
  15,
  14,
  9,
  11,
  3,
  0,
  8,
  12,
  2,
  13,
  7,
  1,
  4,
  10,
  5,
  10,
  2,
  8,
  4,
  7,
  6,
  1,
  5,
  15,
  11,
  9,
  14,
  3,
  12,
  13,
  0,
  0,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  14,
  10,
  4,
  8,
  9,
  15,
  13,
  6,
  1,
  12,
  0,
  2,
  11,
  7,
  5,
  3,
  // Blake1, unused in others
  11,
  8,
  12,
  0,
  5,
  2,
  15,
  13,
  10,
  14,
  3,
  6,
  7,
  1,
  9,
  4,
  7,
  9,
  3,
  1,
  13,
  12,
  11,
  14,
  2,
  6,
  5,
  10,
  4,
  0,
  15,
  8,
  9,
  0,
  5,
  7,
  2,
  4,
  10,
  15,
  14,
  1,
  11,
  12,
  6,
  8,
  3,
  13,
  2,
  12,
  6,
  10,
  0,
  11,
  8,
  3,
  4,
  13,
  7,
  5,
  15,
  14,
  1,
  9
]);

// ../iroha/javascript/iroha_js/node_modules/@noble/hashes/esm/_md.js
init_esbuild_buffer_shim();
function setBigUint64(view, byteOffset, value, isLE2) {
  if (typeof view.setBigUint64 === "function")
    return view.setBigUint64(byteOffset, value, isLE2);
  const _32n2 = BigInt(32);
  const _u32_max = BigInt(4294967295);
  const wh = Number(value >> _32n2 & _u32_max);
  const wl = Number(value & _u32_max);
  const h = isLE2 ? 4 : 0;
  const l = isLE2 ? 0 : 4;
  view.setUint32(byteOffset + h, wh, isLE2);
  view.setUint32(byteOffset + l, wl, isLE2);
}
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
var HashMD = class extends Hash {
  constructor(blockLen, outputLen, padOffset, isLE2) {
    super();
    this.finished = false;
    this.length = 0;
    this.pos = 0;
    this.destroyed = false;
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE2;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(data) {
    aexists(this);
    data = toBytes(data);
    abytes(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        continue;
      }
      buffer.set(data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
      }
    }
    this.length += data.length;
    this.roundClean();
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE: isLE2 } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    clean(this.buffer.subarray(pos));
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      pos = 0;
    }
    for (let i = pos; i < blockLen; i++)
      buffer[i] = 0;
    setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE2);
    this.process(view, 0);
    const oview = createView(out);
    const len = this.outputLen;
    if (len % 4)
      throw new Error("_sha2: outputLen should be aligned to 32bit");
    const outLen = len / 4;
    const state = this.get();
    if (outLen > state.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let i = 0; i < outLen; i++)
      oview.setUint32(4 * i, state[i], isLE2);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneInto(to) {
    to || (to = new this.constructor());
    to.set(...this.get());
    const { blockLen, buffer, length, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    if (length % blockLen)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
};
var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);

// ../iroha/javascript/iroha_js/node_modules/@noble/hashes/esm/_u64.js
init_esbuild_buffer_shim();
var U32_MASK64 = /* @__PURE__ */ BigInt(2 ** 32 - 1);
var _32n = /* @__PURE__ */ BigInt(32);
function fromBig(n, le = false) {
  if (le)
    return { h: Number(n & U32_MASK64), l: Number(n >> _32n & U32_MASK64) };
  return { h: Number(n >> _32n & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
}
function split(lst, le = false) {
  const len = lst.length;
  let Ah = new Uint32Array(len);
  let Al = new Uint32Array(len);
  for (let i = 0; i < len; i++) {
    const { h, l } = fromBig(lst[i], le);
    [Ah[i], Al[i]] = [h, l];
  }
  return [Ah, Al];
}
var rotrSH = (h, l, s) => h >>> s | l << 32 - s;
var rotrSL = (h, l, s) => h << 32 - s | l >>> s;
var rotrBH = (h, l, s) => h << 64 - s | l >>> s - 32;
var rotrBL = (h, l, s) => h >>> s - 32 | l << 64 - s;
var rotr32H = (_h, l) => l;
var rotr32L = (h, _l) => h;
var rotlSH = (h, l, s) => h << s | l >>> 32 - s;
var rotlSL = (h, l, s) => l << s | h >>> 32 - s;
var rotlBH = (h, l, s) => l << s - 32 | h >>> 64 - s;
var rotlBL = (h, l, s) => h << s - 32 | l >>> 64 - s;
function add(Ah, Al, Bh, Bl) {
  const l = (Al >>> 0) + (Bl >>> 0);
  return { h: Ah + Bh + (l / 2 ** 32 | 0) | 0, l: l | 0 };
}
var add3L = (Al, Bl, Cl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0);
var add3H = (low, Ah, Bh, Ch) => Ah + Bh + Ch + (low / 2 ** 32 | 0) | 0;

// ../iroha/javascript/iroha_js/node_modules/@noble/hashes/esm/blake2.js
var B2B_IV = /* @__PURE__ */ Uint32Array.from([
  4089235720,
  1779033703,
  2227873595,
  3144134277,
  4271175723,
  1013904242,
  1595750129,
  2773480762,
  2917565137,
  1359893119,
  725511199,
  2600822924,
  4215389547,
  528734635,
  327033209,
  1541459225
]);
var BBUF = /* @__PURE__ */ new Uint32Array(32);
function G1b(a, b, c, d, msg, x) {
  const Xl = msg[x], Xh = msg[x + 1];
  let Al = BBUF[2 * a], Ah = BBUF[2 * a + 1];
  let Bl = BBUF[2 * b], Bh = BBUF[2 * b + 1];
  let Cl = BBUF[2 * c], Ch = BBUF[2 * c + 1];
  let Dl = BBUF[2 * d], Dh = BBUF[2 * d + 1];
  let ll = add3L(Al, Bl, Xl);
  Ah = add3H(ll, Ah, Bh, Xh);
  Al = ll | 0;
  ({ Dh, Dl } = { Dh: Dh ^ Ah, Dl: Dl ^ Al });
  ({ Dh, Dl } = { Dh: rotr32H(Dh, Dl), Dl: rotr32L(Dh, Dl) });
  ({ h: Ch, l: Cl } = add(Ch, Cl, Dh, Dl));
  ({ Bh, Bl } = { Bh: Bh ^ Ch, Bl: Bl ^ Cl });
  ({ Bh, Bl } = { Bh: rotrSH(Bh, Bl, 24), Bl: rotrSL(Bh, Bl, 24) });
  BBUF[2 * a] = Al, BBUF[2 * a + 1] = Ah;
  BBUF[2 * b] = Bl, BBUF[2 * b + 1] = Bh;
  BBUF[2 * c] = Cl, BBUF[2 * c + 1] = Ch;
  BBUF[2 * d] = Dl, BBUF[2 * d + 1] = Dh;
}
function G2b(a, b, c, d, msg, x) {
  const Xl = msg[x], Xh = msg[x + 1];
  let Al = BBUF[2 * a], Ah = BBUF[2 * a + 1];
  let Bl = BBUF[2 * b], Bh = BBUF[2 * b + 1];
  let Cl = BBUF[2 * c], Ch = BBUF[2 * c + 1];
  let Dl = BBUF[2 * d], Dh = BBUF[2 * d + 1];
  let ll = add3L(Al, Bl, Xl);
  Ah = add3H(ll, Ah, Bh, Xh);
  Al = ll | 0;
  ({ Dh, Dl } = { Dh: Dh ^ Ah, Dl: Dl ^ Al });
  ({ Dh, Dl } = { Dh: rotrSH(Dh, Dl, 16), Dl: rotrSL(Dh, Dl, 16) });
  ({ h: Ch, l: Cl } = add(Ch, Cl, Dh, Dl));
  ({ Bh, Bl } = { Bh: Bh ^ Ch, Bl: Bl ^ Cl });
  ({ Bh, Bl } = { Bh: rotrBH(Bh, Bl, 63), Bl: rotrBL(Bh, Bl, 63) });
  BBUF[2 * a] = Al, BBUF[2 * a + 1] = Ah;
  BBUF[2 * b] = Bl, BBUF[2 * b + 1] = Bh;
  BBUF[2 * c] = Cl, BBUF[2 * c + 1] = Ch;
  BBUF[2 * d] = Dl, BBUF[2 * d + 1] = Dh;
}
function checkBlake2Opts(outputLen, opts = {}, keyLen, saltLen, persLen) {
  anumber(keyLen);
  if (outputLen < 0 || outputLen > keyLen)
    throw new Error("outputLen bigger than keyLen");
  const { key, salt, personalization } = opts;
  if (key !== void 0 && (key.length < 1 || key.length > keyLen))
    throw new Error("key length must be undefined or 1.." + keyLen);
  if (salt !== void 0 && salt.length !== saltLen)
    throw new Error("salt must be undefined or " + saltLen);
  if (personalization !== void 0 && personalization.length !== persLen)
    throw new Error("personalization must be undefined or " + persLen);
}
var BLAKE2 = class extends Hash {
  constructor(blockLen, outputLen) {
    super();
    this.finished = false;
    this.destroyed = false;
    this.length = 0;
    this.pos = 0;
    anumber(blockLen);
    anumber(outputLen);
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.buffer = new Uint8Array(blockLen);
    this.buffer32 = u32(this.buffer);
  }
  update(data) {
    aexists(this);
    data = toBytes(data);
    abytes(data);
    const { blockLen, buffer, buffer32 } = this;
    const len = data.length;
    const offset = data.byteOffset;
    const buf = data.buffer;
    for (let pos = 0; pos < len; ) {
      if (this.pos === blockLen) {
        swap32IfBE(buffer32);
        this.compress(buffer32, 0, false);
        swap32IfBE(buffer32);
        this.pos = 0;
      }
      const take = Math.min(blockLen - this.pos, len - pos);
      const dataOffset = offset + pos;
      if (take === blockLen && !(dataOffset % 4) && pos + take < len) {
        const data32 = new Uint32Array(buf, dataOffset, Math.floor((len - pos) / 4));
        swap32IfBE(data32);
        for (let pos32 = 0; pos + blockLen < len; pos32 += buffer32.length, pos += blockLen) {
          this.length += blockLen;
          this.compress(data32, pos32, false);
        }
        swap32IfBE(data32);
        continue;
      }
      buffer.set(data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      this.length += take;
      pos += take;
    }
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    const { pos, buffer32 } = this;
    this.finished = true;
    clean(this.buffer.subarray(pos));
    swap32IfBE(buffer32);
    this.compress(buffer32, 0, true);
    swap32IfBE(buffer32);
    const out32 = u32(out);
    this.get().forEach((v, i) => out32[i] = swap8IfBE(v));
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneInto(to) {
    const { buffer, length, finished, destroyed, outputLen, pos } = this;
    to || (to = new this.constructor({ dkLen: outputLen }));
    to.set(...this.get());
    to.buffer.set(buffer);
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    to.outputLen = outputLen;
    return to;
  }
  clone() {
    return this._cloneInto();
  }
};
var BLAKE2b = class extends BLAKE2 {
  constructor(opts = {}) {
    const olen = opts.dkLen === void 0 ? 64 : opts.dkLen;
    super(128, olen);
    this.v0l = B2B_IV[0] | 0;
    this.v0h = B2B_IV[1] | 0;
    this.v1l = B2B_IV[2] | 0;
    this.v1h = B2B_IV[3] | 0;
    this.v2l = B2B_IV[4] | 0;
    this.v2h = B2B_IV[5] | 0;
    this.v3l = B2B_IV[6] | 0;
    this.v3h = B2B_IV[7] | 0;
    this.v4l = B2B_IV[8] | 0;
    this.v4h = B2B_IV[9] | 0;
    this.v5l = B2B_IV[10] | 0;
    this.v5h = B2B_IV[11] | 0;
    this.v6l = B2B_IV[12] | 0;
    this.v6h = B2B_IV[13] | 0;
    this.v7l = B2B_IV[14] | 0;
    this.v7h = B2B_IV[15] | 0;
    checkBlake2Opts(olen, opts, 64, 16, 16);
    let { key, personalization, salt } = opts;
    let keyLength = 0;
    if (key !== void 0) {
      key = toBytes(key);
      keyLength = key.length;
    }
    this.v0l ^= this.outputLen | keyLength << 8 | 1 << 16 | 1 << 24;
    if (salt !== void 0) {
      salt = toBytes(salt);
      const slt = u32(salt);
      this.v4l ^= swap8IfBE(slt[0]);
      this.v4h ^= swap8IfBE(slt[1]);
      this.v5l ^= swap8IfBE(slt[2]);
      this.v5h ^= swap8IfBE(slt[3]);
    }
    if (personalization !== void 0) {
      personalization = toBytes(personalization);
      const pers = u32(personalization);
      this.v6l ^= swap8IfBE(pers[0]);
      this.v6h ^= swap8IfBE(pers[1]);
      this.v7l ^= swap8IfBE(pers[2]);
      this.v7h ^= swap8IfBE(pers[3]);
    }
    if (key !== void 0) {
      const tmp = new Uint8Array(this.blockLen);
      tmp.set(key);
      this.update(tmp);
    }
  }
  // prettier-ignore
  get() {
    let { v0l, v0h, v1l, v1h, v2l, v2h, v3l, v3h, v4l, v4h, v5l, v5h, v6l, v6h, v7l, v7h } = this;
    return [v0l, v0h, v1l, v1h, v2l, v2h, v3l, v3h, v4l, v4h, v5l, v5h, v6l, v6h, v7l, v7h];
  }
  // prettier-ignore
  set(v0l, v0h, v1l, v1h, v2l, v2h, v3l, v3h, v4l, v4h, v5l, v5h, v6l, v6h, v7l, v7h) {
    this.v0l = v0l | 0;
    this.v0h = v0h | 0;
    this.v1l = v1l | 0;
    this.v1h = v1h | 0;
    this.v2l = v2l | 0;
    this.v2h = v2h | 0;
    this.v3l = v3l | 0;
    this.v3h = v3h | 0;
    this.v4l = v4l | 0;
    this.v4h = v4h | 0;
    this.v5l = v5l | 0;
    this.v5h = v5h | 0;
    this.v6l = v6l | 0;
    this.v6h = v6h | 0;
    this.v7l = v7l | 0;
    this.v7h = v7h | 0;
  }
  compress(msg, offset, isLast) {
    this.get().forEach((v, i) => BBUF[i] = v);
    BBUF.set(B2B_IV, 16);
    let { h, l } = fromBig(BigInt(this.length));
    BBUF[24] = B2B_IV[8] ^ l;
    BBUF[25] = B2B_IV[9] ^ h;
    if (isLast) {
      BBUF[28] = ~BBUF[28];
      BBUF[29] = ~BBUF[29];
    }
    let j = 0;
    const s = BSIGMA;
    for (let i = 0; i < 12; i++) {
      G1b(0, 4, 8, 12, msg, offset + 2 * s[j++]);
      G2b(0, 4, 8, 12, msg, offset + 2 * s[j++]);
      G1b(1, 5, 9, 13, msg, offset + 2 * s[j++]);
      G2b(1, 5, 9, 13, msg, offset + 2 * s[j++]);
      G1b(2, 6, 10, 14, msg, offset + 2 * s[j++]);
      G2b(2, 6, 10, 14, msg, offset + 2 * s[j++]);
      G1b(3, 7, 11, 15, msg, offset + 2 * s[j++]);
      G2b(3, 7, 11, 15, msg, offset + 2 * s[j++]);
      G1b(0, 5, 10, 15, msg, offset + 2 * s[j++]);
      G2b(0, 5, 10, 15, msg, offset + 2 * s[j++]);
      G1b(1, 6, 11, 12, msg, offset + 2 * s[j++]);
      G2b(1, 6, 11, 12, msg, offset + 2 * s[j++]);
      G1b(2, 7, 8, 13, msg, offset + 2 * s[j++]);
      G2b(2, 7, 8, 13, msg, offset + 2 * s[j++]);
      G1b(3, 4, 9, 14, msg, offset + 2 * s[j++]);
      G2b(3, 4, 9, 14, msg, offset + 2 * s[j++]);
    }
    this.v0l ^= BBUF[0] ^ BBUF[16];
    this.v0h ^= BBUF[1] ^ BBUF[17];
    this.v1l ^= BBUF[2] ^ BBUF[18];
    this.v1h ^= BBUF[3] ^ BBUF[19];
    this.v2l ^= BBUF[4] ^ BBUF[20];
    this.v2h ^= BBUF[5] ^ BBUF[21];
    this.v3l ^= BBUF[6] ^ BBUF[22];
    this.v3h ^= BBUF[7] ^ BBUF[23];
    this.v4l ^= BBUF[8] ^ BBUF[24];
    this.v4h ^= BBUF[9] ^ BBUF[25];
    this.v5l ^= BBUF[10] ^ BBUF[26];
    this.v5h ^= BBUF[11] ^ BBUF[27];
    this.v6l ^= BBUF[12] ^ BBUF[28];
    this.v6h ^= BBUF[13] ^ BBUF[29];
    this.v7l ^= BBUF[14] ^ BBUF[30];
    this.v7h ^= BBUF[15] ^ BBUF[31];
    clean(BBUF);
  }
  destroy() {
    this.destroyed = true;
    clean(this.buffer32);
    this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }
};
var blake2b = /* @__PURE__ */ createOptHasher((opts) => new BLAKE2b(opts));

// ../iroha/javascript/iroha_js/node_modules/@noble/hashes/esm/blake2b.js
var blake2b2 = blake2b;

// ../iroha/javascript/iroha_js/node_modules/@noble/hashes/esm/sha2.js
init_esbuild_buffer_shim();
var SHA256_K = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
var SHA256 = class extends HashMD {
  constructor(outputLen = 32) {
    super(64, outputLen, 8, false);
    this.A = SHA256_IV[0] | 0;
    this.B = SHA256_IV[1] | 0;
    this.C = SHA256_IV[2] | 0;
    this.D = SHA256_IV[3] | 0;
    this.E = SHA256_IV[4] | 0;
    this.F = SHA256_IV[5] | 0;
    this.G = SHA256_IV[6] | 0;
    this.H = SHA256_IV[7] | 0;
  }
  get() {
    const { A, B, C, D, E, F, G, H } = this;
    return [A, B, C, D, E, F, G, H];
  }
  // prettier-ignore
  set(A, B, C, D, E, F, G, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G | 0;
    this.H = H | 0;
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4)
      SHA256_W[i] = view.getUint32(offset, false);
    for (let i = 16; i < 64; i++) {
      const W15 = SHA256_W[i - 15];
      const W2 = SHA256_W[i - 2];
      const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
      const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
      SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
    }
    let { A, B, C, D, E, F, G, H } = this;
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B, C) | 0;
      H = G;
      G = F;
      F = E;
      E = D + T1 | 0;
      D = C;
      C = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G = G + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C, D, E, F, G, H);
  }
  roundClean() {
    clean(SHA256_W);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    clean(this.buffer);
  }
};
var sha256 = /* @__PURE__ */ createHasher(() => new SHA256());

// ../iroha/javascript/iroha_js/node_modules/@noble/hashes/esm/sha256.js
init_esbuild_buffer_shim();
var sha2562 = sha256;

// ../iroha/javascript/iroha_js/node_modules/@noble/hashes/esm/sha3.js
init_esbuild_buffer_shim();
var _0n = BigInt(0);
var _1n = BigInt(1);
var _2n = BigInt(2);
var _7n = BigInt(7);
var _256n = BigInt(256);
var _0x71n = BigInt(113);
var SHA3_PI = [];
var SHA3_ROTL = [];
var _SHA3_IOTA = [];
for (let round = 0, R = _1n, x = 1, y = 0; round < 24; round++) {
  [x, y] = [y, (2 * x + 3 * y) % 5];
  SHA3_PI.push(2 * (5 * y + x));
  SHA3_ROTL.push((round + 1) * (round + 2) / 2 % 64);
  let t = _0n;
  for (let j = 0; j < 7; j++) {
    R = (R << _1n ^ (R >> _7n) * _0x71n) % _256n;
    if (R & _2n)
      t ^= _1n << (_1n << /* @__PURE__ */ BigInt(j)) - _1n;
  }
  _SHA3_IOTA.push(t);
}
var IOTAS = split(_SHA3_IOTA, true);
var SHA3_IOTA_H = IOTAS[0];
var SHA3_IOTA_L = IOTAS[1];
var rotlH = (h, l, s) => s > 32 ? rotlBH(h, l, s) : rotlSH(h, l, s);
var rotlL = (h, l, s) => s > 32 ? rotlBL(h, l, s) : rotlSL(h, l, s);
function keccakP(s, rounds = 24) {
  const B = new Uint32Array(5 * 2);
  for (let round = 24 - rounds; round < 24; round++) {
    for (let x = 0; x < 10; x++)
      B[x] = s[x] ^ s[x + 10] ^ s[x + 20] ^ s[x + 30] ^ s[x + 40];
    for (let x = 0; x < 10; x += 2) {
      const idx1 = (x + 8) % 10;
      const idx0 = (x + 2) % 10;
      const B0 = B[idx0];
      const B1 = B[idx0 + 1];
      const Th = rotlH(B0, B1, 1) ^ B[idx1];
      const Tl = rotlL(B0, B1, 1) ^ B[idx1 + 1];
      for (let y = 0; y < 50; y += 10) {
        s[x + y] ^= Th;
        s[x + y + 1] ^= Tl;
      }
    }
    let curH = s[2];
    let curL = s[3];
    for (let t = 0; t < 24; t++) {
      const shift = SHA3_ROTL[t];
      const Th = rotlH(curH, curL, shift);
      const Tl = rotlL(curH, curL, shift);
      const PI = SHA3_PI[t];
      curH = s[PI];
      curL = s[PI + 1];
      s[PI] = Th;
      s[PI + 1] = Tl;
    }
    for (let y = 0; y < 50; y += 10) {
      for (let x = 0; x < 10; x++)
        B[x] = s[y + x];
      for (let x = 0; x < 10; x++)
        s[y + x] ^= ~B[(x + 2) % 10] & B[(x + 4) % 10];
    }
    s[0] ^= SHA3_IOTA_H[round];
    s[1] ^= SHA3_IOTA_L[round];
  }
  clean(B);
}
var Keccak = class _Keccak extends Hash {
  // NOTE: we accept arguments in bytes instead of bits here.
  constructor(blockLen, suffix, outputLen, enableXOF = false, rounds = 24) {
    super();
    this.pos = 0;
    this.posOut = 0;
    this.finished = false;
    this.destroyed = false;
    this.enableXOF = false;
    this.blockLen = blockLen;
    this.suffix = suffix;
    this.outputLen = outputLen;
    this.enableXOF = enableXOF;
    this.rounds = rounds;
    anumber(outputLen);
    if (!(0 < blockLen && blockLen < 200))
      throw new Error("only keccak-f1600 function is supported");
    this.state = new Uint8Array(200);
    this.state32 = u32(this.state);
  }
  clone() {
    return this._cloneInto();
  }
  keccak() {
    swap32IfBE(this.state32);
    keccakP(this.state32, this.rounds);
    swap32IfBE(this.state32);
    this.posOut = 0;
    this.pos = 0;
  }
  update(data) {
    aexists(this);
    data = toBytes(data);
    abytes(data);
    const { blockLen, state } = this;
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      for (let i = 0; i < take; i++)
        state[this.pos++] ^= data[pos++];
      if (this.pos === blockLen)
        this.keccak();
    }
    return this;
  }
  finish() {
    if (this.finished)
      return;
    this.finished = true;
    const { state, suffix, pos, blockLen } = this;
    state[pos] ^= suffix;
    if ((suffix & 128) !== 0 && pos === blockLen - 1)
      this.keccak();
    state[blockLen - 1] ^= 128;
    this.keccak();
  }
  writeInto(out) {
    aexists(this, false);
    abytes(out);
    this.finish();
    const bufferOut = this.state;
    const { blockLen } = this;
    for (let pos = 0, len = out.length; pos < len; ) {
      if (this.posOut >= blockLen)
        this.keccak();
      const take = Math.min(blockLen - this.posOut, len - pos);
      out.set(bufferOut.subarray(this.posOut, this.posOut + take), pos);
      this.posOut += take;
      pos += take;
    }
    return out;
  }
  xofInto(out) {
    if (!this.enableXOF)
      throw new Error("XOF is not possible for this instance");
    return this.writeInto(out);
  }
  xof(bytes) {
    anumber(bytes);
    return this.xofInto(new Uint8Array(bytes));
  }
  digestInto(out) {
    aoutput(out, this);
    if (this.finished)
      throw new Error("digest() was already called");
    this.writeInto(out);
    this.destroy();
    return out;
  }
  digest() {
    return this.digestInto(new Uint8Array(this.outputLen));
  }
  destroy() {
    this.destroyed = true;
    clean(this.state);
  }
  _cloneInto(to) {
    const { blockLen, suffix, outputLen, rounds, enableXOF } = this;
    to || (to = new _Keccak(blockLen, suffix, outputLen, enableXOF, rounds));
    to.state32.set(this.state32);
    to.pos = this.pos;
    to.posOut = this.posOut;
    to.finished = this.finished;
    to.rounds = rounds;
    to.suffix = suffix;
    to.outputLen = outputLen;
    to.enableXOF = enableXOF;
    to.destroyed = this.destroyed;
    return to;
  }
};
var gen = (suffix, blockLen, outputLen) => createHasher(() => new Keccak(blockLen, suffix, outputLen));
var keccak_256 = /* @__PURE__ */ (() => gen(1, 136, 256 / 8))();

// ../iroha/javascript/iroha_js/dist/address.js
init_esbuild_buffer_shim();

// ../iroha/javascript/iroha_js/dist/blake2b.js
init_esbuild_buffer_shim();
var UINT64_MASK = (1n << 64n) - 1n;
var BLAKE2B_BLOCK_LEN = 128;
var BLAKE2B_ROUNDS = 12;
var BLAKE2B_IV = Object.freeze([
  0x6A09E667F3BCC908n,
  0xBB67AE8584CAA73Bn,
  0x3C6EF372FE94F82Bn,
  0xA54FF53A5F1D36F1n,
  0x510E527FADE682D1n,
  0x9B05688C2B3E6C1Fn,
  0x1F83D9ABFB41BD6Bn,
  0x5BE0CD19137E2179n
]);
var BLAKE2B_SIGMA = Object.freeze([
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
  [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4],
  [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
  [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13],
  [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
  [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11],
  [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
  [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5],
  [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0],
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3]
]);
function rotr64(value, shift) {
  const rotation = BigInt(shift & 63);
  return (value >> rotation | value << 64n - rotation) & UINT64_MASK;
}
function readUint64Le(bytes, offset) {
  let value = 0n;
  for (let index = 0; index < 8; index += 1) {
    const byte = bytes[offset + index];
    value |= BigInt(byte) << BigInt(index * 8);
  }
  return value & UINT64_MASK;
}
function asUint8Array(value, name) {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  throw new TypeError(`${name ?? "data"} must be an ArrayBuffer or Uint8Array`);
}
function blake2bCompress(state, block, t0, t1, f0) {
  const message = new Array(16);
  for (let index = 0; index < 16; index += 1) {
    message[index] = readUint64Le(block, index * 8);
  }
  const v = new Array(16);
  for (let index = 0; index < 8; index += 1) {
    v[index] = state[index];
    v[index + 8] = BLAKE2B_IV[index];
  }
  v[12] = (v[12] ^ t0) & UINT64_MASK;
  v[13] = (v[13] ^ t1) & UINT64_MASK;
  v[14] = (v[14] ^ f0) & UINT64_MASK;
  function round(a, b, c, d, x, y) {
    v[a] = v[a] + v[b] + x & UINT64_MASK;
    v[d] = rotr64(v[d] ^ v[a], 32);
    v[c] = v[c] + v[d] & UINT64_MASK;
    v[b] = rotr64(v[b] ^ v[c], 24);
    v[a] = v[a] + v[b] + y & UINT64_MASK;
    v[d] = rotr64(v[d] ^ v[a], 16);
    v[c] = v[c] + v[d] & UINT64_MASK;
    v[b] = rotr64(v[b] ^ v[c], 63);
  }
  for (let roundIndex = 0; roundIndex < BLAKE2B_ROUNDS; roundIndex += 1) {
    const schedule = BLAKE2B_SIGMA[roundIndex];
    round(0, 4, 8, 12, message[schedule[0]], message[schedule[1]]);
    round(1, 5, 9, 13, message[schedule[2]], message[schedule[3]]);
    round(2, 6, 10, 14, message[schedule[4]], message[schedule[5]]);
    round(3, 7, 11, 15, message[schedule[6]], message[schedule[7]]);
    round(0, 5, 10, 15, message[schedule[8]], message[schedule[9]]);
    round(1, 6, 11, 12, message[schedule[10]], message[schedule[11]]);
    round(2, 7, 8, 13, message[schedule[12]], message[schedule[13]]);
    round(3, 4, 9, 14, message[schedule[14]], message[schedule[15]]);
  }
  for (let index = 0; index < 8; index += 1) {
    state[index] = (state[index] ^ v[index] ^ v[index + 8]) & UINT64_MASK;
  }
}
function blake2bDigest(data, outputLength, options = {}) {
  if (!Number.isInteger(outputLength) || outputLength < 1 || outputLength > 64) {
    throw new TypeError("outputLength must be an integer between 1 and 64");
  }
  const input = asUint8Array(data, "data");
  const state = BLAKE2B_IV.map((value) => value);
  state[0] ^= 0x01010000n ^ BigInt(outputLength);
  const personalization = options.personalization ? asUint8Array(options.personalization, "personalization") : null;
  if (personalization && personalization.length > 0) {
    const buffer = new Uint8Array(16);
    buffer.set(personalization.subarray(0, Math.min(16, personalization.length)));
    const p0 = readUint64Le(buffer, 0);
    const p1 = readUint64Le(buffer, 8);
    state[6] ^= p0;
    state[7] ^= p1;
  }
  let t0 = 0n;
  let t1 = 0n;
  if (options.includeZeroKeyBlock) {
    const zeroBlock = new Uint8Array(BLAKE2B_BLOCK_LEN);
    t0 = t0 + BigInt(BLAKE2B_BLOCK_LEN) & UINT64_MASK;
    blake2bCompress(state, zeroBlock, t0, t1, 0n);
  }
  const totalLength = input.length;
  const fullBlocks = Math.floor(totalLength / BLAKE2B_BLOCK_LEN);
  let offset = 0;
  for (let blockIndex = 0; blockIndex < fullBlocks; blockIndex += 1) {
    const block = input.subarray(offset, offset + BLAKE2B_BLOCK_LEN);
    offset += BLAKE2B_BLOCK_LEN;
    t0 = t0 + BigInt(BLAKE2B_BLOCK_LEN) & UINT64_MASK;
    if (t0 < BigInt(BLAKE2B_BLOCK_LEN)) {
      t1 = t1 + 1n & UINT64_MASK;
    }
    const lastFullBlock = blockIndex === fullBlocks - 1 && totalLength % BLAKE2B_BLOCK_LEN === 0;
    const flag = lastFullBlock ? UINT64_MASK : 0n;
    blake2bCompress(state, block, t0, t1, flag);
  }
  const remainder = totalLength % BLAKE2B_BLOCK_LEN;
  if (remainder > 0) {
    const lastBlock = new Uint8Array(BLAKE2B_BLOCK_LEN);
    lastBlock.set(input.subarray(offset));
    const add2 = BigInt(remainder);
    t0 = t0 + add2 & UINT64_MASK;
    if (t0 < add2) {
      t1 = t1 + 1n & UINT64_MASK;
    }
    blake2bCompress(state, lastBlock, t0, t1, UINT64_MASK);
  } else if (totalLength === 0) {
    const zeroBlock = new Uint8Array(BLAKE2B_BLOCK_LEN);
    blake2bCompress(state, zeroBlock, 0n, 0n, UINT64_MASK);
  }
  const output = new Uint8Array(outputLength);
  let outIndex = 0;
  for (let index = 0; index < 8 && outIndex < outputLength; index += 1) {
    let word = state[index];
    for (let byteIndex = 0; byteIndex < 8 && outIndex < outputLength; byteIndex += 1) {
      output[outIndex] = Number(word & 0xffn);
      word >>= 8n;
      outIndex += 1;
    }
  }
  return output;
}
function blake2b256(data, options = {}) {
  return blake2bDigest(data, 32, options);
}

// ../iroha/javascript/iroha_js/dist/curveRegistry.js
init_esbuild_buffer_shim();
var CurveFeature = Object.freeze({
  NONE: null,
  ML_DSA: "ml-dsa",
  GOST: "gost",
  SM2: "sm",
  BLS: "bls"
});
var CurveId = Object.freeze({
  ED25519: 1,
  MLDSA: 2,
  BLS_NORMAL: 3,
  SECP256K1: 4,
  BLS_SMALL: 5,
  GOST_256_A: 10,
  GOST_256_B: 11,
  GOST_256_C: 12,
  GOST_512_A: 13,
  GOST_512_B: 14,
  SM2: 15
});
var CURVE_REGISTRY = Object.freeze([
  {
    id: CurveId.ED25519,
    feature: CurveFeature.NONE,
    algorithm: "ed25519",
    aliases: ["ed25519", "ed"],
    publicKeyLength: 32,
    publicKeyMulticodec: 237
  },
  {
    id: CurveId.MLDSA,
    feature: CurveFeature.ML_DSA,
    algorithm: "ml-dsa",
    aliases: ["ml-dsa", "mldsa", "ml_dsa"],
    publicKeyLength: 1952,
    publicKeyMulticodec: 238
  },
  {
    id: CurveId.BLS_NORMAL,
    feature: CurveFeature.BLS,
    algorithm: "bls_normal",
    aliases: ["bls_normal", "bls-normal", "blsnormal"],
    publicKeyLength: 48,
    publicKeyMulticodec: 234
  },
  {
    id: CurveId.SECP256K1,
    feature: CurveFeature.NONE,
    algorithm: "secp256k1",
    aliases: ["secp256k1", "secp-256k1", "secp"],
    publicKeyLength: 33,
    publicKeyMulticodec: 231
  },
  {
    id: CurveId.BLS_SMALL,
    feature: CurveFeature.BLS,
    algorithm: "bls_small",
    aliases: ["bls_small", "bls-small", "blssmall"],
    publicKeyLength: 96,
    publicKeyMulticodec: 235
  },
  {
    id: CurveId.GOST_256_A,
    feature: CurveFeature.GOST,
    algorithm: "gost256a",
    aliases: [
      "gost256a",
      "gost-256-a",
      "gost3410-2012-256-paramset-a"
    ],
    publicKeyLength: 64,
    publicKeyMulticodec: 4608
  },
  {
    id: CurveId.GOST_256_B,
    feature: CurveFeature.GOST,
    algorithm: "gost256b",
    aliases: [
      "gost256b",
      "gost-256-b",
      "gost3410-2012-256-paramset-b"
    ],
    publicKeyLength: 64,
    publicKeyMulticodec: 4609
  },
  {
    id: CurveId.GOST_256_C,
    feature: CurveFeature.GOST,
    algorithm: "gost256c",
    aliases: [
      "gost256c",
      "gost-256-c",
      "gost3410-2012-256-paramset-c"
    ],
    publicKeyLength: 64,
    publicKeyMulticodec: 4610
  },
  {
    id: CurveId.GOST_512_A,
    feature: CurveFeature.GOST,
    algorithm: "gost512a",
    aliases: [
      "gost512a",
      "gost-512-a",
      "gost3410-2012-512-paramset-a"
    ],
    publicKeyLength: 128,
    publicKeyMulticodec: 4611
  },
  {
    id: CurveId.GOST_512_B,
    feature: CurveFeature.GOST,
    algorithm: "gost512b",
    aliases: [
      "gost512b",
      "gost-512-b",
      "gost3410-2012-512-paramset-b"
    ],
    publicKeyLength: 128,
    publicKeyMulticodec: 4612
  },
  {
    id: CurveId.SM2,
    feature: CurveFeature.SM2,
    algorithm: "sm2",
    aliases: ["sm2", "sm-2"],
    publicKeyLength: 65,
    publicKeyMulticodec: 4870
  }
]);
var CURVE_NAME_TO_ENTRY = /* @__PURE__ */ new Map();
var CURVE_ID_TO_ENTRY = /* @__PURE__ */ new Map();
var CURVE_MULTICODEC_TO_ENTRY = /* @__PURE__ */ new Map();
for (const entry of CURVE_REGISTRY) {
  CURVE_ID_TO_ENTRY.set(entry.id, entry);
  CURVE_MULTICODEC_TO_ENTRY.set(entry.publicKeyMulticodec, entry);
  CURVE_NAME_TO_ENTRY.set(entry.algorithm, entry);
  for (const alias of entry.aliases) {
    CURVE_NAME_TO_ENTRY.set(alias, entry);
  }
}
var CURVE_PUBLIC_KEY_LENGTH = new Map(
  CURVE_REGISTRY.map((entry) => [entry.id, entry.publicKeyLength])
);
function getCurveEntryById(curveId) {
  return CURVE_ID_TO_ENTRY.get(Number(curveId)) ?? null;
}
function getCurveEntryByAlgorithm(algorithm) {
  if (typeof algorithm !== "string") {
    return null;
  }
  if (algorithm.trim() === "" || algorithm.trim() !== algorithm) {
    return null;
  }
  const normalized = algorithm.toLowerCase();
  if (!/^[\x20-\x7e]+$/.test(normalized)) {
    return null;
  }
  return CURVE_NAME_TO_ENTRY.get(normalized) ?? null;
}
function canonicalCurveAlgorithm(curveId) {
  return getCurveEntryById(curveId)?.algorithm ?? null;
}

// ../iroha/javascript/iroha_js/dist/address.js
var DEFAULT_I105_DISCRIMINANT = 753;
var I105_DISCRIMINANT_MAX = 65535;
var HEADER_VERSION_V1 = 0;
var HEADER_NORM_VERSION_V1 = 1;
var I105_SENTINEL_SORA = "sora";
var I105_SENTINEL_TEST = "test";
var I105_SENTINEL_DEV = "dev";
var I105_SENTINEL_NUMERIC_PREFIX = "n";
var I105_CHECKSUM_LEN = 6;
var BECH32M_CONST = 734539939;
var encoder = new TextEncoder();
var I105_WARNING = "i105 addresses use the canonical I105 alphabet: Base58 plus the 47 half-width katakana from the Iroha poem. Render and validate them with the intended chain discriminant.";
var MULTISIG_DIGEST_PERSONALIZATION = (() => {
  const bytes = new Uint8Array(16);
  bytes.set(encoder.encode("iroha-ms-policy"));
  return bytes;
})();
var BASE58_ALPHABET = Array.from(
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
);
var IROHA_POEM_KANA_HALFWIDTH = [
  "\uFF72",
  "\uFF9B",
  "\uFF8A",
  "\uFF86",
  "\uFF8E",
  "\uFF8D",
  "\uFF84",
  "\uFF81",
  "\uFF98",
  "\uFF87",
  "\uFF99",
  "\uFF66",
  "\uFF9C",
  "\uFF76",
  "\uFF96",
  "\uFF80",
  "\uFF9A",
  "\uFF7F",
  "\uFF82",
  "\uFF88",
  "\uFF85",
  "\uFF97",
  "\uFF91",
  "\uFF73",
  "\u30F0",
  "\uFF89",
  "\uFF75",
  "\uFF78",
  "\uFF94",
  "\uFF8F",
  "\uFF79",
  "\uFF8C",
  "\uFF7A",
  "\uFF74",
  "\uFF83",
  "\uFF71",
  "\uFF7B",
  "\uFF77",
  "\uFF95",
  "\uFF92",
  "\uFF90",
  "\uFF7C",
  "\u30F1",
  "\uFF8B",
  "\uFF93",
  "\uFF7E",
  "\uFF7D"
];
var I105_ALPHABET = [...BASE58_ALPHABET, ...IROHA_POEM_KANA_HALFWIDTH];
var I105_BASE = I105_ALPHABET.length;
var AccountAddressErrorCode = Object.freeze({
  UNSUPPORTED_ALGORITHM: "ERR_UNSUPPORTED_ALGORITHM",
  KEY_PAYLOAD_TOO_LONG: "ERR_KEY_PAYLOAD_TOO_LONG",
  INVALID_HEADER_VERSION: "ERR_INVALID_HEADER_VERSION",
  INVALID_NORM_VERSION: "ERR_INVALID_NORM_VERSION",
  INVALID_I105_DISCRIMINANT: "ERR_INVALID_I105_DISCRIMINANT",
  CANONICAL_HASH_FAILURE: "ERR_CANONICAL_HASH_FAILURE",
  INVALID_LENGTH: "ERR_INVALID_LENGTH",
  CHECKSUM_MISMATCH: "ERR_CHECKSUM_MISMATCH",
  INVALID_HEX_ADDRESS: "ERR_INVALID_HEX_ADDRESS",
  DOMAIN_MISMATCH: "ERR_DOMAIN_MISMATCH",
  INVALID_DOMAIN_LABEL: "ERR_INVALID_DOMAIN_LABEL",
  INVALID_REGISTRY_ID: "ERR_INVALID_REGISTRY_ID",
  UNEXPECTED_NETWORK_PREFIX: "ERR_UNEXPECTED_NETWORK_PREFIX",
  UNKNOWN_ADDRESS_CLASS: "ERR_UNKNOWN_ADDRESS_CLASS",
  UNKNOWN_DOMAIN_TAG: "ERR_UNKNOWN_DOMAIN_TAG",
  UNEXPECTED_EXTENSION_FLAG: "ERR_UNEXPECTED_EXTENSION_FLAG",
  UNKNOWN_CONTROLLER_TAG: "ERR_UNKNOWN_CONTROLLER_TAG",
  INVALID_PUBLIC_KEY: "ERR_INVALID_PUBLIC_KEY",
  UNKNOWN_CURVE: "ERR_UNKNOWN_CURVE",
  UNEXPECTED_TRAILING_BYTES: "ERR_UNEXPECTED_TRAILING_BYTES",
  MISSING_I105_SENTINEL: "ERR_MISSING_I105_SENTINEL",
  I105_TOO_SHORT: "ERR_I105_TOO_SHORT",
  INVALID_I105_CHAR: "ERR_INVALID_I105_CHAR",
  INVALID_I105_BASE: "ERR_INVALID_I105_BASE",
  INVALID_I105_DIGIT: "ERR_INVALID_I105_DIGIT",
  LOCAL_DIGEST_TOO_SHORT: "ERR_LOCAL8_DEPRECATED",
  UNSUPPORTED_ADDRESS_FORMAT: "ERR_UNSUPPORTED_ADDRESS_FORMAT",
  MULTISIG_MEMBER_OVERFLOW: "ERR_MULTISIG_MEMBER_OVERFLOW",
  INVALID_MULTISIG_POLICY: "ERR_INVALID_MULTISIG_POLICY"
});
var ACCOUNT_ADDRESS_ERROR_CODES = new Set(Object.values(AccountAddressErrorCode));
var AccountAddressError = class extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = "AccountAddressError";
    this.code = code;
    if (options.details !== void 0) {
      this.details = options.details;
    }
    if (options.cause !== void 0) {
      this.cause = options.cause;
    }
  }
};
var AddressClass = Object.freeze({
  SINGLE_KEY: 0,
  MULTI_SIG: 1
});
var CONTROLLER_TAG_SINGLE = 0;
var CONTROLLER_TAG_MULTISIG = 1;
var MULTISIG_MEMBER_MAX = 65535;
var MULTISIG_POLICY_VERSION = 1;
var HEX_BODY_RE = /^[0-9a-fA-F]+$/;
var SM2_DEFAULT_DISTINGUISHED_ID = "1234567812345678";
var ED25519_FIELD_MODULUS = BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed");
var ED25519_SMALL_ORDER_ENCODINGS = [
  "0100000000000000000000000000000000000000000000000000000000000000",
  "c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a",
  "0000000000000000000000000000000000000000000000000000000000000080",
  "26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05",
  "ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
  "26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc85",
  "0000000000000000000000000000000000000000000000000000000000000000",
  "c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa"
].map((hex) => normalizeBytes(hex));
function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
function compareBytes(left, right) {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }
  return left.length - right.length;
}
function hexToBytes(body) {
  const out = new Uint8Array(body.length / 2);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = Number.parseInt(body.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}
var enabledFeatures = /* @__PURE__ */ new Set();
function normalizeCurveSupportOptions(options) {
  if (options === void 0) {
    return { allowMlDsa: false, allowGost: false, allowSm2: false, allowBls: false };
  }
  if (!isPlainObject(options)) {
    throw new TypeError("configureCurveSupport options must be an object");
  }
  const allowedKeys = /* @__PURE__ */ new Set(["allowMlDsa", "allowGost", "allowSm2", "allowBls"]);
  const extras = Object.keys(options).filter((key) => !allowedKeys.has(key));
  if (extras.length > 0) {
    throw new TypeError(
      `configureCurveSupport options contains unsupported fields: ${extras.join(", ")}`
    );
  }
  if (Object.prototype.hasOwnProperty.call(options, "allowMlDsa") && typeof options.allowMlDsa !== "boolean") {
    throw new TypeError("configureCurveSupport options.allowMlDsa must be a boolean");
  }
  if (Object.prototype.hasOwnProperty.call(options, "allowGost") && typeof options.allowGost !== "boolean") {
    throw new TypeError("configureCurveSupport options.allowGost must be a boolean");
  }
  if (Object.prototype.hasOwnProperty.call(options, "allowSm2") && typeof options.allowSm2 !== "boolean") {
    throw new TypeError("configureCurveSupport options.allowSm2 must be a boolean");
  }
  if (Object.prototype.hasOwnProperty.call(options, "allowBls") && typeof options.allowBls !== "boolean") {
    throw new TypeError("configureCurveSupport options.allowBls must be a boolean");
  }
  return {
    allowMlDsa: options.allowMlDsa === true,
    allowGost: options.allowGost === true,
    allowSm2: options.allowSm2 === true,
    allowBls: options.allowBls === true
  };
}
function configureCurveSupport(options) {
  const { allowMlDsa, allowGost, allowSm2, allowBls } = normalizeCurveSupportOptions(options);
  enabledFeatures = /* @__PURE__ */ new Set();
  if (allowMlDsa) {
    enabledFeatures.add(CurveFeature.ML_DSA);
  }
  if (allowGost) {
    enabledFeatures.add(CurveFeature.GOST);
  }
  if (allowSm2) {
    enabledFeatures.add(CurveFeature.SM2);
  }
  if (allowBls) {
    enabledFeatures.add(CurveFeature.BLS);
  }
}
configureCurveSupport();
function isFeatureEnabled(feature) {
  return feature === CurveFeature.NONE || enabledFeatures.has(feature);
}
function ensureCurveEnabled(entry, context) {
  if (!isFeatureEnabled(entry.feature)) {
    const label = entry.algorithm;
    throw new AccountAddressError(
      AccountAddressErrorCode.UNSUPPORTED_ALGORITHM,
      `${context ?? "curve"} disabled by configuration: ${label}`,
      { details: { feature: entry.feature, label } }
    );
  }
}
function ensureCurveIdEnabled(curveId, context) {
  const entry = getCurveEntryById(curveId);
  if (!entry) {
    throw new AccountAddressError(
      AccountAddressErrorCode.UNKNOWN_CURVE,
      `unknown curve id: ${curveId}`
    );
  }
  ensureCurveEnabled(entry, context ?? `curve id ${curveId}`);
  return entry;
}
function bytesEqual(lhs, rhs) {
  if (lhs.length !== rhs.length) {
    return false;
  }
  for (let index = 0; index < lhs.length; index += 1) {
    if (lhs[index] !== rhs[index]) {
      return false;
    }
  }
  return true;
}
function ed25519CanonicalYCoordinate(keyBytes) {
  const copy = Uint8Array.from(keyBytes);
  copy[copy.length - 1] &= 127;
  let acc = 0n;
  for (let index = copy.length - 1; index >= 0; index -= 1) {
    acc = acc << 8n | BigInt(copy[index]);
  }
  return acc;
}
function assertEd25519CanonicalEncoding(keyBytes, context) {
  const y = ed25519CanonicalYCoordinate(keyBytes);
  if (y >= ED25519_FIELD_MODULUS) {
    throw new AccountAddressError(
      AccountAddressErrorCode.INVALID_PUBLIC_KEY,
      `non-canonical ed25519 ${context}`,
      { details: { curveId: CurveId.ED25519 } }
    );
  }
}
function assertEd25519NotSmallOrder(keyBytes, context) {
  const isSmallOrder = ED25519_SMALL_ORDER_ENCODINGS.some(
    (candidate) => bytesEqual(candidate, keyBytes)
  );
  if (isSmallOrder) {
    throw new AccountAddressError(
      AccountAddressErrorCode.INVALID_PUBLIC_KEY,
      `ed25519 ${context} is small-order (weak); rejected`,
      { details: { curveId: CurveId.ED25519 } }
    );
  }
}
function validatePublicKeyForCurve(curveId, keyBytes, context = "public key") {
  const entry = ensureCurveIdEnabled(curveId, context);
  if (entry.id === CurveId.SM2) {
    const rawSm2Length = CURVE_PUBLIC_KEY_LENGTH.get(entry.id);
    if (keyBytes.length === rawSm2Length) {
      return;
    }
    if (keyBytes.length >= 2 + rawSm2Length) {
      const distidLength = keyBytes[0] << 8 | keyBytes[1];
      if (keyBytes.length === 2 + distidLength + rawSm2Length) {
        return;
      }
    }
    throw new AccountAddressError(
      AccountAddressErrorCode.INVALID_PUBLIC_KEY,
      `invalid ${entry.algorithm} ${context}: expected raw ${rawSm2Length}-byte SEC1 data or canonical payload`,
      { details: { curveId: entry.id, length: keyBytes.length, expectedLength: rawSm2Length } }
    );
  }
  const expectedLength = CURVE_PUBLIC_KEY_LENGTH.get(entry.id);
  if (expectedLength === void 0) {
    throw new AccountAddressError(
      AccountAddressErrorCode.INVALID_PUBLIC_KEY,
      `no validation rule for curve id ${entry.id}`,
      { details: { curveId: entry.id, length: keyBytes.length } }
    );
  }
  if (keyBytes.length !== expectedLength) {
    const label = entry.algorithm ?? `curve id ${entry.id}`;
    throw new AccountAddressError(
      AccountAddressErrorCode.INVALID_PUBLIC_KEY,
      `invalid ${label} ${context}: expected ${expectedLength} bytes`,
      { details: { curveId: entry.id, length: keyBytes.length, expectedLength } }
    );
  }
  if (entry.id === CurveId.ED25519) {
    assertEd25519CanonicalEncoding(keyBytes, context);
    assertEd25519NotSmallOrder(keyBytes, context);
  }
}
function normalizeControllerPublicKeyForCurve(curveId, keyBytes, context = "public key") {
  validatePublicKeyForCurve(curveId, keyBytes, context);
  if (curveId !== CurveId.SM2) {
    return keyBytes;
  }
  const rawSm2Length = CURVE_PUBLIC_KEY_LENGTH.get(CurveId.SM2);
  if (keyBytes.length !== rawSm2Length) {
    return keyBytes;
  }
  const distidBytes = encoder.encode(SM2_DEFAULT_DISTINGUISHED_ID);
  if (distidBytes.length > 65535) {
    throw new AccountAddressError(
      AccountAddressErrorCode.INVALID_PUBLIC_KEY,
      "SM2 distid exceeds canonical payload limits"
    );
  }
  const payload = new Uint8Array(2 + distidBytes.length + keyBytes.length);
  payload[0] = distidBytes.length >> 8 & 255;
  payload[1] = distidBytes.length & 255;
  payload.set(distidBytes, 2);
  payload.set(keyBytes, 2 + distidBytes.length);
  return payload;
}
function invalidMultisigPolicy(policyError, message, extraDetails) {
  const details = { policyError, ...extraDetails };
  throw new AccountAddressError(
    AccountAddressErrorCode.INVALID_MULTISIG_POLICY,
    message ?? `invalid multisig policy: ${policyError}`,
    { details }
  );
}
function normalizePolicyU16(value, context) {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > 65535) {
    throw new TypeError(`${context} must be a 16-bit unsigned integer`);
  }
  return value;
}
function normalizeMultisigMembers(members) {
  if (!Array.isArray(members) || members.length === 0) {
    invalidMultisigPolicy("EmptyMembers", "invalid multisig policy: EmptyMembers");
  }
  const normalized = members.map((member, index) => {
    const curve = member.curve ?? CurveId.ED25519;
    ensureCurveIdEnabled(curve, `multisig member ${index}`);
    const weight = member.weight ?? 0;
    if (!Number.isFinite(weight) || !Number.isInteger(weight)) {
      throw new TypeError("multisig member weight must be an integer");
    }
    if (weight === 0) {
      invalidMultisigPolicy("MemberWeightZero", "invalid multisig policy: MemberWeightZero");
    }
    if (weight < 0 || weight > 65535) {
      throw new TypeError("multisig member weight must fit in a 16-bit unsigned integer");
    }
    const publicKey = normalizeBytes(member.publicKey);
    const canonicalPublicKey = normalizeControllerPublicKeyForCurve(
      curve,
      publicKey,
      `multisig member ${index} public key`
    );
    const sortKey = concatBytes([
      encoder.encode(curveIdToAlgorithm(curve)),
      Uint8Array.of(0),
      canonicalPublicKey
    ]);
    return { curve, weight, publicKey: canonicalPublicKey, sortKey };
  });
  normalized.sort((left, right) => compareBytes(left.sortKey, right.sortKey));
  for (let index = 1; index < normalized.length; index += 1) {
    if (compareBytes(normalized[index].sortKey, normalized[index - 1].sortKey) === 0) {
      invalidMultisigPolicy("DuplicateMember", "invalid multisig policy: DuplicateMember");
    }
  }
  return normalized.map(({ sortKey, ...rest }) => rest);
}
function validateAndNormalizeMultisigController(controller) {
  const version = normalizePolicyU16(
    controller.version ?? MULTISIG_POLICY_VERSION,
    "multisig policy version"
  );
  if (version !== MULTISIG_POLICY_VERSION) {
    invalidMultisigPolicy("UnsupportedVersion", "invalid multisig policy: UnsupportedVersion", {
      version
    });
  }
  const memberEntries = controller.members ?? [];
  if (memberEntries.length === 0) {
    invalidMultisigPolicy("EmptyMembers", "invalid multisig policy: EmptyMembers");
  }
  if (memberEntries.length > MULTISIG_MEMBER_MAX) {
    throw new AccountAddressError(
      AccountAddressErrorCode.MULTISIG_MEMBER_OVERFLOW,
      `multisig member overflow: ${memberEntries.length} entries exceeds ${MULTISIG_MEMBER_MAX}`,
      { details: { count: memberEntries.length, limit: MULTISIG_MEMBER_MAX } }
    );
  }
  const threshold = normalizePolicyU16(
    controller.threshold ?? 0,
    "multisig policy threshold"
  );
  if (threshold === 0) {
    invalidMultisigPolicy("ZeroThreshold", "invalid multisig policy: ZeroThreshold");
  }
  const members = normalizeMultisigMembers(memberEntries);
  const totalWeight = members.reduce((acc, member) => acc + member.weight, 0);
  if (threshold > totalWeight) {
    invalidMultisigPolicy(
      "ThresholdExceedsTotal",
      "invalid multisig policy: ThresholdExceedsTotal",
      { threshold, totalWeight }
    );
  }
  return {
    tag: CONTROLLER_TAG_MULTISIG,
    version,
    threshold,
    members
  };
}
function normalizeBytes(value) {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (Array.isArray(value)) {
    const out = new Uint8Array(value.length);
    for (let index = 0; index < value.length; index += 1) {
      const byte = value[index];
      if (typeof byte !== "number" || !Number.isFinite(byte) || !Number.isInteger(byte) || byte < 0 || byte > 255) {
        throw new TypeError("byte array entries must be integers between 0 and 255");
      }
      out[index] = byte;
    }
    return out;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const body = trimmed.startsWith("0x") || trimmed.startsWith("0X") ? trimmed.slice(2) : trimmed;
    if (body.length === 0 || body.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(body)) {
      throw new TypeError("hex string inputs must be even-length and contain only hex digits");
    }
    return hexToBytes(body);
  }
  throw new TypeError(
    "expected Uint8Array, Buffer, ArrayBuffer, ArrayBufferView, number[], or hex string for byte data"
  );
}
function blake2b256Personalized(data, personalization, includeZeroKeyBlock = false) {
  const normalized = normalizeBytes(data);
  const options = {
    includeZeroKeyBlock: includeZeroKeyBlock === true
  };
  if (personalization !== void 0 && personalization !== null) {
    options.personalization = normalizeBytes(personalization);
  }
  return blake2b256(normalized, options);
}
function curveIdFromAlgorithm(algorithm) {
  const entry = getCurveEntryByAlgorithm(algorithm);
  if (!entry) {
    throw new AccountAddressError(
      AccountAddressErrorCode.UNSUPPORTED_ALGORITHM,
      `unsupported signing algorithm: ${algorithm}`,
      { details: { algorithm } }
    );
  }
  ensureCurveEnabled(entry, `signing algorithm ${algorithm}`);
  return entry.id;
}
function encodeHeader({ version, classId, normVersion, extFlag }) {
  let byte = (version & 7) << 5 | (classId & 3) << 3;
  byte |= (normVersion & 3) << 1;
  byte |= extFlag ? 1 : 0;
  return byte;
}
function decodeHeader(byte) {
  const version = byte >> 5 & 7;
  const classBits = byte >> 3 & 3;
  const normVersion = byte >> 1 & 3;
  const extFlag = (byte & 1) === 1;
  if (version > 7) {
    throw new AccountAddressError(
      AccountAddressErrorCode.INVALID_HEADER_VERSION,
      `invalid address header version: ${version}`
    );
  }
  if (normVersion > 3) {
    throw new AccountAddressError(
      AccountAddressErrorCode.INVALID_NORM_VERSION,
      `invalid normalization version: ${normVersion}`
    );
  }
  if (!Object.values(AddressClass).includes(classBits)) {
    throw new AccountAddressError(
      AccountAddressErrorCode.UNKNOWN_ADDRESS_CLASS,
      `unknown address class: ${classBits}`
    );
  }
  if (extFlag) {
    throw new AccountAddressError(
      AccountAddressErrorCode.UNEXPECTED_EXTENSION_FLAG,
      "unexpected address header extension flag"
    );
  }
  return { version, classId: classBits, normVersion, extFlag };
}
function encodeController(controller) {
  if (controller.tag === CONTROLLER_TAG_SINGLE) {
    const keyBytes = normalizeControllerPublicKeyForCurve(
      controller.curve,
      controller.publicKey,
      "controller public key"
    );
    if (keyBytes.length > 255) {
      throw new AccountAddressError(
        AccountAddressErrorCode.KEY_PAYLOAD_TOO_LONG,
        `key payload too long: ${keyBytes.length} bytes`,
        { details: { length: keyBytes.length } }
      );
    }
    const out = new Uint8Array(3 + keyBytes.length);
    out[0] = controller.tag;
    out[1] = controller.curve;
    out[2] = keyBytes.length;
    out.set(keyBytes, 3);
    return out;
  }
  if (controller.tag === CONTROLLER_TAG_MULTISIG) {
    const normalized = validateAndNormalizeMultisigController(controller);
    const members = normalized.members;
    if (members.length > MULTISIG_MEMBER_MAX) {
      throw new AccountAddressError(
        AccountAddressErrorCode.MULTISIG_MEMBER_OVERFLOW,
        `multisig member overflow: ${members.length} entries exceeds ${MULTISIG_MEMBER_MAX}`,
        { details: { count: members.length, limit: MULTISIG_MEMBER_MAX } }
      );
    }
    const parts = [];
    parts.push(normalized.tag);
    parts.push(normalized.version);
    const threshold = normalized.threshold;
    parts.push(threshold >> 8 & 255, threshold & 255);
    parts.push(members.length >> 8 & 255, members.length & 255);
    for (const member of members) {
      const curve = member.curve ?? CurveId.ED25519;
      ensureCurveIdEnabled(curve, "multisig member");
      parts.push(curve);
      const weight = member.weight ?? 0;
      parts.push(weight >> 8 & 255, weight & 255);
      const keyBytes = normalizeControllerPublicKeyForCurve(
        curve,
        normalizeBytes(member.publicKey),
        "multisig member public key"
      );
      if (keyBytes.length > 65535) {
        throw new AccountAddressError(
          AccountAddressErrorCode.KEY_PAYLOAD_TOO_LONG,
          `key payload too long: ${keyBytes.length} bytes`,
          { details: { length: keyBytes.length } }
        );
      }
      parts.push(keyBytes.length >> 8 & 255, keyBytes.length & 255);
      parts.push(...keyBytes);
    }
    return Uint8Array.from(parts);
  }
  throw new AccountAddressError(AccountAddressErrorCode.UNKNOWN_CONTROLLER_TAG, "unsupported controller payload variant");
}
function decodeController(bytes, cursor) {
  if (cursor >= bytes.length) {
    throw new AccountAddressError(AccountAddressErrorCode.INVALID_LENGTH, "invalid length for address payload");
  }
  const tag = bytes[cursor];
  cursor += 1;
  if (tag === CONTROLLER_TAG_SINGLE) {
    if (cursor >= bytes.length) {
      throw new AccountAddressError(AccountAddressErrorCode.INVALID_LENGTH, "invalid length for address payload");
    }
    const curve = bytes[cursor];
    cursor += 1;
    const curveId = curveIdFromByte(curve);
    if (cursor >= bytes.length) {
      throw new AccountAddressError(AccountAddressErrorCode.INVALID_LENGTH, "invalid length for address payload");
    }
    const length = bytes[cursor];
    cursor += 1;
    const end = cursor + length;
    if (end > bytes.length) {
      throw new AccountAddressError(AccountAddressErrorCode.INVALID_LENGTH, "invalid length for address payload");
    }
    const publicKey = bytes.slice(cursor, end);
    validatePublicKeyForCurve(curveId, publicKey, "controller public key");
    return [{ tag, curve: curveId, publicKey }, end];
  }
  if (tag === CONTROLLER_TAG_MULTISIG) {
    if (cursor >= bytes.length) {
      throw new AccountAddressError(AccountAddressErrorCode.INVALID_LENGTH, "invalid length for address payload");
    }
    const version = bytes[cursor];
    cursor += 1;
    if (cursor + 1 >= bytes.length) {
      throw new AccountAddressError(AccountAddressErrorCode.INVALID_LENGTH, "invalid length for address payload");
    }
    const threshold = bytes[cursor] << 8 | bytes[cursor + 1];
    cursor += 2;
    if (cursor >= bytes.length) {
      throw new AccountAddressError(AccountAddressErrorCode.INVALID_LENGTH, "invalid length for address payload");
    }
    if (cursor + 1 >= bytes.length) {
      throw new AccountAddressError(AccountAddressErrorCode.INVALID_LENGTH, "invalid length for address payload");
    }
    const memberCount = bytes[cursor] << 8 | bytes[cursor + 1];
    cursor += 2;
    if (memberCount > MULTISIG_MEMBER_MAX) {
      throw new AccountAddressError(
        AccountAddressErrorCode.MULTISIG_MEMBER_OVERFLOW,
        `multisig member overflow: ${memberCount} entries exceeds ${MULTISIG_MEMBER_MAX}`,
        { details: { count: memberCount, limit: MULTISIG_MEMBER_MAX } }
      );
    }
    const members = [];
    for (let index = 0; index < memberCount; index += 1) {
      if (cursor >= bytes.length) {
        throw new AccountAddressError(AccountAddressErrorCode.INVALID_LENGTH, "invalid length for address payload");
      }
      const curve = curveIdFromByte(bytes[cursor]);
      cursor += 1;
      if (cursor + 1 >= bytes.length) {
        throw new AccountAddressError(AccountAddressErrorCode.INVALID_LENGTH, "invalid length for address payload");
      }
      const weight = bytes[cursor] << 8 | bytes[cursor + 1];
      cursor += 2;
      if (cursor + 1 >= bytes.length) {
        throw new AccountAddressError(AccountAddressErrorCode.INVALID_LENGTH, "invalid length for address payload");
      }
      const keyLength = bytes[cursor] << 8 | bytes[cursor + 1];
      cursor += 2;
      const end = cursor + keyLength;
      if (end > bytes.length) {
        throw new AccountAddressError(AccountAddressErrorCode.INVALID_LENGTH, "invalid length for address payload");
      }
      const publicKey = bytes.slice(cursor, end);
      cursor = end;
      validatePublicKeyForCurve(curve, publicKey, "multisig member public key");
      members.push({ curve, weight, publicKey });
    }
    const normalized = validateAndNormalizeMultisigController({
      tag,
      version,
      threshold,
      members
    });
    return [normalized, cursor];
  }
  throw new AccountAddressError(
    AccountAddressErrorCode.UNKNOWN_CONTROLLER_TAG,
    `unknown controller payload tag: ${tag}`
  );
}
function curveIdFromByte(value) {
  const entry = ensureCurveIdEnabled(value);
  return entry.id;
}
function encodeMultisigPolicyCbor(controller) {
  const { version, threshold, members } = validateAndNormalizeMultisigController(controller);
  const sortedMembers = members;
  const parts = [];
  cborAppendLength(parts, 5, 3);
  cborAppendUnsigned(parts, 1);
  cborAppendUnsigned(parts, version);
  cborAppendUnsigned(parts, 2);
  cborAppendUnsigned(parts, threshold);
  cborAppendUnsigned(parts, 3);
  cborAppendLength(parts, 4, sortedMembers.length);
  for (const member of sortedMembers) {
    cborAppendLength(parts, 5, 3);
    cborAppendUnsigned(parts, 1);
    cborAppendUnsigned(parts, member.curve);
    cborAppendUnsigned(parts, 2);
    cborAppendUnsigned(parts, member.weight ?? 0);
    cborAppendUnsigned(parts, 3);
    cborAppendBytes(parts, member.publicKey);
  }
  return Uint8Array.from(parts);
}
function cborAppendUnsigned(parts, value) {
  if (value >= 0 && value <= 23) {
    parts.push(value);
  } else if (value <= 255) {
    parts.push(24, value);
  } else if (value <= 65535) {
    parts.push(25, value >> 8 & 255, value & 255);
  } else if (value <= 4294967295) {
    parts.push(
      26,
      value >> 24 & 255,
      value >> 16 & 255,
      value >> 8 & 255,
      value & 255
    );
  } else {
    const hi = Math.floor(value / 4294967296);
    const lo = value & 4294967295;
    parts.push(
      27,
      hi >> 24 & 255,
      hi >> 16 & 255,
      hi >> 8 & 255,
      hi & 255,
      lo >> 24 & 255,
      lo >> 16 & 255,
      lo >> 8 & 255,
      lo & 255
    );
  }
}
function cborAppendLength(parts, major, length) {
  const base = major << 5;
  if (length >= 0 && length <= 23) {
    parts.push(base | length);
  } else if (length <= 255) {
    parts.push(base | 24, length);
  } else if (length <= 65535) {
    parts.push(base | 25, length >> 8 & 255, length & 255);
  } else if (length <= 4294967295) {
    parts.push(
      base | 26,
      length >> 24 & 255,
      length >> 16 & 255,
      length >> 8 & 255,
      length & 255
    );
  } else {
    const hi = Math.floor(length / 4294967296);
    const lo = length & 4294967295;
    parts.push(
      base | 27,
      hi >> 24 & 255,
      hi >> 16 & 255,
      hi >> 8 & 255,
      hi & 255,
      lo >> 24 & 255,
      lo >> 16 & 255,
      lo >> 8 & 255,
      lo & 255
    );
  }
}
function cborAppendBytes(parts, bytes) {
  cborAppendLength(parts, 2, bytes.length);
  parts.push(...bytes);
}
function curveIdToAlgorithm(curveId) {
  const entry = ensureCurveIdEnabled(curveId, `curve id ${curveId}`);
  return canonicalCurveAlgorithm(entry.id) ?? entry.algorithm;
}
function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}
function computeMultisigPolicyDigest(bytes) {
  return blake2b256Personalized(bytes, MULTISIG_DIGEST_PERSONALIZATION, true);
}
var AccountAddress = class _AccountAddress {
  constructor(header, controller) {
    this._header = header;
    this._controller = controller;
  }
  static fromAccount(options) {
    if (!isPlainObject(options)) {
      throw new TypeError("AccountAddress.fromAccount options must be an object");
    }
    const allowedKeys = /* @__PURE__ */ new Set(["publicKey", "algorithm"]);
    const extras = Object.keys(options).filter((key) => !allowedKeys.has(key));
    if (extras.length > 0) {
      throw new TypeError(
        `AccountAddress.fromAccount options contains unsupported fields: ${extras.join(", ")}`
      );
    }
    const { publicKey, algorithm = "ed25519" } = options;
    const header = {
      version: HEADER_VERSION_V1,
      classId: AddressClass.SINGLE_KEY,
      normVersion: HEADER_NORM_VERSION_V1,
      extFlag: false
    };
    const curve = curveIdFromAlgorithm(algorithm);
    const keyBytes = normalizeControllerPublicKeyForCurve(curve, normalizeBytes(publicKey), "public key");
    const controller = { tag: CONTROLLER_TAG_SINGLE, curve, publicKey: keyBytes };
    return new _AccountAddress(header, controller);
  }
  static fromCanonicalBytes(bytes) {
    if (!bytes || bytes.length === 0) {
      throw new AccountAddressError(AccountAddressErrorCode.INVALID_LENGTH, "invalid length for address payload");
    }
    const data = Uint8Array.from(bytes);
    const header = decodeHeader(data[0]);
    let controllerCursor = 1;
    const [controller, decodedCursor] = decodeController(data, controllerCursor);
    controllerCursor = decodedCursor;
    if (controllerCursor !== data.length) {
      throw new AccountAddressError(
        AccountAddressErrorCode.UNEXPECTED_TRAILING_BYTES,
        "unexpected trailing bytes in canonical payload"
      );
    }
    return new _AccountAddress(header, controller);
  }
  static fromI105(encoded, expectedPrefix) {
    const literal = typeof encoded === "string" ? encoded.trim() : encoded;
    const normalizedExpectedDiscriminant = expectedPrefix === void 0 ? void 0 : normalizeI105DiscriminantInput(
      expectedPrefix,
      "AccountAddress.fromI105 expectedPrefix"
    );
    const [, canonical] = decodeSupportedI105String(
      encoded,
      normalizedExpectedDiscriminant
    );
    const address = _AccountAddress.fromCanonicalBytes(canonical);
    assertCanonicalI105Literal(literal, address);
    return address;
  }
  static fromAccountId(accountId, expectedPrefix) {
    return _AccountAddress.parseEncoded(accountId, expectedPrefix).address;
  }
  static parseEncoded(input, expectedPrefix) {
    if (typeof input !== "string") {
      throw new TypeError("account address literal must be a string");
    }
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      throw new AccountAddressError(AccountAddressErrorCode.INVALID_LENGTH, "invalid length for address payload");
    }
    if (trimmed.includes("@")) {
      throw new AccountAddressError(
        AccountAddressErrorCode.UNSUPPORTED_ADDRESS_FORMAT,
        "account address literals must not include '@domain'; use canonical I105 form"
      );
    }
    if (isCanonicalHexLiteral(trimmed)) {
      throw new AccountAddressError(
        AccountAddressErrorCode.UNSUPPORTED_ADDRESS_FORMAT,
        "canonical hex account addresses are not accepted; use canonical I105 form"
      );
    }
    try {
      const address = _AccountAddress.fromI105(trimmed, expectedPrefix);
      return {
        address,
        chainDiscriminant: tryExtractI105Discriminant(trimmed)
      };
    } catch (error) {
      if (error instanceof AccountAddressError) {
        if (error.code !== AccountAddressErrorCode.UNSUPPORTED_ADDRESS_FORMAT) {
          throw error;
        }
        throw new AccountAddressError(
          AccountAddressErrorCode.UNSUPPORTED_ADDRESS_FORMAT,
          "unsupported address format",
          { cause: error, details: { causeCode: error.code } }
        );
      }
      throw error;
    }
  }
  canonicalBytes() {
    const headerByte = encodeHeader(this._header);
    const header = Uint8Array.of(headerByte);
    const controller = encodeController(this._controller);
    const out = new Uint8Array(header.length + controller.length);
    out.set(header, 0);
    out.set(controller, header.length);
    return out;
  }
  canonicalHex() {
    const canonical = this.canonicalBytes();
    return `0x${bytesToHex(canonical).toLowerCase()}`;
  }
  toI105(prefix = DEFAULT_I105_DISCRIMINANT) {
    const normalizedDiscriminant = normalizeI105DiscriminantInput(
      prefix,
      "AccountAddress.toI105 chainDiscriminant"
    );
    const canonical = this.canonicalBytes();
    return encodeI105String(normalizedDiscriminant, canonical);
  }
  toString() {
    return this.toI105();
  }
  /**
   * Convenience helper that returns canonical I105 plus chain discriminant metadata.
   *
   * @param {number|bigint|string} chainDiscriminant - Chain discriminant (defaults to Sora `753`);
   * accepts numeric strings that will be normalized.
   * @returns {{ i105: string, chainDiscriminant: number, i105Warning: string }}
   */
  displayFormats(chainDiscriminant = DEFAULT_I105_DISCRIMINANT) {
    const normalizedDiscriminant = normalizeI105DiscriminantInput(
      chainDiscriminant,
      "AccountAddress.displayFormats chainDiscriminant"
    );
    const i105 = this.toI105(normalizedDiscriminant);
    return Object.freeze({
      i105,
      chainDiscriminant: normalizedDiscriminant,
      i105Warning: I105_WARNING
    });
  }
  multisigPolicyInfo() {
    if (this._controller.tag !== CONTROLLER_TAG_MULTISIG) {
      return null;
    }
    const controller = this._controller;
    const ctap2 = encodeMultisigPolicyCbor(controller);
    const digest = computeMultisigPolicyDigest(ctap2);
    const members = controller.members.map((member) => ({
      algorithm: curveIdToAlgorithm(member.curve),
      weight: member.weight,
      publicKeyHex: `0x${bytesToHex(member.publicKey)}`
    }));
    const totalWeight = members.reduce((acc, member) => acc + member.weight, 0);
    return {
      version: controller.version,
      threshold: controller.threshold,
      totalWeight,
      members,
      ctap2CborHex: `0x${bytesToHex(ctap2)}`,
      digestBlake2b256Hex: `0x${bytesToHex(digest)}`
    };
  }
};
function assertCanonicalI105Literal(input, address) {
  if (typeof input !== "string") {
    return;
  }
  const discriminant = tryExtractI105Discriminant(input);
  if (discriminant === void 0) {
    throw new AccountAddressError(
      AccountAddressErrorCode.UNSUPPORTED_ADDRESS_FORMAT,
      "account address literals must use canonical I105 form"
    );
  }
  if (address.toI105(discriminant) !== input) {
    throw new AccountAddressError(
      AccountAddressErrorCode.UNSUPPORTED_ADDRESS_FORMAT,
      "account address literals must use canonical I105 form"
    );
  }
}
function tryExtractI105Discriminant(literal) {
  try {
    const [discriminant] = decodeSupportedI105String(literal);
    return discriminant;
  } catch {
    return void 0;
  }
}
function isCanonicalHexLiteral(literal) {
  if (literal.startsWith("0x") || literal.startsWith("0X")) {
    return true;
  }
  const body = literal;
  return body.length > 0 && body.length % 2 === 0 && HEX_BODY_RE.test(body);
}
function isPlainObject(value) {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function normalizeI105DiscriminantInput(value, context = "i105 chain discriminant") {
  if (value === void 0 || value === null) {
    throw new AccountAddressError(
      AccountAddressErrorCode.INVALID_I105_DISCRIMINANT,
      `${context} must be an integer between 0 and ${I105_DISCRIMINANT_MAX}`
    );
  }
  let numeric;
  if (typeof value === "number") {
    numeric = value;
  } else if (typeof value === "bigint") {
    numeric = Number(value);
  } else if (typeof value === "string") {
    if (value.trim().length === 0) {
      throw new AccountAddressError(
        AccountAddressErrorCode.INVALID_I105_DISCRIMINANT,
        `${context} must be an integer between 0 and ${I105_DISCRIMINANT_MAX}`
      );
    }
    numeric = Number(value);
  } else {
    throw new AccountAddressError(
      AccountAddressErrorCode.INVALID_I105_DISCRIMINANT,
      `${context} must be an integer between 0 and ${I105_DISCRIMINANT_MAX}`
    );
  }
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
    throw new AccountAddressError(
      AccountAddressErrorCode.INVALID_I105_DISCRIMINANT,
      `${context} must be an integer between 0 and ${I105_DISCRIMINANT_MAX}`
    );
  }
  if (numeric < 0 || numeric > I105_DISCRIMINANT_MAX) {
    throw new AccountAddressError(
      AccountAddressErrorCode.INVALID_I105_DISCRIMINANT,
      `${context} out of range: ${value}`
    );
  }
  return numeric;
}
function i105SentinelForDiscriminant(discriminant) {
  switch (discriminant) {
    case DEFAULT_I105_DISCRIMINANT:
      return I105_SENTINEL_SORA;
    case 369:
      return I105_SENTINEL_TEST;
    case 0:
      return I105_SENTINEL_DEV;
    default:
      return `${I105_SENTINEL_NUMERIC_PREFIX}${discriminant}`;
  }
}
function parseI105SentinelAndPayload(encoded) {
  if (typeof encoded !== "string") {
    return null;
  }
  if (encoded.startsWith(I105_SENTINEL_SORA)) {
    return [DEFAULT_I105_DISCRIMINANT, encoded.slice(I105_SENTINEL_SORA.length)];
  }
  if (encoded.startsWith(I105_SENTINEL_TEST)) {
    return [369, encoded.slice(I105_SENTINEL_TEST.length)];
  }
  if (encoded.startsWith(I105_SENTINEL_DEV)) {
    return [0, encoded.slice(I105_SENTINEL_DEV.length)];
  }
  if (!encoded.startsWith(I105_SENTINEL_NUMERIC_PREFIX)) {
    return null;
  }
  const tail = encoded.slice(I105_SENTINEL_NUMERIC_PREFIX.length);
  let index = 0;
  let discriminantDigits = "";
  while (index < tail.length) {
    const asciiDigit = toAsciiDigit(tail[index]);
    if (asciiDigit === null) {
      break;
    }
    discriminantDigits += asciiDigit;
    index += 1;
  }
  if (discriminantDigits.length === 0) {
    return null;
  }
  const discriminant = Number(discriminantDigits);
  if (!Number.isInteger(discriminant) || discriminant < 0 || discriminant > I105_DISCRIMINANT_MAX) {
    throw new AccountAddressError(
      AccountAddressErrorCode.INVALID_I105_DISCRIMINANT,
      `invalid i105 chain discriminant sentinel: ${encoded}`
    );
  }
  return [discriminant, tail.slice(index)];
}
function toAsciiDigit(char) {
  if (char >= "0" && char <= "9") {
    return char;
  }
  return null;
}
function encodeI105String(discriminant, canonical) {
  const normalizedDiscriminant = normalizeI105DiscriminantInput(
    discriminant,
    "i105 chain discriminant"
  );
  const canonicalBytes = normalizeBytes(canonical);
  const digits = encodeBaseN(canonicalBytes, I105_BASE);
  const checksum = i105ChecksumDigits(canonicalBytes);
  const sentinel = i105SentinelForDiscriminant(normalizedDiscriminant);
  const parts = [sentinel];
  parts.push(...digits.map((digit) => I105_ALPHABET[digit]));
  parts.push(...checksum.map((digit) => I105_ALPHABET[digit]));
  return parts.join("");
}
function decodeSupportedI105String(encoded, expectedDiscriminant) {
  return decodeI105String(encoded, expectedDiscriminant);
}
function lookupI105Digit(symbol) {
  const canonicalIndex = I105_ALPHABET.indexOf(symbol);
  if (canonicalIndex !== -1) {
    return canonicalIndex;
  }
  return void 0;
}
function decodeI105Payload(payload) {
  const digits = [];
  for (const symbol of Array.from(payload)) {
    const digit = lookupI105Digit(symbol);
    if (digit === void 0) {
      throw new AccountAddressError(
        AccountAddressErrorCode.INVALID_I105_CHAR,
        `invalid character in i105 address: ${symbol}`,
        { details: { char: symbol } }
      );
    }
    digits.push(digit);
  }
  if (digits.length <= I105_CHECKSUM_LEN) {
    throw new AccountAddressError(
      AccountAddressErrorCode.I105_TOO_SHORT,
      "i105 address too short"
    );
  }
  const dataDigits = digits.slice(0, -I105_CHECKSUM_LEN);
  const checksumDigits = digits.slice(-I105_CHECKSUM_LEN);
  const canonicalBytes = decodeBaseN(dataDigits, I105_BASE);
  const expected = i105ChecksumDigits(canonicalBytes);
  if (compareBytes(expected, checksumDigits) !== 0) {
    throw new AccountAddressError(
      AccountAddressErrorCode.CHECKSUM_MISMATCH,
      "i105 checksum mismatch"
    );
  }
  return canonicalBytes;
}
function decodeI105String(encoded, expectedDiscriminant) {
  if (typeof encoded !== "string") {
    throw new TypeError("i105 address must be a string");
  }
  const parsed = parseI105SentinelAndPayload(encoded);
  if (!parsed) {
    throw new AccountAddressError(
      AccountAddressErrorCode.MISSING_I105_SENTINEL,
      "i105 address is missing the expected chain-discriminant sentinel"
    );
  }
  const [discriminant, payload] = parsed;
  if (expectedDiscriminant !== void 0) {
    const normalizedExpected = normalizeI105DiscriminantInput(
      expectedDiscriminant,
      "expected i105 chain discriminant"
    );
    if (discriminant !== normalizedExpected) {
      throw new AccountAddressError(
        AccountAddressErrorCode.UNEXPECTED_NETWORK_PREFIX,
        `unexpected i105 chain discriminant: expected ${normalizedExpected}, found ${discriminant}`,
        { details: { expected: normalizedExpected, found: discriminant } }
      );
    }
  }
  const canonicalBytes = decodeI105Payload(payload);
  return [discriminant, canonicalBytes];
}
function encodeBaseN(bytes, base) {
  if (base < 2) {
    throw new AccountAddressError(
      AccountAddressErrorCode.INVALID_I105_BASE,
      "invalid base for encoding"
    );
  }
  const value = Array.from(bytes);
  let leading = 0;
  while (leading < value.length && value[leading] === 0) {
    leading += 1;
  }
  const digits = [];
  let start = leading;
  while (start < value.length) {
    let remainder = 0;
    for (let i = start; i < value.length; i += 1) {
      const acc = remainder << 8 | value[i];
      value[i] = Math.floor(acc / base);
      remainder = acc % base;
    }
    digits.push(remainder);
    while (start < value.length && value[start] === 0) {
      start += 1;
    }
  }
  for (let i = 0; i < leading; i += 1) {
    digits.push(0);
  }
  if (digits.length === 0) {
    digits.push(0);
  }
  digits.reverse();
  return digits;
}
function decodeBaseN(digits, base) {
  if (base < 2) {
    throw new AccountAddressError(
      AccountAddressErrorCode.INVALID_I105_BASE,
      "invalid base for decoding"
    );
  }
  if (digits.length === 0) {
    throw new AccountAddressError(AccountAddressErrorCode.INVALID_LENGTH, "invalid length for address payload");
  }
  const value = Array.from(digits);
  for (const digit of value) {
    if (digit < 0 || digit >= base) {
      throw new AccountAddressError(
        AccountAddressErrorCode.INVALID_I105_DIGIT,
        `invalid digit ${digit} for base ${base}`,
        { details: { digit, base } }
      );
    }
  }
  let leading = 0;
  while (leading < value.length && value[leading] === 0) {
    leading += 1;
  }
  const out = [];
  let start = leading;
  while (start < value.length) {
    let remainder = 0;
    for (let i = start; i < value.length; i += 1) {
      const acc = remainder * base + value[i];
      value[i] = Math.floor(acc / 256);
      remainder = acc % 256;
    }
    out.push(remainder);
    while (start < value.length && value[start] === 0) {
      start += 1;
    }
  }
  for (let i = 0; i < leading; i += 1) {
    out.push(0);
  }
  out.reverse();
  return Uint8Array.from(out);
}
function convertToBase32(data) {
  const bytes = Array.from(data);
  let acc = 0;
  let bits = 0;
  const out = [];
  for (const byte of bytes) {
    acc = acc << 8 | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out.push(acc >> bits & 31);
    }
  }
  if (bits > 0) {
    out.push(acc << 5 - bits & 31);
  }
  return out;
}
function bech32Polymod(values) {
  const generators = [996825010, 642813549, 513874426, 1027748829, 705979059];
  let chk = 1;
  for (const value of values) {
    const top = chk >> 25;
    chk = (chk & 33554431) << 5 ^ value;
    generators.forEach((generator, idx) => {
      if (top >> idx & 1) {
        chk ^= generator;
      }
    });
  }
  return chk;
}
function expandHrp(hrp) {
  const out = [];
  for (const ch of hrp) {
    const code = ch.codePointAt(0);
    out.push(code >> 5);
  }
  out.push(0);
  for (const ch of hrp) {
    out.push(ch.codePointAt(0) & 31);
  }
  return out;
}
function bech32mChecksum(data) {
  const values = expandHrp("snx");
  values.push(...data);
  values.push(...Array(I105_CHECKSUM_LEN).fill(0));
  const polymod = bech32Polymod(values) ^ BECH32M_CONST;
  const result = [];
  for (let i = 0; i < I105_CHECKSUM_LEN; i += 1) {
    result.push(polymod >> 5 * (I105_CHECKSUM_LEN - 1 - i) & 31);
  }
  return result;
}
function i105ChecksumDigits(canonical) {
  const base32 = convertToBase32(canonical);
  return bech32mChecksum(base32);
}

// ../iroha/javascript/iroha_js/dist/sccp.js
var SCCP_DOMAIN_SORA = 0;
var SCCP_DOMAIN_ETH = 1;
var SCCP_DOMAIN_BSC = 2;
var SCCP_DOMAIN_SOL = 3;
var SCCP_DOMAIN_TON = 4;
var SCCP_DOMAIN_TRON = 5;
var SCCP_CODEC_TEXT_UTF8 = 1;
var SCCP_CODEC_EVM_HEX = 2;
var SCCP_CODEC_SOLANA_BASE58 = 3;
var SCCP_CODEC_TON_RAW = 4;
var SCCP_CODEC_TRON_BASE58CHECK = 5;
var SCCP_CODEC_SORA_ASSET_ID = 6;
var SCCP_ETH_MAINNET_NETWORK_ID = "0x0000000000000000000000000000000000000000000000000000000000000001";
var SCCP_BSC_MAINNET_NETWORK_ID = "0x0000000000000000000000000000000000000000000000000000000000000038";
var SCCP_BSC_TESTNET_NETWORK_ID = "0x0000000000000000000000000000000000000000000000000000000000000061";
var SCCP_STARK_FRI_PROOF_FAMILY_V1 = "stark-fri-v1";
var SCCP_SOURCE_STATE_MAX_PROOF_BYTES = 2 * 1024 * 1024;
var SCCP_NATIVE_RECURSIVE_MAX_PROOF_BYTES = 2 * 1024 * 1024;
var SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1 = "evm-groth16-bn254-v1";
var SCCP_ETH_NATIVE_EVM_PROVER_PARITY_SCHEMA_V1 = "sccp-ethereum-mainnet-native-evm-cross-sdk-parity-v1";
var SCCP_ETH_NATIVE_EVM_PROVER_PARITY_FIXTURE_SCHEMA_V1 = "sccp-ethereum-mainnet-native-evm-cross-sdk-fixture-parity-v1";
var SCCP_ETH_NATIVE_EVM_PROVER_SELF_TEST_SCHEMA_V1 = "sccp-ethereum-mainnet-native-evm-prover-self-test-v1";
var SCCP_ETH_NATIVE_EVM_PROVER_BUNDLE_ID_V1 = "sccp:eth:native-evm-groth16-prover:ethereum-mainnet:v1";
var SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_PARITY_SCHEMA_V1 = "sccp-bsc-testnet-native-evm-cross-sdk-parity-v1";
var SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_PARITY_FIXTURE_SCHEMA_V1 = "sccp-bsc-testnet-native-evm-cross-sdk-fixture-parity-v1";
var SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_SELF_TEST_SCHEMA_V1 = "sccp-bsc-testnet-native-evm-prover-self-test-v1";
var SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1 = "sccp:bsc:native-evm-groth16-prover:bsc-testnet:v1";
var SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_PARITY_SCHEMA_V1 = "sccp-bsc-mainnet-native-evm-cross-sdk-parity-v1";
var SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_PARITY_FIXTURE_SCHEMA_V1 = "sccp-bsc-mainnet-native-evm-cross-sdk-fixture-parity-v1";
var SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_SELF_TEST_SCHEMA_V1 = "sccp-bsc-mainnet-native-evm-prover-self-test-v1";
var SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1 = "sccp:bsc:native-evm-groth16-prover:bsc-mainnet:v1";
var SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1 = Object.freeze({
  javascript: "pure-typescript",
  swift: "native-swift",
  kotlin: "native-kotlin",
  "java-android": "native-java",
  dotnet: "native-csharp"
});
var SCCP_SUBMIT_MESSAGE_PROOF_ABI_V1 = "submitSccpMessageProof(bytes,bytes32[6],bytes32)";
var SCCP_SOLANA_ACCOUNTS_LT_HASH_OPEN_VERIFY_CIRCUIT_ID_V1 = "sccp-solana-accounts-lt-hash-v1";
var SCCP_SOLANA_TOWER_REPLAY_OPEN_VERIFY_CIRCUIT_ID_V1 = "sccp-solana-tower-replay-v1";
var SCCP_SOLANA_FULL_ACCOUNTSDB_LATTICE_OPEN_VERIFY_CIRCUIT_ID_V1 = "sccp-solana-full-accountsdb-lattice-v1";
var SCCP_SOLANA_BANK_FORK_CHOICE_OPEN_VERIFY_CIRCUIT_ID_V1 = "sccp-solana-bank-fork-choice-v1";
var SCCP_SOLANA_TEMPLATE_SOURCE_TRUST_ANCHOR_HASH_V1 = "0x113bdb7601d84f2098daec386346a7123857d181b3ac5bd23df50fa9e1b2cbe3";
var SCCP_SOLANA_TEMPLATE_CONSENSUS_VERIFIER_HASH_V1 = "0x97ea89019e6c79305d06dfc27640ee14a6b42ba6eaf86e1835ee9b433dba48ba";
var SCCP_SOLANA_TEMPLATE_MESSAGE_INCLUSION_VERIFIER_HASH_V1 = "0xb8358bfef1e428a6a7e9115687cb2b88d9c21dad4021bea3e11d43489eb3dcb0";
var SCCP_SOLANA_TEMPLATE_SOURCE_STATE_VERIFIER_HASH_V1 = "0x6b4e4106bbb6b343ae1a4a36c9c68756d4454d2167c9b8b2ee3225e39fb0a48b";
var SCCP_SOLANA_TEMPLATE_FINALITY_POLICY_HASH_V1 = "0x9df7ea90cf1bbba036788b14804f63f4be1e908390be89524fd4486f74344f56";
var SCCP_SOLANA_MAINNET_TOWER_REPLAY_VERIFIER_ID_V1 = "sccp:sol:light-client:tower-replay-mainnet-beta:v1";
var SCCP_SOLANA_MAINNET_FULL_ACCOUNTSDB_LATTICE_VERIFIER_ID_V1 = "sccp:sol:light-client:full-accountsdb-lattice-mainnet-beta:v1";
var SCCP_SOLANA_MAINNET_BANK_FORK_CHOICE_VERIFIER_ID_V1 = "sccp:sol:light-client:bank-fork-choice-mainnet-beta:v1";
var SCCP_SOLANA_TOWER_LOCKOUT_CONFIRMATION_DEPTH = 32n;
var SCCP_SOLANA_TOWER_VOTE_STACK_DEPTH = SCCP_SOLANA_TOWER_LOCKOUT_CONFIRMATION_DEPTH - 1n;
var SCCP_GOVERNED_SOLANA_FULL_LIGHT_CLIENT_AUDIT_HASHES_V1 = [
  `0x${"b7".repeat(32)}`,
  `0x${"c8".repeat(32)}`,
  `0x${"d9".repeat(32)}`
];
var SCCP_GOVERNED_TON_FULL_LIGHT_CLIENT_AUDIT_HASHES_V1 = [
  `0x${"26".repeat(32)}`,
  `0x${"27".repeat(32)}`,
  `0x${"28".repeat(32)}`
];
var SCCP_TON_CHUNKED_MESSAGE_DEFAULT_CHUNK_BYTES_V1 = 24 * 1024;
var SCCP_TON_CHUNKED_MESSAGE_MAX_CHUNK_BYTES_V1 = 32 * 1024;
var SCCP_TON_WALLET_PAYLOAD_SAFE_BYTES_V1 = 48 * 1024;
var SCCP_TON_SHARD_STATE_OPEN_VERIFY_CIRCUIT_ID_V1 = "sccp-ton-shard-state-light-client-v1";
var SCCP_TON_MASTERCHAIN_CONFIG_OPEN_VERIFY_CIRCUIT_ID_V1 = "sccp-ton-masterchain-config-v1";
var SCCP_TON_VALIDATOR_SET_TRANSITION_OPEN_VERIFY_CIRCUIT_ID_V1 = "sccp-ton-validator-set-transition-v1";
var SCCP_TON_SHARD_ACCOUNTS_DICTIONARY_OPEN_VERIFY_CIRCUIT_ID_V1 = "sccp-ton-shard-accounts-dictionary-v1";
var SCCP_TON_MAINNET_MASTERCHAIN_CONFIG_VERIFIER_ID_V1 = "sccp:ton:light-client:masterchain-config-mainnet:v1";
var SCCP_TON_MAINNET_VALIDATOR_SET_TRANSITION_VERIFIER_ID_V1 = "sccp:ton:light-client:validator-set-transition-mainnet:v1";
var SCCP_TON_MAINNET_SHARD_ACCOUNTS_DICTIONARY_VERIFIER_ID_V1 = "sccp:ton:light-client:shard-accounts-dictionary-mainnet:v1";
var SCCP_TAIRA_NETWORK_PREFIX_V1 = 369;
var SCCP_TAIRA_TON_XOR_ROUTE_ID_V1 = "taira_ton_xor";
var SCCP_TAIRA_XOR_ASSET_KEY_V1 = "xor";
var TAIRA_XOR_FINALIZE_FROM_TAIRA_ABI_V1 = "finalizeFromTaira(bytes,bytes32[6],bytes32,bytes)";
var TAIRA_XOR_BURN_TO_TAIRA_ABI_V1 = "burnToTaira(bytes32,bytes32,bytes,uint256)";
var SCCP_MSG_PREFIX_TRANSFER_V1 = "sccp:transfer:v1";
var SCCP_HUB_LEAF_PREFIX_V1 = "sccp:hub:leaf:v1";
var SCCP_HUB_NODE_PREFIX_V1 = "sccp:hub:node:v1";
var SCCP_PAYLOAD_HASH_PREFIX_V1 = "sccp:payload:v1";
var SCCP_EVM_DESTINATION_BINDING_LABEL_V1 = "iroha:sccp:evm-destination-binding:v1";
var SCCP_ETH_MAINNET_SLOTS_PER_EPOCH = 32;
var SCCP_ETH_MAINNET_EPOCHS_PER_SYNC_COMMITTEE_PERIOD = 256;
var SCCP_ETH_MAINNET_SLOTS_PER_SYNC_COMMITTEE_PERIOD = SCCP_ETH_MAINNET_SLOTS_PER_EPOCH * SCCP_ETH_MAINNET_EPOCHS_PER_SYNC_COMMITTEE_PERIOD;
var SCCP_SOURCE_HEADER_PREFIX_V1 = "sccp:source:header:v1";
var SCCP_SOURCE_EVENT_LEAF_PREFIX_V1 = "sccp:source:event-leaf:v1";
var SCCP_SOURCE_NODE_PREFIX_V1 = "sccp:source:node:v1";
var SCCP_SOLANA_LT_HASH_ELEMENTS = 1024;
var SCCP_SOLANA_ACCOUNTS_LT_HASH_BYTES = SCCP_SOLANA_LT_HASH_ELEMENTS * 2;
var SCCP_SOLANA_STAKE_STATE_V2_LEGACY_WARMUP_COOLDOWN_RATE_BYTES = new Uint8Array([0, 0, 0, 0, 0, 0, 208, 63]);
var SCCP_SOLANA_STAKE_STATE_V2_CURRENT_WARMUP_COOLDOWN_RATE_BYTES = new Uint8Array([10, 215, 163, 112, 61, 10, 183, 63]);
var SOLANA_BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
var SOLANA_BASE58_INDEX = new Map(
  Array.from(SOLANA_BASE58_ALPHABET, (char, index) => [char, BigInt(index)])
);
var SCCP_TON_TEMPLATE_SOURCE_STATE_VERIFIER_HASH_V1 = "0x540205f876591604ccf39f72a051ac5e82647c9e48dbd48cb129d2543971a34f";
var SCCP_TON_TEMPLATE_COMPONENT_HASHES_V1 = /* @__PURE__ */ new Map([
  [
    "sourceTrustAnchorHash",
    "0xd83b3a3eb920ac8338533535cf0d6c69c69d507e84aef8ec2094564b8427c56c"
  ],
  [
    "consensusVerifierHash",
    "0xb0225e16477ea3420f7d0de76b87b6e99a43ab97f445d8565a384d4b655bc473"
  ],
  [
    "messageInclusionVerifierHash",
    "0x89254256421c15da8c92842c7d6f448ef6c1d5ca1e2a173754643425fcee6353"
  ],
  ["sourceStateVerifierHash", SCCP_TON_TEMPLATE_SOURCE_STATE_VERIFIER_HASH_V1],
  [
    "finalityPolicyHash",
    "0x50044ee6db0eb0cdef097e69406b6c30d3406d8f784e8ba34e9b923b38bd0c43"
  ]
]);
var SCCP_TON_TEMPLATE_SOURCE_MATERIAL_HASHES_V1 = new Set(
  SCCP_TON_TEMPLATE_COMPONENT_HASHES_V1.values()
);
var SCCP_SOLANA_TEMPLATE_COMPONENT_HASHES_V1 = /* @__PURE__ */ new Map([
  ["sourceTrustAnchorHash", SCCP_SOLANA_TEMPLATE_SOURCE_TRUST_ANCHOR_HASH_V1],
  ["consensusVerifierHash", SCCP_SOLANA_TEMPLATE_CONSENSUS_VERIFIER_HASH_V1],
  [
    "messageInclusionVerifierHash",
    SCCP_SOLANA_TEMPLATE_MESSAGE_INCLUSION_VERIFIER_HASH_V1
  ],
  [
    "sourceStateVerifierHash",
    SCCP_SOLANA_TEMPLATE_SOURCE_STATE_VERIFIER_HASH_V1
  ],
  ["finalityPolicyHash", SCCP_SOLANA_TEMPLATE_FINALITY_POLICY_HASH_V1]
]);
var SCCP_SOLANA_TEMPLATE_SOURCE_MATERIAL_HASHES_V1 = new Set(
  SCCP_SOLANA_TEMPLATE_COMPONENT_HASHES_V1.values()
);
var SCCP_TON_BOC_MAGIC = Uint8Array.from([181, 238, 156, 114]);
var SCCP_TON_MAX_BOC_BYTES = 64 * 1024;
var SCCP_MAX_SOURCE_MERKLE_BRANCH_NODES = 64;
var SCCP_ETH_BEACON_REST_MAX_RESPONSE_BYTES = 1024 * 1024;
var SCCP_ETH_MAINNET_SYNC_COMMITTEE_AUTHORITIES = 512;
var SCCP_ETH_MAX_SYNC_COMMITTEE_AUTHORITIES = SCCP_ETH_MAINNET_SYNC_COMMITTEE_AUTHORITIES;
var SCCP_ETH_SYNC_COMMITTEE_PUBLIC_KEY_BYTES = 48;
var SCCP_ETH_SYNC_COMMITTEE_POP_BYTES = 96;
var SCCP_ETH_MAX_SYNC_COMMITTEE_PAYLOAD_BYTES = 1 + 4 + SCCP_ETH_MAX_SYNC_COMMITTEE_AUTHORITIES * (4 + SCCP_ETH_SYNC_COMMITTEE_PUBLIC_KEY_BYTES + 8 + 4 + SCCP_ETH_SYNC_COMMITTEE_POP_BYTES);
var SCCP_ETH_MAX_SYNC_COMMITTEE_SIGNERS_BITMAP_BYTES = Math.ceil(
  SCCP_ETH_MAX_SYNC_COMMITTEE_AUTHORITIES / 8
);
var SCCP_BSC_PARLIA_VALIDATOR_ADDRESS_BYTES = 20;
var SCCP_BSC_MAX_PARLIA_VALIDATORS = 255;
var SCCP_BSC_MAX_VALIDATOR_SET_PAYLOAD_BYTES = 1 + 4 + SCCP_BSC_MAX_PARLIA_VALIDATORS * (SCCP_BSC_PARLIA_VALIDATOR_ADDRESS_BYTES + 8);
var SCCP_EVM_MAX_RECEIPT_VALUE_BYTES = 16 * 1024;
var SCCP_TRON_MAX_MPT_NODE_BYTES = 16 * 1024;
var SCCP_TRON_MAX_RAW_HEADER_BYTES = 16 * 1024;
var SCCP_TRON_MAX_RECEIPT_VALUE_BYTES = 16 * 1024;
var SCCP_TRON_MAX_TRANSACTION_BYTES = 64 * 1024;
var SCCP_U64_MAX = (1n << 64n) - 1n;
var SCCP_U128_MAX = (1n << 128n) - 1n;
var SCCP_I64_MAX = (1n << 63n) - 1n;
var NORITO_COMPACT_LEN_FLAG = 2;
var NORITO_CRC64_REFLECTED_POLY = 0xc96c5795d7870f42n;
var SCCP_SOURCE_CHAIN_PROOF_ENVELOPE_SCHEMA_HASH_HEX = "7a27db10248ac178129ff7397f9a1ce7";
var SCCP_SOURCE_EVENT_DIGEST_PREFIX_V1 = "sccp:source:event:v1";
var NORITO_CRC64_TABLE = (() => {
  const table = new Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = BigInt(index);
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1n) !== 0n ? crc >> 1n ^ NORITO_CRC64_REFLECTED_POLY : crc >> 1n;
    }
    table[index] = crc;
  }
  return table;
})();
var SCCP_SECP256K1_SCALAR_ORDER_BE = Uint8Array.from([
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  254,
  186,
  174,
  220,
  230,
  175,
  72,
  160,
  59,
  191,
  210,
  94,
  140,
  208,
  54,
  65,
  65
]);
var SCCP_SECP256K1_SCALAR_HALF_ORDER_BE = Uint8Array.from([
  127,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  93,
  87,
  110,
  115,
  87,
  164,
  80,
  29,
  223,
  233,
  47,
  70,
  104,
  27,
  32,
  160
]);
var SCCP_BSC_GROTH16_PUBLIC_SIGNAL_NAMES_V1 = Object.freeze([
  "message_id",
  "payload_hash",
  "target_domain",
  "commitment_root",
  "finality_height",
  "finality_block_hash",
  "source_domain",
  "statement_hash",
  "destination_binding_hash"
]);
var textEncoder = new TextEncoder();
var textDecoder = new TextDecoder("utf-8", { fatal: true });
var normalizeHexInput = (value, label, byteLength = null) => {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a hex string`);
  }
  if (value.trim() !== value) {
    throw new TypeError(`${label} must be canonical hex`);
  }
  const trimmed = value.startsWith("0x") ? value.slice(2) : value;
  if (!trimmed || /[^0-9a-f]/.test(trimmed) || trimmed.length % 2 !== 0) {
    throw new TypeError(`${label} must be canonical hex`);
  }
  if (byteLength !== null && trimmed.length !== byteLength * 2) {
    throw new TypeError(`${label} must be ${byteLength} bytes`);
  }
  return trimmed;
};
var hexToBytes2 = (value, label, byteLength = null) => {
  const normalized = normalizeHexInput(value, label, byteLength);
  const out = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < normalized.length; index += 2) {
    out[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }
  return out;
};
var bytesToHex2 = (bytes, withPrefix = true) => {
  const hex = Array.from(
    bytes,
    (byte) => byte.toString(16).padStart(2, "0")
  ).join("");
  return withPrefix ? `0x${hex}` : hex;
};
var SCCP_SUBMIT_MESSAGE_PROOF_SELECTOR_BYTES_V1 = keccak_256(
  textEncoder.encode(SCCP_SUBMIT_MESSAGE_PROOF_ABI_V1)
).slice(0, 4);
var SCCP_SUBMIT_MESSAGE_PROOF_SELECTOR_V1 = bytesToHex2(
  SCCP_SUBMIT_MESSAGE_PROOF_SELECTOR_BYTES_V1
);
var TAIRA_XOR_FINALIZE_FROM_TAIRA_SELECTOR_BYTES_V1 = keccak_256(
  textEncoder.encode(TAIRA_XOR_FINALIZE_FROM_TAIRA_ABI_V1)
).slice(0, 4);
var TAIRA_XOR_BURN_TO_TAIRA_SELECTOR_BYTES_V1 = keccak_256(
  textEncoder.encode(TAIRA_XOR_BURN_TO_TAIRA_ABI_V1)
).slice(0, 4);
var TAIRA_XOR_FINALIZE_FROM_TAIRA_SELECTOR_V1 = bytesToHex2(
  TAIRA_XOR_FINALIZE_FROM_TAIRA_SELECTOR_BYTES_V1
);
var TAIRA_XOR_BURN_TO_TAIRA_SELECTOR_V1 = bytesToHex2(
  TAIRA_XOR_BURN_TO_TAIRA_SELECTOR_BYTES_V1
);
var concatBytes2 = (...parts) => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};
var bytesEqual2 = (left, right) => {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
};
var copyBytes = (bytes) => new Uint8Array(bytes);
var sourceStateProverRequestByteFields = Object.freeze(
  /* @__PURE__ */ new Set([
    "statementBytes",
    "statement_bytes",
    "accountCommitmentBytes",
    "account_commitment_bytes",
    "witnessCommitmentBytes",
    "witness_commitment_bytes",
    "verificationContextBytes",
    "verification_context_bytes",
    "schemaDescriptor",
    "schema_descriptor"
  ])
);
var writeU8 = (target, value) => {
  const out = new Uint8Array(1);
  out[0] = value;
  return concatBytes2(target, out);
};
var writeU32Le = (target, value) => {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, Number(value), true);
  return concatBytes2(target, out);
};
var writeU64Le = (target, value) => {
  const out = new Uint8Array(8);
  const view = new DataView(out.buffer);
  view.setBigUint64(0, normalizeUnsignedBigInt(value, "u64"), true);
  return concatBytes2(target, out);
};
var readU64LeAt = (bytes, offset, label) => {
  if (offset + 8 > bytes.length) {
    throw new TypeError(`${label} is too short`);
  }
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getBigUint64(
    0,
    true
  );
};
var abiWordU32 = (value, label = "u32") => {
  const out = new Uint8Array(32);
  new DataView(out.buffer).setUint32(
    28,
    normalizeSccpDomainId(value, label),
    false
  );
  return out;
};
var abiWordAddress20 = (value, label = "address") => {
  if (!(value instanceof Uint8Array) || value.length !== 20) {
    throw new TypeError(`${label} must be 20 bytes`);
  }
  const out = new Uint8Array(32);
  out.set(value, 12);
  return out;
};
var writeU128Le = (target, value) => {
  const numeric = normalizeUnsignedBigInt(value, "u128");
  const out = new Uint8Array(16);
  let working = numeric;
  for (let index = 0; index < 16; index += 1) {
    out[index] = Number(working & 0xffn);
    working >>= 8n;
  }
  return concatBytes2(target, out);
};
var writeBytes = (target, value) => {
  const bytes = toBytes2(value, "bytes");
  return concatBytes2(writeU32Le(target, bytes.length), bytes);
};
var isCanonicalDecimalText = (value) => value === "0" || /^[1-9][0-9]*$/.test(value);
var normalizeUnsignedBigInt = (value, label) => {
  if (typeof value === "bigint") {
    if (value < 0n) throw new RangeError(`${label} must not be negative`);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0 || !Number.isSafeInteger(value)) {
      throw new RangeError(`${label} must be a non-negative safe integer`);
    }
    return BigInt(value);
  }
  if (typeof value === "string") {
    if (!isCanonicalDecimalText(value)) {
      throw new TypeError(`${label} must be an unsigned integer`);
    }
    return BigInt(value);
  }
  throw new TypeError(`${label} must be an unsigned integer`);
};
var normalizeUnsignedBigIntMax = (value, label, max, typeLabel) => {
  const numeric = normalizeUnsignedBigInt(value, label);
  if (numeric > max) {
    throw new RangeError(`${label} must fit ${typeLabel}`);
  }
  return numeric;
};
var normalizeV1Version = (value, label, ErrorCtor = RangeError) => {
  if (value === null) {
    throw new TypeError(`${label} must be 1`);
  }
  const version = normalizeUnsignedBigInt(
    value === void 0 ? 1 : value,
    label
  );
  if (version !== 1n) {
    throw new ErrorCtor(`${label} must be 1`);
  }
  return 1;
};
var normalizeSignedI32 = (value, label) => {
  if (typeof value === "bigint") {
    if (value < -2147483648n || value > 2147483647n) {
      throw new RangeError(`${label} must fit i32`);
    }
    return Number(value);
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) {
      throw new RangeError(`${label} must fit i32`);
    }
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^-?\d+$/.test(trimmed)) {
      throw new TypeError(`${label} must be a signed integer`);
    }
    return normalizeSignedI32(BigInt(trimmed), label);
  }
  throw new TypeError(`${label} must be a signed integer`);
};
var prefixedKeccak = (prefix, payload) => keccak_256(concatBytes2(textEncoder.encode(prefix), payload));
var prefixedBlake2b = (prefix, payload) => blake2b2(concatBytes2(textEncoder.encode(prefix), payload), { dkLen: 32 });
var SCCP_OPTIONAL_FIELD_MISSING = Symbol("sccpOptionalFieldMissing");
var optionalResultField = (value, ...names) => {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(value, name)) return value[name];
  }
  return SCCP_OPTIONAL_FIELD_MISSING;
};
var strictOptionalResultField = (value, label, ...names) => {
  const present = names.filter(
    (name) => Object.prototype.hasOwnProperty.call(value, name)
  );
  if (present.length > 1) {
    throw new TypeError(`${label} must not use multiple aliases`);
  }
  return present.length === 0 ? SCCP_OPTIONAL_FIELD_MISSING : value[present[0]];
};
var strictResultField = (value, label, ...names) => {
  const selected = strictOptionalResultField(value, label, ...names);
  return selected === SCCP_OPTIONAL_FIELD_MISSING ? void 0 : selected;
};
var nonZeroHex32Bytes = (value, label) => {
  const bytes = hexToBytes2(value, label, 32);
  if (bytes.every((byte) => byte === 0)) {
    throw new TypeError(`${label} must not be zero`);
  }
  return bytes;
};
var normalizeNonZeroHex32 = (value, label) => bytesToHex2(nonZeroHex32Bytes(value, label));
var BSC_GROTH16_SMOKE_FIXTURE_G1 = Object.freeze([1n, 2n]);
var BSC_GROTH16_SMOKE_FIXTURE_G2 = Object.freeze([
  10857046999023057135944570762232829481370756359578518086990519993285655852781n,
  11559732032986387107991004021392285783925812861821192530917403151452391805634n,
  8495653923123431417604973247489272438418190587263600148770280649306958101930n,
  4082367875863433681332203403145435568316851327593401208105741076214120093531n
]);
var normalizeNonEmptyString = (value, label) => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
};
var decodeSolanaBase58 = (value, label) => {
  const text = normalizeNonEmptyString(value, label);
  let numeric = 0n;
  for (const char of text) {
    const digit = SOLANA_BASE58_INDEX.get(char);
    if (digit === void 0) {
      throw new TypeError(`${label} must be canonical base58`);
    }
    numeric = numeric * 58n + digit;
  }
  let leadingZeros = 0;
  while (leadingZeros < text.length && text[leadingZeros] === "1") {
    leadingZeros += 1;
  }
  let payload = new Uint8Array();
  if (numeric !== 0n) {
    const hex = numeric.toString(16);
    payload = hexToBytes2(hex.length % 2 === 0 ? hex : `0${hex}`, label);
  }
  return concatBytes2(new Uint8Array(leadingZeros), payload);
};
var decodeTronBase58CheckPayload = (value, label) => {
  if (typeof value !== "string" || value === "") {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  if (value.trim() !== value) {
    throw new TypeError(`${label} must be a canonical base58check address`);
  }
  const text = value;
  const decoded = decodeSolanaBase58(text, label);
  if (decoded.length < 5) {
    throw new TypeError(`${label} must be a base58check address`);
  }
  const payload = decoded.slice(0, -4);
  const checksum = decoded.slice(-4);
  const expected = sha2562(sha2562(payload)).slice(0, 4);
  if (!bytesEqual2(checksum, expected)) {
    throw new TypeError(`${label} must have a valid base58check checksum`);
  }
  if (payload.length !== 21 || payload[0] !== 65) {
    throw new TypeError(`${label} must use TRON 0x41 prefix`);
  }
  if (!payload.slice(1).some((byte) => byte !== 0)) {
    throw new TypeError(`${label} must not be zero`);
  }
  return payload;
};
var normalizeTokenMessagePayload = (payload) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("token message payload must be an object");
  }
  if (typeof payload.kind === "string" && payload.value && typeof payload.value === "object") {
    return {
      kind: payload.kind,
      value: payload.value
    };
  }
  if ("TokenAdd" in payload) {
    return { kind: "TokenAdd", value: payload.TokenAdd };
  }
  if ("TokenPause" in payload) {
    return { kind: "TokenPause", value: payload.TokenPause };
  }
  if ("TokenResume" in payload) {
    return { kind: "TokenResume", value: payload.TokenResume };
  }
  throw new TypeError(
    "token message payload must be TokenAdd, TokenPause, or TokenResume"
  );
};
var messageKindCode = (kind) => {
  switch (kind) {
    case "Burn":
      return 0;
    case "TokenAdd":
      return 1;
    case "TokenPause":
      return 2;
    case "TokenResume":
      return 3;
    case "AssetRegister":
      return 4;
    case "RouteActivate":
      return 5;
    case "Transfer":
      return 6;
    default:
      throw new TypeError(`unsupported SCCP message kind: ${kind}`);
  }
};
var SCCP_SUPPORTED_DOMAINS = [
  SCCP_DOMAIN_SORA,
  SCCP_DOMAIN_ETH,
  SCCP_DOMAIN_BSC,
  SCCP_DOMAIN_SOL,
  SCCP_DOMAIN_TON,
  SCCP_DOMAIN_TRON
];
var isSupportedSccpDomain = (domainId) => {
  try {
    return SCCP_SUPPORTED_DOMAINS.includes(
      normalizeSccpDomainId(domainId, "domainId")
    );
  } catch (_error) {
    return false;
  }
};
var normalizeSccpCodecId = (value, label) => Number(normalizeUnsignedBigIntMax(value, label, 255n, "u8"));
var sccpCounterpartyAccountCodec = (domain) => {
  switch (domain) {
    case SCCP_DOMAIN_SORA:
      return SCCP_CODEC_TEXT_UTF8;
    case SCCP_DOMAIN_ETH:
    case SCCP_DOMAIN_BSC:
      return SCCP_CODEC_EVM_HEX;
    case SCCP_DOMAIN_SOL:
      return SCCP_CODEC_SOLANA_BASE58;
    case SCCP_DOMAIN_TON:
      return SCCP_CODEC_TON_RAW;
    case SCCP_DOMAIN_TRON:
      return SCCP_CODEC_TRON_BASE58CHECK;
    default:
      return null;
  }
};
var normalizeCanonicalTextBytes = (value, label) => {
  const text = normalizeNonEmptyString(value, label);
  if (text !== value) {
    throw new TypeError(`${label} must be canonical text`);
  }
  return textEncoder.encode(text);
};
var normalizeCanonicalTairaAccountId = (value, label) => {
  const text = normalizeNonEmptyString(value, label);
  if (text !== value) {
    throw new TypeError(`${label} must be canonical text`);
  }
  try {
    const address = AccountAddress.fromAccountId(
      text,
      SCCP_TAIRA_NETWORK_PREFIX_V1
    );
    if (address.toI105(SCCP_TAIRA_NETWORK_PREFIX_V1) !== text) {
      throw new TypeError(
        `${label} must use canonical TAIRA I105 account id form`
      );
    }
    return text;
  } catch (error) {
    if (error instanceof TypeError) {
      throw error;
    }
    throw new TypeError(`${label} must be a canonical TAIRA I105 account id`);
  }
};
var validateCanonicalEvmHexAddress = (text, label) => {
  if (!/^0x[0-9a-fA-F]{40}$/u.test(text)) {
    throw new TypeError(`${label} must be a 0x-prefixed 20-byte EVM address`);
  }
  const payload = text.slice(2);
  const lowercasePayload = payload.toLowerCase();
  const checksum = keccak_256(textEncoder.encode(lowercasePayload));
  for (let index = 0; index < payload.length; index += 1) {
    const char = payload[index];
    if (/[0-9]/u.test(char)) continue;
    const checksumByte = checksum[Math.floor(index / 2)];
    const checksumNibble = index % 2 === 0 ? checksumByte >> 4 : checksumByte & 15;
    const shouldBeUppercase = checksumNibble >= 8;
    if (shouldBeUppercase ? char !== char.toUpperCase() : char !== char.toLowerCase()) {
      throw new TypeError(`${label} must be a canonical EIP-55 EVM address`);
    }
  }
};
var decodeSolanaBase58FixedAllowZero = (value, label, byteLength) => {
  const text = normalizeNonEmptyString(value, label);
  if (text.length < 32 || text.length > 44) {
    throw new TypeError(
      `${label} must be a canonical 32-byte Solana base58 address`
    );
  }
  const bytes = decodeSolanaBase58(text, label);
  if (bytes.length !== byteLength) {
    throw new TypeError(`${label} must decode to ${byteLength} bytes`);
  }
  return bytes;
};
var validateCanonicalTonRawAddress = (text, label) => {
  const [workchain, accountHex, extra] = text.split(":");
  if (extra !== void 0 || accountHex === void 0) {
    throw new TypeError(`${label} must be workchain:account_hex`);
  }
  if (workchain === "" || workchain.startsWith("+") || workchain.startsWith("-") && (workchain.length === 1 || workchain.slice(1) === "0") || /^-?0[0-9]/u.test(workchain)) {
    throw new TypeError(`${label} workchain must be canonical i32`);
  }
  normalizeSignedI32(workchain, `${label} workchain`);
  if (accountHex.length !== 64 || /[^0-9a-f]/u.test(accountHex)) {
    throw new TypeError(`${label} account must be lowercase 32-byte hex`);
  }
};
var normalizeSccpCodecValueBytes = (value, codec, label) => {
  switch (codec) {
    case SCCP_CODEC_TEXT_UTF8:
      return normalizeCanonicalTextBytes(value, label);
    case SCCP_CODEC_EVM_HEX: {
      const text = normalizeNonEmptyString(value, label);
      if (text !== value) {
        throw new TypeError(`${label} must be canonical text`);
      }
      validateCanonicalEvmHexAddress(text, label);
      return textEncoder.encode(text);
    }
    case SCCP_CODEC_SOLANA_BASE58: {
      const text = normalizeNonEmptyString(value, label);
      if (text !== value) {
        throw new TypeError(`${label} must be canonical text`);
      }
      decodeSolanaBase58FixedAllowZero(text, label, 32);
      return textEncoder.encode(text);
    }
    case SCCP_CODEC_TON_RAW: {
      const text = normalizeNonEmptyString(value, label);
      if (text !== value) {
        throw new TypeError(`${label} must be canonical text`);
      }
      validateCanonicalTonRawAddress(text, label);
      return textEncoder.encode(text);
    }
    case SCCP_CODEC_TRON_BASE58CHECK: {
      const text = normalizeNonEmptyString(value, label);
      if (text !== value) {
        throw new TypeError(
          `${label} must be a canonical TRON base58check address`
        );
      }
      decodeTronBase58CheckPayload(text, label);
      return textEncoder.encode(text);
    }
    case SCCP_CODEC_SORA_ASSET_ID: {
      const bytes = toBytes2(value, label);
      if (bytes.length !== 32) {
        throw new TypeError(`${label} must be 32 bytes`);
      }
      return bytes;
    }
    default:
      throw new RangeError(`${label} codec is unsupported`);
  }
};
var normalizeTairaTonXorRouteIdInput = (input, label = "routeId") => {
  const selected = strictOptionalResultField(
    input,
    label,
    "routeId",
    "route_id"
  );
  const routeId = selected === SCCP_OPTIONAL_FIELD_MISSING ? SCCP_TAIRA_TON_XOR_ROUTE_ID_V1 : normalizeNonEmptyString(selected, label);
  if (routeId !== SCCP_TAIRA_TON_XOR_ROUTE_ID_V1) {
    throw new TypeError(`${label} must be ${SCCP_TAIRA_TON_XOR_ROUTE_ID_V1}`);
  }
  return routeId;
};
var normalizeTairaXorAssetKeyInput = (input, label = "assetKey") => {
  const selected = strictOptionalResultField(
    input,
    label,
    "assetKey",
    "asset_key",
    "assetId",
    "asset_id"
  );
  const assetKey = selected === SCCP_OPTIONAL_FIELD_MISSING ? SCCP_TAIRA_XOR_ASSET_KEY_V1 : normalizeNonEmptyString(selected, label);
  if (assetKey !== SCCP_TAIRA_XOR_ASSET_KEY_V1) {
    throw new TypeError(`${label} must be ${SCCP_TAIRA_XOR_ASSET_KEY_V1}`);
  }
  return assetKey;
};
var canonicalSccpTransferPayloadBytes = (payload) => {
  if (!payload || typeof payload !== "object") {
    throw new TypeError("payload must be an object");
  }
  const sourceDomain = normalizeSccpDomainId(
    payload.source_domain,
    "payload.source_domain"
  );
  const destDomain = normalizeSccpDomainId(
    payload.dest_domain,
    "payload.dest_domain"
  );
  if (sourceDomain === destDomain) {
    throw new RangeError(
      "payload.dest_domain must differ from payload.source_domain"
    );
  }
  const assetHomeDomain = normalizeSccpDomainId(
    payload.asset_home_domain,
    "payload.asset_home_domain"
  );
  const assetIdCodec = normalizeSccpCodecId(
    payload.asset_id_codec,
    "payload.asset_id_codec"
  );
  const senderCodec = normalizeSccpCodecId(
    payload.sender_codec,
    "payload.sender_codec"
  );
  const recipientCodec = normalizeSccpCodecId(
    payload.recipient_codec,
    "payload.recipient_codec"
  );
  const routeIdCodec = normalizeSccpCodecId(
    payload.route_id_codec,
    "payload.route_id_codec"
  );
  const expectedSenderCodec = sccpCounterpartyAccountCodec(sourceDomain);
  const expectedRecipientCodec = sccpCounterpartyAccountCodec(destDomain);
  if (senderCodec !== expectedSenderCodec) {
    throw new TypeError(
      "payload.sender_codec must match payload.source_domain"
    );
  }
  if (recipientCodec !== expectedRecipientCodec) {
    throw new TypeError(
      "payload.recipient_codec must match payload.dest_domain"
    );
  }
  const amount = normalizeUnsignedBigIntMax(
    payload.amount,
    "payload.amount",
    SCCP_U128_MAX,
    "u128"
  );
  if (amount === 0n) {
    throw new RangeError("payload.amount must be greater than zero");
  }
  let out = new Uint8Array();
  out = writeU8(out, normalizeV1Version(payload.version, "payload.version"));
  out = writeU32Le(out, sourceDomain);
  out = writeU32Le(out, destDomain);
  out = writeU64Le(
    out,
    normalizeUnsignedBigIntMax(
      payload.nonce,
      "payload.nonce",
      SCCP_U64_MAX,
      "u64"
    )
  );
  out = writeU32Le(out, assetHomeDomain);
  out = writeU8(out, assetIdCodec);
  out = writeBytes(
    out,
    normalizeSccpCodecValueBytes(
      payload.asset_id,
      assetIdCodec,
      "payload.asset_id"
    )
  );
  out = writeU128Le(out, amount);
  out = writeU8(out, senderCodec);
  out = writeBytes(
    out,
    normalizeSccpCodecValueBytes(payload.sender, senderCodec, "payload.sender")
  );
  out = writeU8(out, recipientCodec);
  out = writeBytes(
    out,
    normalizeSccpCodecValueBytes(
      payload.recipient,
      recipientCodec,
      "payload.recipient"
    )
  );
  out = writeU8(out, routeIdCodec);
  out = writeBytes(
    out,
    normalizeSccpCodecValueBytes(
      payload.route_id,
      routeIdCodec,
      "payload.route_id"
    )
  );
  return out;
};
var sccpTransferMessageId = (payload, options = {}) => bytesToHex2(
  prefixedKeccak(
    SCCP_MSG_PREFIX_TRANSFER_V1,
    canonicalSccpTransferPayloadBytes(payload)
  ),
  options.prefix !== false
);
var buildTairaXorTonToTairaTransferPayload = (input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError(
      "TAIRA XOR TON-source transfer payload input must be an object"
    );
  }
  const routeId = normalizeTairaTonXorRouteIdInput(input);
  const assetKey = normalizeTairaXorAssetKeyInput(input);
  const sender = normalizeTonRawAddress(
    strictResultField(
      input,
      "tonSender",
      "tonSender",
      "ton_sender",
      "sender",
      "senderAddress",
      "sender_address"
    ),
    "tonSender"
  );
  const recipient = normalizeCanonicalTairaAccountId(
    strictResultField(
      input,
      "tairaRecipient",
      "tairaRecipient",
      "taira_recipient",
      "recipient",
      "tairaAccountId",
      "taira_account_id"
    ),
    "tairaRecipient"
  );
  const amount = normalizeUnsignedBigIntMax(
    strictResultField(input, "amount", "amount"),
    "amount",
    SCCP_U128_MAX,
    "u128"
  );
  if (amount === 0n) {
    throw new RangeError("amount must be greater than zero");
  }
  const nonce = normalizeUnsignedBigIntMax(
    strictResultField(input, "nonce", "nonce"),
    "nonce",
    SCCP_U64_MAX,
    "u64"
  );
  return Object.freeze({
    version: 1,
    source_domain: SCCP_DOMAIN_TON,
    dest_domain: SCCP_DOMAIN_SORA,
    nonce: nonce.toString(),
    asset_home_domain: SCCP_DOMAIN_SORA,
    asset_id_codec: SCCP_CODEC_TEXT_UTF8,
    asset_id: assetKey,
    amount: amount.toString(),
    sender_codec: SCCP_CODEC_TON_RAW,
    sender,
    recipient_codec: SCCP_CODEC_TEXT_UTF8,
    recipient,
    route_id_codec: SCCP_CODEC_TEXT_UTF8,
    route_id: routeId
  });
};
var noritoU64Le = (value, label = "u64") => {
  const normalized = normalizeUnsignedBigIntMax(
    value,
    label,
    SCCP_U64_MAX,
    "u64"
  );
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, normalized, true);
  return out;
};
var noritoUnsignedLeb128 = (value, label = "length") => {
  let remaining = normalizeUnsignedBigIntMax(value, label, SCCP_U64_MAX, "u64");
  const out = [];
  do {
    let byte = Number(remaining & 0x7fn);
    remaining >>= 7n;
    if (remaining !== 0n) {
      byte |= 128;
    }
    out.push(byte);
  } while (remaining !== 0n);
  return Uint8Array.from(out);
};
var noritoLengthBytes = (length, compact, label = "length") => compact ? noritoUnsignedLeb128(length, label) : noritoU64Le(length, label);
var noritoField = (payload, compact, label = "field") => {
  const bytes = toBytes2(payload, label);
  return concatBytes2(
    noritoLengthBytes(bytes.length, compact, `${label}.length`),
    bytes
  );
};
var noritoStringValue = (value, compact, label) => noritoField(textEncoder.encode(value), compact, label);
var noritoCrc64Ecma = (payload) => {
  let crc = SCCP_U64_MAX;
  for (const byte of payload) {
    const index = Number((crc ^ BigInt(byte)) & 0xffn);
    crc = NORITO_CRC64_TABLE[index] ^ crc >> 8n;
  }
  return BigInt.asUintN(64, crc ^ SCCP_U64_MAX);
};
var noritoFrame = (payload, schemaHashHex, flags = 0) => concatBytes2(
  textEncoder.encode("NRT0"),
  Uint8Array.from([0, 0]),
  hexToBytes2(schemaHashHex, "Norito schema hash", 16),
  Uint8Array.from([0]),
  noritoU64Le(payload.length, "Norito payload length"),
  noritoU64Le(noritoCrc64Ecma(payload), "Norito payload CRC64"),
  Uint8Array.from([flags & 255]),
  payload
);
var noritoFramePayload = (data, expectedSchemaHashHex, label) => {
  const bytes = toBytes2(data, label);
  const headerLength = 40;
  if (bytes.length < headerLength) {
    throw new TypeError(`${label} must decode as SccpSourceChainProofEnvelopeV1`);
  }
  const magic = textEncoder.encode("NRT0");
  if (!bytesEqual2(bytes.slice(0, 4), magic) || bytes[4] !== 0 || bytes[5] !== 0) {
    throw new TypeError(`${label} must decode as SccpSourceChainProofEnvelopeV1`);
  }
  const schemaHash = bytes.slice(6, 22);
  if (!bytesEqual2(schemaHash, hexToBytes2(expectedSchemaHashHex, "Norito schema hash", 16))) {
    throw new TypeError(`${label} must decode as SccpSourceChainProofEnvelopeV1`);
  }
  const compression = bytes[22];
  if (compression !== 0) {
    throw new TypeError(`${label} must decode as SccpSourceChainProofEnvelopeV1`);
  }
  const payloadLength = readU64LeAt(bytes, 23, `${label}.payload_length`);
  if (payloadLength > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new TypeError(`${label} payload is too large`);
  }
  const payloadLengthNumber = Number(payloadLength);
  const checksum = readU64LeAt(bytes, 31, `${label}.checksum`);
  const flags = bytes[39];
  const supportedFlags = 1 | 2 | 4 | 32;
  if ((flags & ~supportedFlags) !== 0 || (flags & 32) !== 0 && (flags & 6) !== 6) {
    throw new TypeError(`${label} must decode as SccpSourceChainProofEnvelopeV1`);
  }
  const payloadStart = bytes.length - payloadLengthNumber;
  if (payloadStart < headerLength) {
    throw new TypeError(`${label} must decode as SccpSourceChainProofEnvelopeV1`);
  }
  for (const byte of bytes.slice(headerLength, payloadStart)) {
    if (byte !== 0) {
      throw new TypeError(`${label} must decode as SccpSourceChainProofEnvelopeV1`);
    }
  }
  const payload = bytes.slice(payloadStart);
  if (noritoCrc64Ecma(payload) !== checksum) {
    throw new TypeError(`${label} must decode as SccpSourceChainProofEnvelopeV1`);
  }
  return { payload, flags };
};
var noritoReader = (bytes, flags) => ({
  bytes,
  flags,
  offset: 0
});
var noritoReaderRemaining = (reader) => reader.bytes.length - reader.offset;
var noritoReadBytes = (reader, count, label) => {
  if (count < 0 || reader.offset + count > reader.bytes.length) {
    throw new TypeError(`${label} is too short`);
  }
  const out = reader.bytes.slice(reader.offset, reader.offset + count);
  reader.offset += count;
  return out;
};
var noritoReadU8 = (reader, label) => noritoReadBytes(reader, 1, label)[0];
var noritoReadU32 = (reader, label) => {
  const raw = noritoReadBytes(reader, 4, label);
  return new DataView(raw.buffer, raw.byteOffset, 4).getUint32(0, true);
};
var noritoReadU64 = (reader, label) => {
  const raw = noritoReadBytes(reader, 8, label);
  return new DataView(raw.buffer, raw.byteOffset, 8).getBigUint64(0, true);
};
var noritoReadVarint = (reader, label) => {
  let shift = 0n;
  let result = 0n;
  for (let index = 0; index < 10; index += 1) {
    const byte = noritoReadU8(reader, label);
    result |= BigInt(byte & 127) << shift;
    if ((byte & 128) === 0) {
      return result;
    }
    shift += 7n;
  }
  throw new TypeError(`${label} length is invalid`);
};
var noritoReadLength = (reader, compact, label) => compact ? noritoReadVarint(reader, label) : noritoReadU64(reader, label);
var noritoCheckedLength = (value, label) => {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new TypeError(`${label} is too large`);
  }
  return Number(value);
};
var noritoReadField = (reader, label, readPayload) => {
  const length = noritoCheckedLength(
    noritoReadLength(reader, (reader.flags & NORITO_COMPACT_LEN_FLAG) !== 0, `${label}.length`),
    label
  );
  const child = noritoReader(noritoReadBytes(reader, length, label), reader.flags);
  const value = readPayload(child);
  if (noritoReaderRemaining(child) !== 0) {
    throw new TypeError(`${label} must not contain trailing bytes`);
  }
  return value;
};
var noritoReadString = (reader, label) => {
  const length = noritoCheckedLength(
    noritoReadLength(reader, (reader.flags & NORITO_COMPACT_LEN_FLAG) !== 0, `${label}.length`),
    label
  );
  const raw = noritoReadBytes(reader, length, label);
  const value = textDecoder.decode(raw);
  if (!bytesEqual2(textEncoder.encode(value), raw)) {
    throw new TypeError(`${label} must be canonical UTF-8`);
  }
  return value;
};
var noritoReadRawByteVec = (reader, label) => {
  const length = noritoCheckedLength(noritoReadLength(reader, false, `${label}.length`), label);
  return noritoReadBytes(reader, length, label);
};
var noritoReadRawByteVecSequence = (reader, label) => {
  const count = noritoCheckedLength(noritoReadLength(reader, false, `${label}.length`), label);
  const values = [];
  for (let index = 0; index < count; index += 1) {
    values.push(
      noritoReadField(
        reader,
        `${label}[${index}]`,
        (child) => noritoReadRawByteVec(child, `${label}[${index}]`)
      )
    );
  }
  return values;
};
var sccpSourceChainKeyForDomain = (domain) => {
  switch (domain) {
    case SCCP_DOMAIN_SORA:
      return "sora";
    case SCCP_DOMAIN_ETH:
      return "eth";
    case SCCP_DOMAIN_BSC:
      return "bsc";
    case SCCP_DOMAIN_SOL:
      return "sol";
    case SCCP_DOMAIN_TON:
      return "ton";
    case SCCP_DOMAIN_TRON:
      return "tron";
    default:
      throw new TypeError("SCCP domain must be supported");
  }
};
var sccpSourceProofPlanCodeForDomain = (domain) => {
  switch (domain) {
    case SCCP_DOMAIN_ETH:
      return 1;
    case SCCP_DOMAIN_BSC:
      return 2;
    case SCCP_DOMAIN_SOL:
      return 3;
    case SCCP_DOMAIN_TON:
      return 4;
    case SCCP_DOMAIN_TRON:
      return 5;
    default:
      throw new TypeError("SCCP source domain must support source proofs");
  }
};
var sccpFinalityModelCodeForDomain = (domain) => {
  switch (domain) {
    case SCCP_DOMAIN_ETH:
      return 0;
    case SCCP_DOMAIN_BSC:
      return 1;
    case SCCP_DOMAIN_SOL:
      return 2;
    case SCCP_DOMAIN_TON:
      return 3;
    case SCCP_DOMAIN_TRON:
      return 4;
    default:
      throw new TypeError("SCCP source domain must support source proofs");
  }
};
var sccpSourceEventDigest = (sourceDomain, targetDomain, messageId, payloadHash) => bytesToHex2(
  prefixedBlake2b(
    SCCP_SOURCE_EVENT_DIGEST_PREFIX_V1,
    concatBytes2(
      Uint8Array.from([1]),
      writeU32Le(new Uint8Array(), sourceDomain),
      writeU32Le(new Uint8Array(), targetDomain),
      hexToBytes2(messageId, "sourceProofBytes.message_id", 32),
      hexToBytes2(payloadHash, "sourceProofBytes.payload_hash", 32)
    )
  )
);
var decodeSccpSourceChainProofSummary = (sourceProofBytes, label) => {
  const { payload, flags } = noritoFramePayload(
    sourceProofBytes,
    SCCP_SOURCE_CHAIN_PROOF_ENVELOPE_SCHEMA_HASH_HEX,
    label
  );
  const reader = noritoReader(payload, flags);
  const version = noritoReadField(
    reader,
    `${label}.version`,
    (child) => noritoReadU8(child, `${label}.version`)
  );
  if (version !== 1) {
    throw new TypeError(`${label}.version must be 1`);
  }
  const sourceDomain = noritoReadField(
    reader,
    `${label}.source_domain`,
    (child) => noritoReadU32(child, `${label}.source_domain`)
  );
  const targetDomain = noritoReadField(
    reader,
    `${label}.target_domain`,
    (child) => noritoReadU32(child, `${label}.target_domain`)
  );
  const sourceChain = noritoReadField(
    reader,
    `${label}.source_chain`,
    (child) => noritoReadString(child, `${label}.source_chain`)
  );
  const sourceProofPlan = noritoReadField(
    reader,
    `${label}.source_proof_plan`,
    (child) => noritoReadU32(child, `${label}.source_proof_plan`)
  );
  const finalityModel = noritoReadField(
    reader,
    `${label}.finality_model`,
    (child) => noritoReadU32(child, `${label}.finality_model`)
  );
  const messageId = noritoReadField(
    reader,
    `${label}.message_id`,
    (child) => bytesToHex2(noritoReadBytes(child, 32, `${label}.message_id`))
  );
  const payloadHash = noritoReadField(
    reader,
    `${label}.payload_hash`,
    (child) => bytesToHex2(noritoReadBytes(child, 32, `${label}.payload_hash`))
  );
  const sourceEventDigest = noritoReadField(
    reader,
    `${label}.source_event_digest`,
    (child) => bytesToHex2(noritoReadBytes(child, 32, `${label}.source_event_digest`))
  );
  const commitmentRoot = noritoReadField(
    reader,
    `${label}.commitment_root`,
    (child) => bytesToHex2(noritoReadBytes(child, 32, `${label}.commitment_root`))
  );
  const finalityHeight = noritoReadField(
    reader,
    `${label}.finality_height`,
    (child) => noritoReadU64(child, `${label}.finality_height`)
  );
  const finalityBlockHash = noritoReadField(
    reader,
    `${label}.finality_block_hash`,
    (child) => bytesToHex2(noritoReadBytes(child, 32, `${label}.finality_block_hash`))
  );
  const finalizedHeaderHash = noritoReadField(
    reader,
    `${label}.finalized_header_hash`,
    (child) => bytesToHex2(noritoReadBytes(child, 32, `${label}.finalized_header_hash`))
  );
  const receiptOrMessageRoot = noritoReadField(
    reader,
    `${label}.receipt_or_message_root`,
    (child) => bytesToHex2(noritoReadBytes(child, 32, `${label}.receipt_or_message_root`))
  );
  const consensusProof = noritoReadField(
    reader,
    `${label}.consensus_proof`,
    (child) => noritoReadRawByteVec(child, `${label}.consensus_proof`)
  );
  const messageInclusionProof = noritoReadField(
    reader,
    `${label}.message_inclusion_proof`,
    (child) => noritoReadRawByteVec(child, `${label}.message_inclusion_proof`)
  );
  const inclusionBranch = noritoReadField(
    reader,
    `${label}.inclusion_branch`,
    (child) => noritoReadRawByteVecSequence(child, `${label}.inclusion_branch`)
  );
  if (noritoReaderRemaining(reader) !== 0) {
    throw new TypeError(`${label} must not contain trailing bytes`);
  }
  if (sourceDomain === SCCP_DOMAIN_SORA) {
    throw new TypeError(`${label}.source_domain must not be SORA`);
  }
  if (!isSupportedSccpDomain(sourceDomain)) {
    throw new TypeError(`${label}.source_domain must be a supported SCCP domain`);
  }
  if (!isSupportedSccpDomain(targetDomain)) {
    throw new TypeError(`${label}.target_domain must be a supported SCCP domain`);
  }
  if (sourceDomain === targetDomain) {
    throw new TypeError(`${label}.target_domain must differ from source_domain`);
  }
  if (sourceChain !== sccpSourceChainKeyForDomain(sourceDomain)) {
    throw new TypeError(`${label}.source_chain must match source_domain`);
  }
  if (sourceProofPlan !== sccpSourceProofPlanCodeForDomain(sourceDomain)) {
    throw new TypeError(`${label}.source_proof_plan must match source_domain`);
  }
  if (finalityModel !== sccpFinalityModelCodeForDomain(sourceDomain)) {
    throw new TypeError(`${label}.finality_model must match source_domain`);
  }
  if (finalityHeight === 0n) {
    throw new TypeError(`${label}.finality_height must not be zero`);
  }
  for (const [field, value] of [
    ["message_id", messageId],
    ["payload_hash", payloadHash],
    ["source_event_digest", sourceEventDigest],
    ["commitment_root", commitmentRoot],
    ["finality_block_hash", finalityBlockHash],
    ["finalized_header_hash", finalizedHeaderHash],
    ["receipt_or_message_root", receiptOrMessageRoot]
  ]) {
    normalizeNonZeroHex32(value, `${label}.${field}`);
  }
  if (consensusProof.length === 0) {
    throw new TypeError(`${label}.consensus_proof must not be empty`);
  }
  if (messageInclusionProof.length === 0) {
    throw new TypeError(`${label}.message_inclusion_proof must not be empty`);
  }
  if (inclusionBranch.length === 0) {
    throw new TypeError(`${label}.inclusion_branch must not be empty`);
  }
  if (inclusionBranch.length > SCCP_MAX_SOURCE_MERKLE_BRANCH_NODES) {
    throw new TypeError(`${label}.inclusion_branch is too deep`);
  }
  inclusionBranch.forEach((sibling, index) => {
    if (sibling.length !== 32) {
      throw new TypeError(`${label}.inclusion_branch[${index}] must be 32 bytes`);
    }
  });
  const genericSourceEventDigest = sccpSourceEventDigest(
    sourceDomain,
    targetDomain,
    messageId,
    payloadHash
  );
  const acceptsRouteSpecificSourceEventDigest = sourceDomain === SCCP_DOMAIN_BSC && targetDomain === SCCP_DOMAIN_SORA;
  if (sourceEventDigest !== genericSourceEventDigest && !acceptsRouteSpecificSourceEventDigest) {
    throw new TypeError(`${label}.source_event_digest must match source domains and message`);
  }
  return {
    sourceDomain,
    targetDomain,
    messageId,
    payloadHash,
    commitmentRoot,
    finalityHeight,
    finalityBlockHash
  };
};
var canonicalSccpTokenAddPayloadBytes = (payload) => {
  if (!payload || typeof payload !== "object") {
    throw new TypeError("payload must be an object");
  }
  let out = new Uint8Array();
  out = writeU8(out, Number(payload.version));
  out = writeU32Le(
    out,
    normalizeSccpDomainId(payload.target_domain, "payload.target_domain")
  );
  out = writeU64Le(out, payload.nonce);
  out = concatBytes2(
    out,
    hexToBytes2(payload.sora_asset_id, "payload.sora_asset_id", 32)
  );
  out = writeU8(out, Number(payload.decimals));
  out = concatBytes2(out, hexToBytes2(payload.name, "payload.name", 32));
  out = concatBytes2(out, hexToBytes2(payload.symbol, "payload.symbol", 32));
  return out;
};
var canonicalSccpTokenControlPayloadBytes = (payload) => {
  if (!payload || typeof payload !== "object") {
    throw new TypeError("payload must be an object");
  }
  let out = new Uint8Array();
  out = writeU8(out, Number(payload.version));
  out = writeU32Le(
    out,
    normalizeSccpDomainId(payload.target_domain, "payload.target_domain")
  );
  out = writeU64Le(out, payload.nonce);
  out = concatBytes2(
    out,
    hexToBytes2(payload.sora_asset_id, "payload.sora_asset_id", 32)
  );
  return out;
};
var canonicalSccpTokenMessagePayloadBytes = (payload) => {
  const normalized = normalizeTokenMessagePayload(payload);
  if (normalized.kind === "TokenAdd") {
    return concatBytes2(
      Uint8Array.from([3]),
      canonicalSccpTokenAddPayloadBytes(normalized.value)
    );
  }
  if (normalized.kind === "TokenPause") {
    return concatBytes2(
      Uint8Array.from([4]),
      canonicalSccpTokenControlPayloadBytes(normalized.value)
    );
  }
  if (normalized.kind === "TokenResume") {
    return concatBytes2(
      Uint8Array.from([5]),
      canonicalSccpTokenControlPayloadBytes(normalized.value)
    );
  }
  throw new TypeError(
    `unsupported token message payload kind: ${normalized.kind}`
  );
};
var canonicalSccpAssetRegisterPayloadBytes = (payload) => {
  if (!payload || typeof payload !== "object") {
    throw new TypeError("payload must be an object");
  }
  let out = new Uint8Array();
  out = writeU8(out, Number(payload.version));
  out = writeU32Le(
    out,
    normalizeSccpDomainId(payload.target_domain, "payload.target_domain")
  );
  out = writeU32Le(
    out,
    normalizeSccpDomainId(payload.home_domain, "payload.home_domain")
  );
  out = writeU64Le(out, payload.nonce);
  const assetIdCodec = normalizeSccpCodecId(
    payload.asset_id_codec,
    "payload.asset_id_codec"
  );
  out = writeU8(out, assetIdCodec);
  out = writeBytes(
    out,
    normalizeSccpCodecValueBytes(
      payload.asset_id,
      assetIdCodec,
      "payload.asset_id"
    )
  );
  out = writeU8(out, Number(payload.decimals));
  return out;
};
var canonicalSccpRouteActivatePayloadBytes = (payload) => {
  if (!payload || typeof payload !== "object") {
    throw new TypeError("payload must be an object");
  }
  let out = new Uint8Array();
  out = writeU8(out, Number(payload.version));
  out = writeU32Le(
    out,
    normalizeSccpDomainId(payload.source_domain, "payload.source_domain")
  );
  out = writeU32Le(
    out,
    normalizeSccpDomainId(payload.target_domain, "payload.target_domain")
  );
  out = writeU64Le(out, payload.nonce);
  const assetIdCodec = normalizeSccpCodecId(
    payload.asset_id_codec,
    "payload.asset_id_codec"
  );
  const routeIdCodec = normalizeSccpCodecId(
    payload.route_id_codec,
    "payload.route_id_codec"
  );
  out = writeU8(out, assetIdCodec);
  out = writeBytes(
    out,
    normalizeSccpCodecValueBytes(
      payload.asset_id,
      assetIdCodec,
      "payload.asset_id"
    )
  );
  out = writeU8(out, routeIdCodec);
  out = writeBytes(
    out,
    normalizeSccpCodecValueBytes(
      payload.route_id,
      routeIdCodec,
      "payload.route_id"
    )
  );
  return out;
};
var normalizeSccpPayloadEnvelope = (payload) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("SCCP payload envelope must be an object");
  }
  if (typeof payload.kind === "string" && payload.value && typeof payload.value === "object") {
    return {
      kind: payload.kind,
      value: payload.value
    };
  }
  const entries = Object.entries(payload);
  if (entries.length !== 1) {
    throw new TypeError(
      "SCCP payload envelope must contain exactly one payload variant"
    );
  }
  const [[kind, value]] = entries;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("SCCP payload envelope value must be an object");
  }
  return { kind, value };
};
var canonicalSccpPayloadEnvelopeBytes = (payload) => {
  const normalized = normalizeSccpPayloadEnvelope(payload);
  if (normalized.kind === "AssetRegister") {
    return concatBytes2(
      Uint8Array.from([0]),
      canonicalSccpAssetRegisterPayloadBytes(normalized.value)
    );
  }
  if (normalized.kind === "RouteActivate") {
    return concatBytes2(
      Uint8Array.from([1]),
      canonicalSccpRouteActivatePayloadBytes(normalized.value)
    );
  }
  if (normalized.kind === "Transfer") {
    return concatBytes2(
      Uint8Array.from([2]),
      canonicalSccpTransferPayloadBytes(normalized.value)
    );
  }
  if (normalized.kind === "TokenAdd" || normalized.kind === "TokenPause" || normalized.kind === "TokenResume") {
    return canonicalSccpTokenMessagePayloadBytes(normalized);
  }
  throw new TypeError(`unsupported SCCP payload variant: ${normalized.kind}`);
};
var sccpPayloadHash = (payload, options = {}) => bytesToHex2(
  prefixedBlake2b(SCCP_PAYLOAD_HASH_PREFIX_V1, toBytes2(payload, "payload")),
  options.prefix !== false
);
var canonicalSccpCommitmentBytes = (commitment) => {
  if (!commitment || typeof commitment !== "object") {
    throw new TypeError("commitment must be an object");
  }
  let out = new Uint8Array();
  out = writeU8(out, Number(commitment.version));
  out = writeU8(out, messageKindCode(commitment.kind));
  out = writeU32Le(
    out,
    normalizeSccpDomainId(commitment.target_domain, "commitment.target_domain")
  );
  out = concatBytes2(
    out,
    hexToBytes2(commitment.message_id, "commitment.message_id", 32)
  );
  out = concatBytes2(
    out,
    hexToBytes2(commitment.payload_hash, "commitment.payload_hash", 32)
  );
  return out;
};
var sccpCommitmentLeafHash = (commitment, options = {}) => bytesToHex2(
  prefixedBlake2b(
    SCCP_HUB_LEAF_PREFIX_V1,
    canonicalSccpCommitmentBytes(commitment)
  ),
  options.prefix !== false
);
var sccpMerkleRootFromCommitment = (commitment, proof, options = {}) => {
  if (!proof || typeof proof !== "object" || !Array.isArray(proof.steps)) {
    throw new TypeError("proof.steps must be an array");
  }
  let current = hexToBytes2(
    sccpCommitmentLeafHash(commitment),
    "commitment leaf",
    32
  );
  for (const [index, step] of proof.steps.entries()) {
    const sibling = hexToBytes2(
      step?.sibling_hash,
      `proof.steps[${index}].sibling_hash`,
      32
    );
    current = step?.sibling_is_left ? prefixedBlake2b(SCCP_HUB_NODE_PREFIX_V1, concatBytes2(sibling, current)) : prefixedBlake2b(SCCP_HUB_NODE_PREFIX_V1, concatBytes2(current, sibling));
  }
  return bytesToHex2(current, options.prefix !== false);
};
var nativeEvmProverBundleRequiredSdks = Object.freeze(
  Object.keys(SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1)
);
var nativeEvmProverBundleManifestKeys = Object.freeze(
  /* @__PURE__ */ new Set([
    "schema",
    "bundleId",
    "bundle_id",
    "domain",
    "chain",
    "proofBackend",
    "proof_backend",
    "backend",
    "proofArtifact",
    "proof_artifact",
    "proverArtifact",
    "prover_artifact",
    "circuitArtifact",
    "circuit_artifact",
    "proofArtifactHash",
    "proof_artifact_hash",
    "proverArtifactHash",
    "prover_artifact_hash",
    "circuitArtifactHash",
    "circuit_artifact_hash",
    "provingKey",
    "proving_key",
    "provingKeyHash",
    "proving_key_hash",
    "verifierKey",
    "verifier_key",
    "verifierKeyHash",
    "verifier_key_hash",
    "verifierKeyArtifactHash",
    "verifier_key_artifact_hash",
    "destinationBindingHash",
    "destination_binding_hash",
    "noWasm",
    "no_wasm",
    "remoteProverRequired",
    "remote_prover_required",
    "browserImplementation",
    "browser_implementation",
    "nativeSdkArtifacts",
    "native_sdk_artifacts",
    "sdkArtifacts",
    "sdk_artifacts",
    "crossSdkParityArtifact",
    "cross_sdk_parity_artifact",
    "crossSdkFixtureParityArtifact",
    "cross_sdk_fixture_parity_artifact",
    "nativeProverSelfTestArtifact",
    "native_prover_self_test_artifact",
    "selfTestArtifact",
    "self_test_artifact",
    "groth16ProofSelfTestArtifact",
    "groth16_proof_self_test_artifact",
    "groth16ProofSelfTestHash",
    "groth16_proof_self_test_hash",
    "auditHashes",
    "audit_hashes"
  ])
);
var nativeEvmProverBundleLegacyRequiredAuditHashKeys = Object.freeze([
  "circuit_security_audit",
  "native_implementation_audit",
  "reproducible_build_attestation",
  "cross_sdk_fixture_parity",
  "native_prover_self_test",
  "no_wasm_no_remote_scan"
]);
var nativeEvmProverBundleBscRequiredAuditHashKeys = Object.freeze([
  "circuit_security_audit",
  "native_implementation_audit",
  "reproducible_build_attestation",
  "cross_sdk_parity",
  "native_prover_self_test",
  "no_wasm_no_remote_scan"
]);
var nativeEvmProverBundleRequiredAuditHashKeySet = Object.freeze(
  new Set(nativeEvmProverBundleLegacyRequiredAuditHashKeys)
);
var nativeEvmProverBundleSdkArtifactKeys = Object.freeze(
  /* @__PURE__ */ new Set([
    "sdk",
    "implementation",
    "proofArtifactHash",
    "proof_artifact_hash",
    "proverArtifactHash",
    "prover_artifact_hash",
    "provingKeyHash",
    "proving_key_hash",
    "implementationArtifact",
    "implementation_artifact",
    "implementationPath",
    "implementation_path",
    "implementationHash",
    "implementation_hash"
  ])
);
var nativeEvmProverParityFixtureKeys = Object.freeze(
  /* @__PURE__ */ new Set([
    "schema",
    "domain",
    "chain",
    "proofBackend",
    "proof_backend",
    "backend",
    "proofArtifactHash",
    "proof_artifact_hash",
    "proverArtifactHash",
    "prover_artifact_hash",
    "circuitArtifactHash",
    "circuit_artifact_hash",
    "provingKeyHash",
    "proving_key_hash",
    "verifierKeyHash",
    "verifier_key_hash",
    "destinationBindingHash",
    "destination_binding_hash",
    "receiptProofHash",
    "receipt_proof_hash",
    "sourceProofHash",
    "source_proof_hash",
    "publicSignalWords",
    "public_signal_words",
    "calldataHash",
    "calldata_hash",
    "toriiSubmitPayloadHash",
    "torii_submit_payload_hash",
    "productionAttestationHash",
    "production_attestation_hash",
    "sdkResults",
    "sdk_results"
  ])
);
var nativeEvmProverParitySdkResultKeys = Object.freeze(
  /* @__PURE__ */ new Set([
    "receiptProofHash",
    "receipt_proof_hash",
    "sourceProofHash",
    "source_proof_hash",
    "destinationBindingHash",
    "destination_binding_hash",
    "publicSignalWords",
    "public_signal_words",
    "calldataHash",
    "calldata_hash",
    "toriiSubmitPayloadHash",
    "torii_submit_payload_hash"
  ])
);
var nativeEvmProverSelfTestFixtureKeys = Object.freeze(
  /* @__PURE__ */ new Set([
    "schema",
    "domain",
    "chain",
    "proofBackend",
    "proof_backend",
    "backend",
    "proofArtifactHash",
    "proof_artifact_hash",
    "proverArtifactHash",
    "prover_artifact_hash",
    "circuitArtifactHash",
    "circuit_artifact_hash",
    "provingKeyHash",
    "proving_key_hash",
    "verifierKeyHash",
    "verifier_key_hash",
    "destinationBindingHash",
    "destination_binding_hash",
    "requestHash",
    "request_hash",
    "witnessHash",
    "witness_hash",
    "sourceProofHash",
    "source_proof_hash",
    "proofHash",
    "proof_hash",
    "publicSignalWords",
    "public_signal_words",
    "calldataHash",
    "calldata_hash",
    "toriiSubmitPayloadHash",
    "torii_submit_payload_hash",
    "productionAttestationHash",
    "production_attestation_hash",
    "sdkResults",
    "sdk_results"
  ])
);
var nativeEvmProverSelfTestSdkResultKeys = Object.freeze(
  /* @__PURE__ */ new Set([
    "requestHash",
    "request_hash",
    "witnessHash",
    "witness_hash",
    "sourceProofHash",
    "source_proof_hash",
    "proofHash",
    "proof_hash",
    "publicSignalWords",
    "public_signal_words",
    "calldataHash",
    "calldata_hash",
    "toriiSubmitPayloadHash",
    "torii_submit_payload_hash"
  ])
);
var bscGroth16ProofSelfTestReportKeys = Object.freeze(
  /* @__PURE__ */ new Set([
    "schema",
    "routeId",
    "route_id",
    "assetKey",
    "asset_key",
    "bscNetwork",
    "bsc_network",
    "network",
    "chain",
    "chainIdHex",
    "chain_id_hex",
    "networkIdHex",
    "network_id_hex",
    "circuitProfile",
    "circuit_profile",
    "proofBackend",
    "proof_backend",
    "backend",
    "proofFamily",
    "proof_family",
    "generatedAt",
    "generated_at",
    "manifest",
    "artifacts",
    "sample",
    "witnessHash",
    "witness_hash",
    "proofHash",
    "proof_hash",
    "publicSignalsHash",
    "public_signals_hash",
    "snarkjs",
    "adversarialChecks",
    "adversarial_checks",
    "proof",
    "publicSignals",
    "public_signals"
  ])
);
var bscGroth16ProofSelfTestManifestKeys = Object.freeze(
  /* @__PURE__ */ new Set([
    "path",
    "sha256",
    "manifestSha256",
    "manifest_sha256",
    "productionReady",
    "production_ready",
    "productionBlockers",
    "production_blockers",
    "generatedAt",
    "generated_at"
  ])
);
var bscGroth16ProofSelfTestArtifactsKeys = Object.freeze(
  /* @__PURE__ */ new Set([
    "circuitSource",
    "circuit_source",
    "r1cs",
    "provingKey",
    "proving_key",
    "snarkjsVerificationKey",
    "snarkjs_verification_key",
    "bscVerifierKey",
    "bsc_verifier_key",
    "witnessWasm",
    "witness_wasm"
  ])
);
var bscGroth16ProofSelfTestArtifactKeys = Object.freeze(
  /* @__PURE__ */ new Set(["path", "sha256", "hash", "artifactHash", "artifact_hash"])
);
var bscGroth16ProofSelfTestSampleKeys = Object.freeze(
  /* @__PURE__ */ new Set([
    "id",
    "syntheticInputWords",
    "synthetic_input_words",
    "publicSignalNames",
    "public_signal_names",
    "publicSignalWords",
    "public_signal_words",
    "inputSha256",
    "input_sha256"
  ])
);
var bscGroth16ProofSelfTestSnarkjsKeys = Object.freeze(
  /* @__PURE__ */ new Set(["binary", "wtnsCalculate", "groth16Prove", "groth16Verify"])
);
var bscGroth16ProofSelfTestAdversarialChecksKeys = Object.freeze(
  /* @__PURE__ */ new Set([
    "publicSignalMismatch",
    "public_signal_mismatch",
    "nonBooleanValueBit",
    "non_boolean_value_bit"
  ])
);
var bscGroth16ProofSelfTestPublicSignalMismatchKeys = Object.freeze(
  /* @__PURE__ */ new Set(["attempted", "rejected", "cases"])
);
var bscGroth16ProofSelfTestAdversarialCaseKeys = Object.freeze(
  /* @__PURE__ */ new Set(["index", "name", "phase", "rejected"])
);
var bscGroth16ProofSelfTestNonBooleanValueBitKeys = Object.freeze(
  /* @__PURE__ */ new Set(["attempted", "rejected", "case"])
);
var bscGroth16ProofSelfTestNonBooleanValueBitCaseKeys = Object.freeze(
  /* @__PURE__ */ new Set([
    "signalName",
    "signal_name",
    "inputName",
    "input_name",
    "bitIndex",
    "bit_index",
    "phase",
    "rejected"
  ])
);
var bscGroth16ProofSelfTestProofKeys = Object.freeze(
  /* @__PURE__ */ new Set([
    "pi_a",
    "piA",
    "a",
    "pi_b",
    "piB",
    "b",
    "pi_c",
    "piC",
    "c",
    "protocol",
    "curve"
  ])
);
var nativeEvmProverForbiddenArtifactPathMarker = (...parts) => parts.join("");
var nativeEvmProverForbiddenArtifactPathMarkers = [
  nativeEvmProverForbiddenArtifactPathMarker("web", "assem", "bly"),
  nativeEvmProverForbiddenArtifactPathMarker("wa", "sm"),
  nativeEvmProverForbiddenArtifactPathMarker("sn", "ark", "js"),
  nativeEvmProverForbiddenArtifactPathMarker("remote", "pro", "ver"),
  nativeEvmProverForbiddenArtifactPathMarker("remote", "-", "pro", "ver"),
  nativeEvmProverForbiddenArtifactPathMarker("remote", "_", "pro", "ver"),
  nativeEvmProverForbiddenArtifactPathMarker("remote", " ", "pro", "ver"),
  nativeEvmProverForbiddenArtifactPathMarker("pro", "ver", "-", "url"),
  nativeEvmProverForbiddenArtifactPathMarker("pro", "ver", "_", "url"),
  nativeEvmProverForbiddenArtifactPathMarker("pro", "ver", "end", "point"),
  nativeEvmProverForbiddenArtifactPathMarker("pro", "ver", "-", "end", "point"),
  nativeEvmProverForbiddenArtifactPathMarker("pro", "ver", "_", "end", "point"),
  nativeEvmProverForbiddenArtifactPathMarker("pro", "ver", " ", "end", "point")
];
var nativeEvmProverBundleProfiles = Object.freeze({
  ethereumMainnet: Object.freeze({
    displayName: "Ethereum mainnet",
    className: "EthereumMainnetSccp",
    domain: SCCP_DOMAIN_ETH,
    chain: "eth",
    bundleId: SCCP_ETH_NATIVE_EVM_PROVER_BUNDLE_ID_V1,
    paritySchema: SCCP_ETH_NATIVE_EVM_PROVER_PARITY_SCHEMA_V1,
    parityFixtureSchema: SCCP_ETH_NATIVE_EVM_PROVER_PARITY_FIXTURE_SCHEMA_V1,
    selfTestFixtureSchema: SCCP_ETH_NATIVE_EVM_PROVER_SELF_TEST_SCHEMA_V1,
    destinationBinding: ethereumMainnetSccpDestinationBinding,
    unavailableCode: "ERR_SCCP_ETH_NATIVE_PROVER_ARTIFACTS_UNAVAILABLE",
    selfTestUnavailableCode: "ERR_SCCP_ETH_NATIVE_PROVER_SELF_TEST_UNAVAILABLE",
    selfTestMissingMessage: "Ethereum mainnet SCCP outbound prover requires a native prover self-test hook"
  }),
  bscTestnet: Object.freeze({
    displayName: "BSC testnet",
    className: "BscTestnetSccp",
    domain: SCCP_DOMAIN_BSC,
    bscNetwork: "testnet",
    chain: "bsc-testnet",
    chainIdHex: "0x61",
    networkIdHex: SCCP_BSC_TESTNET_NETWORK_ID,
    bundleId: SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1,
    paritySchema: SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_PARITY_SCHEMA_V1,
    parityFixtureSchema: SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_PARITY_FIXTURE_SCHEMA_V1,
    selfTestFixtureSchema: SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_SELF_TEST_SCHEMA_V1,
    destinationBinding: bscTestnetSccpDestinationBinding,
    unavailableCode: "ERR_SCCP_BSC_TESTNET_NATIVE_PROVER_ARTIFACTS_UNAVAILABLE",
    selfTestUnavailableCode: "ERR_SCCP_BSC_TESTNET_NATIVE_PROVER_SELF_TEST_UNAVAILABLE"
  }),
  bscMainnet: Object.freeze({
    displayName: "BSC mainnet",
    className: "BscMainnetSccp",
    domain: SCCP_DOMAIN_BSC,
    bscNetwork: "mainnet",
    chain: "bsc-mainnet",
    chainIdHex: "0x38",
    networkIdHex: SCCP_BSC_MAINNET_NETWORK_ID,
    bundleId: SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1,
    paritySchema: SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_PARITY_SCHEMA_V1,
    parityFixtureSchema: SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_PARITY_FIXTURE_SCHEMA_V1,
    selfTestFixtureSchema: SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_SELF_TEST_SCHEMA_V1,
    destinationBinding: bscMainnetSccpDestinationBinding,
    unavailableCode: "ERR_SCCP_BSC_MAINNET_NATIVE_PROVER_ARTIFACTS_UNAVAILABLE",
    selfTestUnavailableCode: "ERR_SCCP_BSC_MAINNET_NATIVE_PROVER_SELF_TEST_UNAVAILABLE"
  })
});
var nativeEvmProverArtifactMarker = (...codes) => [
  String.fromCharCode(...codes),
  Uint8Array.from(codes)
];
var SCCP_NATIVE_EVM_PROVER_FORBIDDEN_ARTIFACT_MARKERS = [
  nativeEvmProverArtifactMarker(
    119,
    101,
    98,
    97,
    115,
    115,
    101,
    109,
    98,
    108,
    121
  ),
  nativeEvmProverArtifactMarker(119, 97, 115, 109),
  nativeEvmProverArtifactMarker(115, 110, 97, 114, 107, 106, 115),
  nativeEvmProverArtifactMarker(
    114,
    101,
    109,
    111,
    116,
    101,
    112,
    114,
    111,
    118,
    101,
    114
  ),
  nativeEvmProverArtifactMarker(
    114,
    101,
    109,
    111,
    116,
    101,
    32,
    112,
    114,
    111,
    118,
    101,
    114
  ),
  nativeEvmProverArtifactMarker(
    114,
    101,
    109,
    111,
    116,
    101,
    95,
    112,
    114,
    111,
    118,
    101,
    114
  ),
  nativeEvmProverArtifactMarker(
    112,
    114,
    111,
    118,
    101,
    114,
    95,
    117,
    114,
    108
  ),
  nativeEvmProverArtifactMarker(
    112,
    114,
    111,
    118,
    101,
    114,
    45,
    117,
    114,
    108
  ),
  nativeEvmProverArtifactMarker(
    112,
    114,
    111,
    118,
    101,
    114,
    101,
    110,
    100,
    112,
    111,
    105,
    110,
    116
  ),
  nativeEvmProverArtifactMarker(
    112,
    114,
    111,
    118,
    101,
    114,
    32,
    101,
    110,
    100,
    112,
    111,
    105,
    110,
    116
  )
];
var SCCP_NATIVE_EVM_PROVER_MIN_PROOF_ARTIFACT_BYTES_V1 = 64 * 1024;
var SCCP_NATIVE_EVM_PROVER_MIN_PROVING_KEY_BYTES_V1 = 64 * 1024;
var SCCP_NATIVE_EVM_SNARKJS_R1CS_MAGIC = Object.freeze([
  114,
  49,
  99,
  115
]);
var SCCP_NATIVE_EVM_SNARKJS_ZKEY_MAGIC = Object.freeze([
  122,
  107,
  101,
  121
]);
var SCCP_NATIVE_EVM_SNARKJS_R1CS_REQUIRED_SECTIONS = Object.freeze([1, 2, 3]);
var SCCP_NATIVE_EVM_SNARKJS_ZKEY_REQUIRED_SECTIONS = Object.freeze([
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10
]);
var normalizeSccpDomainId = (value, label, fallback) => {
  const selected = value ?? fallback;
  let numeric;
  if (typeof selected === "number") {
    if (!Number.isInteger(selected)) {
      throw new RangeError(`${label} must be a u32 domain id`);
    }
    numeric = selected;
  } else if (typeof selected === "bigint") {
    if (selected < 0n || selected > 0xffffffffn) {
      throw new RangeError(`${label} must be a u32 domain id`);
    }
    numeric = Number(selected);
  } else if (typeof selected === "string" && isCanonicalDecimalText(selected)) {
    numeric = Number(selected);
  } else {
    throw new TypeError(`${label} must be a u32 domain id`);
  }
  if (numeric < 0 || numeric > 4294967295) {
    throw new RangeError(`${label} must be a u32 domain id`);
  }
  return numeric;
};
var SOLANA_FULL_LIGHT_CLIENT_AUDIT_ROLES = Object.freeze({
  towerReplay: Object.freeze({
    name: "towerReplay",
    wireName: "tower_replay",
    code: 1,
    circuitId: SCCP_SOLANA_TOWER_REPLAY_OPEN_VERIFY_CIRCUIT_ID_V1,
    verifierId: SCCP_SOLANA_MAINNET_TOWER_REPLAY_VERIFIER_ID_V1,
    verifierHashField: "solanaTowerReplayVerifierHash",
    requiredInputNames: Object.freeze([
      "tower_lockout_hash",
      "tower_replay_hash",
      "bank_fork_hash",
      "epoch_stake_root",
      "stake_activation_hash",
      "stake_account_state_hash",
      "stake_history_hash",
      "stake_history_sysvar_account_hash",
      "account_inclusion_root"
    ])
  }),
  fullAccountsdbLattice: Object.freeze({
    name: "fullAccountsdbLattice",
    wireName: "full_accountsdb_lattice",
    code: 2,
    circuitId: SCCP_SOLANA_FULL_ACCOUNTSDB_LATTICE_OPEN_VERIFY_CIRCUIT_ID_V1,
    verifierId: SCCP_SOLANA_MAINNET_FULL_ACCOUNTSDB_LATTICE_VERIFIER_ID_V1,
    verifierHashField: "solanaFullAccountsdbLatticeVerifierHash",
    requiredInputNames: Object.freeze([
      "account_inclusion_root",
      "accounts_lt_hash_checksum",
      "accounts_lt_hash_proof_public_inputs_hash",
      "opened_accounts_lt_hash_contributions_hash",
      "opened_accounts_lt_hash_residual_checksum",
      "accounts_lt_hash_proof_hash"
    ])
  }),
  bankForkChoice: Object.freeze({
    name: "bankForkChoice",
    wireName: "bank_fork_choice",
    code: 3,
    circuitId: SCCP_SOLANA_BANK_FORK_CHOICE_OPEN_VERIFY_CIRCUIT_ID_V1,
    verifierId: SCCP_SOLANA_MAINNET_BANK_FORK_CHOICE_VERIFIER_ID_V1,
    verifierHashField: "solanaBankForkChoiceVerifierHash",
    requiredInputNames: Object.freeze([
      "parent_bank_hash",
      "bank_hash",
      "blockhash",
      "transaction_status_root",
      "account_inclusion_root",
      "accounts_lt_hash_checksum",
      "bank_signature_count",
      "bank_hash_hard_fork_data_hash",
      "bank_fork_hash",
      "tower_replay_hash"
    ])
  })
});
var SOLANA_SOURCE_STATE_VERIFICATION_CIRCUIT_IDS = Object.freeze(
  /* @__PURE__ */ new Set([
    SCCP_SOLANA_ACCOUNTS_LT_HASH_OPEN_VERIFY_CIRCUIT_ID_V1,
    SCCP_SOLANA_TOWER_REPLAY_OPEN_VERIFY_CIRCUIT_ID_V1,
    SCCP_SOLANA_FULL_ACCOUNTSDB_LATTICE_OPEN_VERIFY_CIRCUIT_ID_V1,
    SCCP_SOLANA_BANK_FORK_CHOICE_OPEN_VERIFY_CIRCUIT_ID_V1
  ])
);
var TON_FULL_LIGHT_CLIENT_AUDIT_ROLES = Object.freeze({
  masterchainConfig: Object.freeze({
    name: "masterchainConfig",
    wireName: "masterchain_config",
    code: 1,
    circuitId: SCCP_TON_MASTERCHAIN_CONFIG_OPEN_VERIFY_CIRCUIT_ID_V1,
    verifierId: SCCP_TON_MAINNET_MASTERCHAIN_CONFIG_VERIFIER_ID_V1,
    verifierHashField: "tonMasterchainConfigVerifierHash",
    requiredInputNames: Object.freeze([
      "masterchain_config_root",
      "masterchain_config_proof_hash",
      "validator_set_payload_hash",
      "config_leaf_hash",
      "config_value_hash",
      "config_proof_boc_hash"
    ])
  }),
  validatorSetTransition: Object.freeze({
    name: "validatorSetTransition",
    wireName: "validator_set_transition",
    code: 2,
    circuitId: SCCP_TON_VALIDATOR_SET_TRANSITION_OPEN_VERIFY_CIRCUIT_ID_V1,
    verifierId: SCCP_TON_MAINNET_VALIDATOR_SET_TRANSITION_VERIFIER_ID_V1,
    verifierHashField: "tonValidatorSetTransitionVerifierHash",
    requiredInputNames: Object.freeze([
      "source_trust_anchor_hash",
      "validator_set_hash",
      "validator_set_transition_chain_hash",
      "masterchain_signature_hash",
      "validator_set_transition_count"
    ])
  }),
  shardAccountsDictionary: Object.freeze({
    name: "shardAccountsDictionary",
    wireName: "shard_accounts_dictionary",
    code: 3,
    circuitId: SCCP_TON_SHARD_ACCOUNTS_DICTIONARY_OPEN_VERIFY_CIRCUIT_ID_V1,
    verifierId: SCCP_TON_MAINNET_SHARD_ACCOUNTS_DICTIONARY_VERIFIER_ID_V1,
    verifierHashField: "tonShardAccountsDictionaryVerifierHash",
    requiredInputNames: Object.freeze([
      "shard_state_root",
      "shard_state_dictionary_root",
      "transaction_root",
      "shard_state_proof_boc_hash",
      "shard_accounts_proof_boc_hash",
      "shard_state_verification_proof_hash"
    ])
  })
});
var TON_SOURCE_STATE_VERIFICATION_CIRCUIT_IDS = Object.freeze(
  /* @__PURE__ */ new Set([
    SCCP_TON_SHARD_STATE_OPEN_VERIFY_CIRCUIT_ID_V1,
    SCCP_TON_MASTERCHAIN_CONFIG_OPEN_VERIFY_CIRCUIT_ID_V1,
    SCCP_TON_VALIDATOR_SET_TRANSITION_OPEN_VERIFY_CIRCUIT_ID_V1,
    SCCP_TON_SHARD_ACCOUNTS_DICTIONARY_OPEN_VERIFY_CIRCUIT_ID_V1
  ])
);
var sccpNoritoSchemaHashHex = (typeName) => bytesToHex2(
  sha2562(
    concatBytes2(
      textEncoder.encode("norito:v1:type-name\0"),
      textEncoder.encode(typeName)
    )
  ).slice(0, 16),
  false
);
var SCCP_SOURCE_CONSENSUS_PROOF_SCHEMA_HASH_HEX = sccpNoritoSchemaHashHex(
  "iroha_sccp::SccpSourceConsensusProofV1"
);
var SCCP_SOURCE_MESSAGE_INCLUSION_PROOF_SCHEMA_HASH_HEX = sccpNoritoSchemaHashHex(
  "iroha_sccp::SccpSourceMessageInclusionProofV1"
);
var noritoStructValue = (fields) => concatBytes2(...fields.map((field) => noritoField(field, false)));
var noritoU8 = (value) => Uint8Array.from([value & 255]);
var noritoU32Value = (value) => writeU32Le(new Uint8Array(), value);
var noritoU64Value = (value) => noritoU64Le(value);
var noritoRawByteVecValue = (value, label) => {
  const bytes = toBytes2(value, label);
  return concatBytes2(noritoU64Le(bytes.length), bytes);
};
var noritoByteVecSequenceValue = (items, label) => {
  if (!Array.isArray(items)) {
    throw new TypeError(`${label} must be an array`);
  }
  return concatBytes2(
    noritoU64Le(items.length),
    ...items.map(
      (item, index) => noritoField(
        noritoRawByteVecValue(item, `${label}[${index}]`),
        false,
        `${label}[${index}]`
      )
    )
  );
};
function buildTonTestnetPlaceholderSourceChainProofEnvelope(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("TON testnet placeholder source-chain proof input must be an object");
  }
  const optionalInput = (label, ...names) => {
    const selected = strictOptionalResultField(input, label, ...names);
    return selected === SCCP_OPTIONAL_FIELD_MISSING ? void 0 : selected;
  };
  const messageId = normalizeNonZeroHex32(
    strictResultField(input, "messageId", "messageId", "message_id"),
    "messageId"
  );
  const payloadHash = normalizeNonZeroHex32(
    strictResultField(input, "payloadHash", "payloadHash", "payload_hash"),
    "payloadHash"
  );
  const commitmentRoot = normalizeNonZeroHex32(
    strictResultField(
      input,
      "commitmentRoot",
      "commitmentRoot",
      "commitment_root"
    ),
    "commitmentRoot"
  );
  const sourceEventDigest = sccpSourceEventDigest(
    SCCP_DOMAIN_TON,
    SCCP_DOMAIN_SORA,
    messageId,
    payloadHash
  );
  const sourceEventLeafHash = sccpSourceEventLeafHash(sourceEventDigest);
  const branchSeed = prefixedBlake2b(
    "sccp:ton:testnet-placeholder-source-branch:v1",
    concatBytes2(
      hexToBytes2(sourceEventDigest, "sourceEventDigest", 32),
      hexToBytes2(commitmentRoot, "commitmentRoot", 32)
    )
  );
  const inclusionBranch = Object.freeze([bytesToHex2(branchSeed)]);
  const receiptOrMessageRoot = sccpSourceMessageRootFromBranch(
    sourceEventLeafHash,
    0,
    inclusionBranch
  );
  const txIdInput = optionalInput(
    "txId",
    "txId",
    "txID",
    "transactionHash",
    "transaction_hash",
    "transactionId",
    "transaction_id"
  ) ?? messageId;
  const txId = normalizeNonZeroHex32(txIdInput, "txId");
  const finalityHeight = normalizeUnsignedBigIntMax(
    optionalInput("finalityHeight", "finalityHeight", "finality_height") ?? new DataView(
      hexToBytes2(txId, "txId", 32).buffer,
      0,
      8
    ).getBigUint64(0, false),
    "finalityHeight",
    SCCP_U64_MAX,
    "u64"
  );
  if (finalityHeight === 0n) {
    throw new TypeError("finalityHeight must not be zero");
  }
  const finalityBlockHash = optionalInput(
    "finalityBlockHash",
    "finalityBlockHash",
    "finality_block_hash",
    "blockHash",
    "block_hash"
  ) ?? bytesToHex2(
    prefixedBlake2b(
      "sccp:ton:testnet-placeholder-finality-block:v1",
      concatBytes2(
        hexToBytes2(txId, "txId", 32),
        hexToBytes2(sourceEventDigest, "sourceEventDigest", 32)
      )
    )
  );
  const normalizedFinalityBlockHash = normalizeNonZeroHex32(
    finalityBlockHash,
    "finalityBlockHash"
  );
  const finalizedHeaderHash = sccpSourceFinalizedHeaderHash({
    sourceDomain: SCCP_DOMAIN_TON,
    finalityModelCanonical: 4,
    finalityHeight,
    finalityBlockHash: normalizedFinalityBlockHash,
    receiptOrMessageRoot
  });
  const consensusProof = concatBytes2(
    textEncoder.encode("sccp:ton:testnet-placeholder-consensus:v1"),
    hexToBytes2(txId, "txId", 32),
    hexToBytes2(sourceEventDigest, "sourceEventDigest", 32)
  );
  const messageInclusionProof = concatBytes2(
    textEncoder.encode("sccp:ton:testnet-placeholder-inclusion:v1"),
    hexToBytes2(sourceEventLeafHash, "sourceEventLeafHash", 32),
    hexToBytes2(receiptOrMessageRoot, "receiptOrMessageRoot", 32)
  );
  const sourceProofBytes = noritoFrame(
    noritoStructValue([
      noritoU8(1),
      noritoU32Value(SCCP_DOMAIN_TON),
      noritoU32Value(SCCP_DOMAIN_SORA),
      noritoStringValue("ton", false, "sourceChain"),
      noritoU32Value(4),
      noritoU32Value(3),
      hexToBytes2(messageId, "messageId", 32),
      hexToBytes2(payloadHash, "payloadHash", 32),
      hexToBytes2(sourceEventDigest, "sourceEventDigest", 32),
      hexToBytes2(commitmentRoot, "commitmentRoot", 32),
      noritoU64Value(finalityHeight),
      hexToBytes2(normalizedFinalityBlockHash, "finalityBlockHash", 32),
      hexToBytes2(finalizedHeaderHash, "finalizedHeaderHash", 32),
      hexToBytes2(receiptOrMessageRoot, "receiptOrMessageRoot", 32),
      noritoRawByteVecValue(consensusProof, "consensusProof"),
      noritoRawByteVecValue(messageInclusionProof, "messageInclusionProof"),
      noritoByteVecSequenceValue(inclusionBranch, "inclusionBranch")
    ]),
    SCCP_SOURCE_CHAIN_PROOF_ENVELOPE_SCHEMA_HASH_HEX
  );
  decodeSccpSourceChainProofSummary(sourceProofBytes, "sourceProofBytes");
  return Object.freeze({
    sourceProofHex: bytesToHex2(sourceProofBytes),
    sourceProofBytes: copyBytes(sourceProofBytes),
    sourceEventDigest,
    sourceEventLeafHash,
    receiptOrMessageRoot,
    finalityHeight: finalityHeight.toString(),
    finalityBlockHash: normalizedFinalityBlockHash,
    finalizedHeaderHash,
    txId
  });
}
var sccpSourceEventLeafHash = (sourceEventDigest) => bytesToHex2(
  prefixedBlake2b(
    SCCP_SOURCE_EVENT_LEAF_PREFIX_V1,
    nonZeroHex32Bytes(sourceEventDigest, "sourceEventDigest")
  )
);
var hashSccpSourceMerkleNode = (left, right) => bytesToHex2(
  prefixedBlake2b(
    SCCP_SOURCE_NODE_PREFIX_V1,
    concatBytes2(
      hexToBytes2(left, "sourceMerkle.left", 32),
      hexToBytes2(right, "sourceMerkle.right", 32)
    )
  )
);
var sccpSourceMessageRootFromBranch = (leafHash, leafIndex, branch) => {
  let current = normalizeNonZeroHex32(leafHash, "sourceEventLeafHash");
  let index = normalizeUnsignedBigIntMax(
    leafIndex,
    "leafIndex",
    SCCP_U64_MAX,
    "u64"
  );
  for (const [branchIndex, siblingValue] of branch.entries()) {
    const sibling = normalizeNonZeroHex32(
      siblingValue,
      `inclusionBranch[${branchIndex}]`
    );
    current = (index & 1n) === 0n ? hashSccpSourceMerkleNode(current, sibling) : hashSccpSourceMerkleNode(sibling, current);
    index >>= 1n;
  }
  return current;
};
var sccpSourceFinalizedHeaderHash = ({
  sourceDomain,
  finalityModelCanonical,
  finalityHeight,
  finalityBlockHash,
  receiptOrMessageRoot
}) => {
  let out = new Uint8Array();
  out = writeU8(out, 1);
  out = writeU32Le(out, sourceDomain);
  out = writeU8(out, finalityModelCanonical);
  out = writeU64Le(out, finalityHeight);
  out = concatBytes2(
    out,
    hexToBytes2(finalityBlockHash, "finalityBlockHash", 32),
    hexToBytes2(receiptOrMessageRoot, "receiptOrMessageRoot", 32)
  );
  return bytesToHex2(prefixedBlake2b(SCCP_SOURCE_HEADER_PREFIX_V1, out));
};
var normalizeTonRawAddress = (value, label) => {
  if (typeof value !== "string" || value.trim() !== value) {
    throw new TypeError(`${label} must not contain whitespace`);
  }
  const parts = value.split(":");
  if (parts.length !== 2) {
    throw new TypeError(`${label} must be workchain:account_hex`);
  }
  const [workchain, accountHex] = parts;
  if (!/^-?[0-9]+$/.test(workchain) || workchain.startsWith("-") && workchain.slice(1) === "0" || workchain.replace(/^-/, "").length > 1 && workchain.replace(/^-/, "").startsWith("0")) {
    throw new TypeError(`${label} workchain must be canonical i32`);
  }
  const workchainId = Number.parseInt(workchain, 10);
  if (!Number.isSafeInteger(workchainId) || workchainId < -(2 ** 31) || workchainId > 2 ** 31 - 1) {
    throw new TypeError(`${label} workchain must be canonical i32`);
  }
  if (workchainId !== 0) {
    throw new TypeError(`${label} workchain must be basechain 0`);
  }
  if (accountHex.length !== 64) {
    throw new TypeError(`${label} account must be 32 bytes`);
  }
  if (/[^0-9a-f]/.test(accountHex)) {
    throw new TypeError(`${label} account must be lowercase canonical hex`);
  }
  if (!hexToBytes2(accountHex, `${label} account`, 32).some((byte) => byte !== 0)) {
    throw new TypeError(`${label} account must not be zero`);
  }
  return value;
};
var normalizeDestinationBindingVersion = (input, label) => {
  const versionInput = optionalResultField(input, "version");
  if (versionInput === SCCP_OPTIONAL_FIELD_MISSING) return 1;
  return normalizeV1Version(versionInput, label, TypeError);
};
var destinationBindingHashFromInput = (input) => strictResultField(
  input,
  "destinationBinding.bindingHash",
  "bindingHash",
  "binding_hash",
  "destinationBindingHash",
  "destination_binding_hash"
);
var requireDestinationBindingHashMatches = (actual, expected, label) => {
  if (actual === void 0 || actual === null) return;
  if (normalizeNonZeroHex32(actual, label) !== expected) {
    throw new TypeError(`${label} must match destinationBinding`);
  }
};
var requireDestinationBindingKeyMatches = (actual, expected, label) => {
  if (actual === void 0 || actual === null) return;
  if (typeof actual !== "string" || actual.trim() !== expected) {
    throw new TypeError(`${label} must match destinationBinding`);
  }
};
function evmSccpDestinationBinding(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError(
      "EVM-family SCCP destination binding must be an object"
    );
  }
  const bindingField = (label, ...names) => strictResultField(input, label, ...names);
  const bindingOptionalField = (label, ...names) => strictOptionalResultField(input, label, ...names);
  const bindingDomain = (label, fallback, ...names) => {
    const selected = bindingOptionalField(label, ...names);
    if (selected === SCCP_OPTIONAL_FIELD_MISSING)
      return normalizeSccpDomainId(fallback, label);
    if (selected === null || selected === void 0) {
      throw new TypeError(`${label} must be a u32 domain id`);
    }
    return normalizeSccpDomainId(selected, label);
  };
  const bindingValueOrDefault = (label, fallback, ...names) => {
    const selected = bindingOptionalField(label, ...names);
    return selected === SCCP_OPTIONAL_FIELD_MISSING || selected === null ? fallback : selected;
  };
  const version = normalizeDestinationBindingVersion(
    input,
    "destinationBinding.version"
  );
  const sourceDomain = bindingDomain(
    "destinationBinding.sourceDomain",
    SCCP_DOMAIN_SORA,
    "sourceDomain",
    "source_domain"
  );
  const targetDomain = bindingDomain(
    "destinationBinding.targetDomain",
    SCCP_DOMAIN_ETH,
    "targetDomain",
    "target_domain"
  );
  if (sourceDomain !== SCCP_DOMAIN_SORA) {
    throw new RangeError("destinationBinding.sourceDomain must be SORA");
  }
  if (![SCCP_DOMAIN_ETH, SCCP_DOMAIN_BSC].includes(targetDomain)) {
    throw new RangeError("destinationBinding.targetDomain must be ETH or BSC");
  }
  if (sourceDomain === targetDomain) {
    throw new RangeError(
      "destinationBinding.sourceDomain and targetDomain must differ"
    );
  }
  const verifierBackend = bindingValueOrDefault(
    "destinationBinding.verifierBackend",
    SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1,
    "verifierBackend",
    "verifier_backend",
    "backend"
  );
  if (verifierBackend !== SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1) {
    throw new TypeError(
      "destinationBinding.verifierBackend must be evm-groth16-bn254-v1"
    );
  }
  const proofFamily = bindingValueOrDefault(
    "destinationBinding.proofFamily",
    SCCP_STARK_FRI_PROOF_FAMILY_V1,
    "proofFamily",
    "proof_family"
  );
  if (proofFamily !== SCCP_STARK_FRI_PROOF_FAMILY_V1) {
    throw new TypeError("destinationBinding.proofFamily must be stark-fri-v1");
  }
  const networkId = nonZeroHex(
    bindingField(
      "destinationBinding.networkId",
      "networkId",
      "network_id",
      "networkIdHex",
      "network_id_hex"
    ),
    "destinationBinding.networkId",
    32
  );
  const verifierAddress = nonZeroHex(
    bindingField(
      "destinationBinding.verifierAddress",
      "verifierAddress",
      "verifier_address",
      "verifierAddressHex",
      "verifier_address_hex"
    ),
    "destinationBinding.verifierAddress",
    20
  );
  const bridgeAddress = nonZeroHex(
    bindingField(
      "destinationBinding.bridgeAddress",
      "bridgeAddress",
      "bridge_address",
      "bridgeAddressHex",
      "bridge_address_hex"
    ),
    "destinationBinding.bridgeAddress",
    20
  );
  if (verifierAddress === bridgeAddress) {
    throw new RangeError(
      "destinationBinding.verifierAddress must differ from bridgeAddress"
    );
  }
  const verifierCodeHash = nonZeroHex(
    bindingField(
      "destinationBinding.verifierCodeHash",
      "verifierCodeHash",
      "verifier_code_hash",
      "verifierCodeHashHex",
      "verifier_code_hash_hex"
    ),
    "destinationBinding.verifierCodeHash",
    32
  );
  const verifierKeyHash = nonZeroHex(
    bindingField(
      "destinationBinding.verifierKeyHash",
      "verifierKeyHash",
      "verifier_key_hash",
      "verifierKeyHashHex",
      "verifier_key_hash_hex"
    ),
    "destinationBinding.verifierKeyHash",
    32
  );
  const networkIdBytes = hexToBytes2(
    networkId,
    "destinationBinding.networkId",
    32
  );
  const verifierAddressBytes = hexToBytes2(
    verifierAddress,
    "destinationBinding.verifierAddress",
    20
  );
  const bridgeAddressBytes = hexToBytes2(
    bridgeAddress,
    "destinationBinding.bridgeAddress",
    20
  );
  const verifierCodeHashBytes = hexToBytes2(
    verifierCodeHash,
    "destinationBinding.verifierCodeHash",
    32
  );
  const verifierKeyHashBytes = hexToBytes2(
    verifierKeyHash,
    "destinationBinding.verifierKeyHash",
    32
  );
  const payload = concatBytes2(
    keccak_256(textEncoder.encode(SCCP_EVM_DESTINATION_BINDING_LABEL_V1)),
    keccak_256(textEncoder.encode(verifierBackend)),
    keccak_256(textEncoder.encode(proofFamily)),
    networkIdBytes,
    abiWordU32(sourceDomain, "destinationBinding.sourceDomain"),
    abiWordU32(targetDomain, "destinationBinding.targetDomain"),
    abiWordAddress20(
      verifierAddressBytes,
      "destinationBinding.verifierAddress"
    ),
    abiWordAddress20(bridgeAddressBytes, "destinationBinding.bridgeAddress"),
    verifierCodeHashBytes,
    verifierKeyHashBytes
  );
  const bindingHash = bytesToHex2(keccak_256(payload));
  const key = `evm:${sourceDomain}:${targetDomain}:${bytesToHex2(networkIdBytes, false)}:${verifierAddress}:${bridgeAddress}:${verifierCodeHash}:${verifierKeyHash}`;
  requireDestinationBindingHashMatches(
    destinationBindingHashFromInput(input),
    bindingHash,
    "destinationBinding.bindingHash"
  );
  requireDestinationBindingKeyMatches(
    bindingField("destinationBinding.key", "key", "bindingKey", "binding_key"),
    key,
    "destinationBinding.key"
  );
  return Object.freeze({
    version,
    sourceDomain,
    targetDomain,
    networkId,
    verifierAddress,
    bridgeAddress,
    verifierCodeHash,
    verifierKeyHash,
    verifierBackend,
    proofFamily,
    key,
    bindingHash
  });
}
function ethereumMainnetSccpDestinationBinding(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError(
      "Ethereum mainnet SCCP destination binding must be an object"
    );
  }
  const sourceDomainInput = strictOptionalResultField(
    input,
    "destinationBinding.sourceDomain",
    "sourceDomain",
    "source_domain"
  );
  if (sourceDomainInput !== SCCP_OPTIONAL_FIELD_MISSING && normalizeSccpDomainId(
    sourceDomainInput,
    "destinationBinding.sourceDomain"
  ) !== SCCP_DOMAIN_SORA) {
    throw new RangeError(
      "Ethereum mainnet destinationBinding.sourceDomain must be SORA"
    );
  }
  const targetDomainInput = strictOptionalResultField(
    input,
    "destinationBinding.targetDomain",
    "targetDomain",
    "target_domain"
  );
  if (targetDomainInput !== SCCP_OPTIONAL_FIELD_MISSING && normalizeSccpDomainId(
    targetDomainInput,
    "destinationBinding.targetDomain"
  ) !== SCCP_DOMAIN_ETH) {
    throw new RangeError(
      "Ethereum mainnet destinationBinding.targetDomain must be ETH"
    );
  }
  const networkIdInput = strictOptionalResultField(
    input,
    "destinationBinding.networkId",
    "networkId",
    "network_id",
    "networkIdHex",
    "network_id_hex"
  );
  const normalizedInput = { ...input };
  for (const key of [
    "sourceDomain",
    "source_domain",
    "targetDomain",
    "target_domain",
    "networkId",
    "network_id",
    "networkIdHex",
    "network_id_hex"
  ]) {
    delete normalizedInput[key];
  }
  const binding = evmSccpDestinationBinding({
    ...normalizedInput,
    sourceDomain: SCCP_DOMAIN_SORA,
    targetDomain: SCCP_DOMAIN_ETH,
    networkId: networkIdInput === SCCP_OPTIONAL_FIELD_MISSING ? SCCP_ETH_MAINNET_NETWORK_ID : networkIdInput
  });
  if (binding.networkId !== SCCP_ETH_MAINNET_NETWORK_ID) {
    throw new RangeError(
      "Ethereum mainnet destinationBinding.networkId must be chain id 1"
    );
  }
  return binding;
}
function bscMainnetSccpDestinationBinding(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError(
      "BSC mainnet SCCP destination binding must be an object"
    );
  }
  const sourceDomainInput = strictOptionalResultField(
    input,
    "destinationBinding.sourceDomain",
    "sourceDomain",
    "source_domain"
  );
  if (sourceDomainInput !== SCCP_OPTIONAL_FIELD_MISSING && normalizeSccpDomainId(
    sourceDomainInput,
    "destinationBinding.sourceDomain"
  ) !== SCCP_DOMAIN_SORA) {
    throw new RangeError(
      "BSC mainnet destinationBinding.sourceDomain must be SORA"
    );
  }
  const targetDomainInput = strictOptionalResultField(
    input,
    "destinationBinding.targetDomain",
    "targetDomain",
    "target_domain"
  );
  if (targetDomainInput !== SCCP_OPTIONAL_FIELD_MISSING && normalizeSccpDomainId(
    targetDomainInput,
    "destinationBinding.targetDomain"
  ) !== SCCP_DOMAIN_BSC) {
    throw new RangeError(
      "BSC mainnet destinationBinding.targetDomain must be BSC"
    );
  }
  const networkIdInput = strictOptionalResultField(
    input,
    "destinationBinding.networkId",
    "networkId",
    "network_id",
    "networkIdHex",
    "network_id_hex"
  );
  const normalizedInput = { ...input };
  for (const key of [
    "sourceDomain",
    "source_domain",
    "targetDomain",
    "target_domain",
    "networkId",
    "network_id",
    "networkIdHex",
    "network_id_hex"
  ]) {
    delete normalizedInput[key];
  }
  const binding = evmSccpDestinationBinding({
    ...normalizedInput,
    sourceDomain: SCCP_DOMAIN_SORA,
    targetDomain: SCCP_DOMAIN_BSC,
    networkId: networkIdInput === SCCP_OPTIONAL_FIELD_MISSING ? SCCP_BSC_MAINNET_NETWORK_ID : networkIdInput
  });
  if (binding.networkId !== SCCP_BSC_MAINNET_NETWORK_ID) {
    throw new RangeError(
      "BSC mainnet destinationBinding.networkId must be chain id 56"
    );
  }
  return binding;
}
function bscTestnetSccpDestinationBinding(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError(
      "BSC testnet SCCP destination binding must be an object"
    );
  }
  const sourceDomainInput = strictOptionalResultField(
    input,
    "destinationBinding.sourceDomain",
    "sourceDomain",
    "source_domain"
  );
  if (sourceDomainInput !== SCCP_OPTIONAL_FIELD_MISSING && normalizeSccpDomainId(
    sourceDomainInput,
    "destinationBinding.sourceDomain"
  ) !== SCCP_DOMAIN_SORA) {
    throw new RangeError(
      "BSC testnet destinationBinding.sourceDomain must be SORA"
    );
  }
  const targetDomainInput = strictOptionalResultField(
    input,
    "destinationBinding.targetDomain",
    "targetDomain",
    "target_domain"
  );
  if (targetDomainInput !== SCCP_OPTIONAL_FIELD_MISSING && normalizeSccpDomainId(
    targetDomainInput,
    "destinationBinding.targetDomain"
  ) !== SCCP_DOMAIN_BSC) {
    throw new RangeError(
      "BSC testnet destinationBinding.targetDomain must be BSC"
    );
  }
  const networkIdInput = strictOptionalResultField(
    input,
    "destinationBinding.networkId",
    "networkId",
    "network_id",
    "networkIdHex",
    "network_id_hex"
  );
  const normalizedInput = { ...input };
  for (const key of [
    "sourceDomain",
    "source_domain",
    "targetDomain",
    "target_domain",
    "networkId",
    "network_id",
    "networkIdHex",
    "network_id_hex"
  ]) {
    delete normalizedInput[key];
  }
  const binding = evmSccpDestinationBinding({
    ...normalizedInput,
    sourceDomain: SCCP_DOMAIN_SORA,
    targetDomain: SCCP_DOMAIN_BSC,
    networkId: networkIdInput === SCCP_OPTIONAL_FIELD_MISSING ? SCCP_BSC_TESTNET_NETWORK_ID : networkIdInput
  });
  if (binding.networkId !== SCCP_BSC_TESTNET_NETWORK_ID) {
    throw new RangeError(
      "BSC testnet destinationBinding.networkId must be chain id 97"
    );
  }
  return binding;
}
var nonZeroHexBytes = (value, label, byteLength) => {
  const bytes = hexToBytes2(value, label, byteLength);
  if (bytes.every((byte) => byte === 0)) {
    throw new TypeError(`${label} must not be zero`);
  }
  return bytes;
};
var nonZeroHex = (value, label, byteLength) => bytesToHex2(nonZeroHexBytes(value, label, byteLength));
function toBytes2(value, label) {
  if (value instanceof Uint8Array) return value;
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (Array.isArray(value)) {
    return Uint8Array.from(value);
  }
  if (typeof value === "string") {
    return hexToBytes2(value, label);
  }
  throw new TypeError(`${label} must be bytes or hex`);
}

// src/provers/sccp-ton-source-prover.js
var ROUTE_ID = "taira_ton_xor";
var ASSET_KEY = "xor";
var TAIRA_DOMAIN = 0;
var DECIMALS = 9;
var asRecord = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value;
};
var readString = (value, label) => {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new TypeError(`${label} is required.`);
  }
  return text;
};
var optionalString = (record, ...keys) => {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" || typeof value === "bigint") {
      return String(value);
    }
  }
  return "";
};
var normalizeHex32 = (value, label) => {
  const raw = readString(value, label).toLowerCase().replace(/^0x/u, "");
  if (!/^[0-9a-f]{64}$/u.test(raw) || /^0+$/u.test(raw)) {
    throw new TypeError(`${label} must be a non-zero 32-byte hex value.`);
  }
  return `0x${raw}`;
};
var decimalToBaseUnits = (value) => {
  const text = readString(value, "amountDecimal");
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u.test(text)) {
    throw new TypeError("amountDecimal must be a positive decimal string.");
  }
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > DECIMALS) {
    throw new TypeError("amountDecimal has too many fractional digits.");
  }
  const baseUnits = BigInt(whole) * 10n ** BigInt(DECIMALS) + BigInt((fraction + "0".repeat(DECIMALS)).slice(0, DECIMALS) || "0");
  if (baseUnits <= 0n) {
    throw new TypeError("amountDecimal must be greater than zero.");
  }
  return baseUnits.toString();
};
var readAmountBaseUnits = (input, transaction) => {
  const explicit = optionalString(
    transaction,
    "amountBaseUnits",
    "amount_base_units"
  );
  if (explicit) {
    if (!/^[1-9][0-9]*$/u.test(explicit)) {
      throw new TypeError("transaction.amountBaseUnits must be positive.");
    }
    return explicit;
  }
  return decimalToBaseUnits(input.amountDecimal ?? input.amount_decimal);
};
var readNonce = (input, transaction) => {
  const nonce = optionalString(transaction, "nonce") || optionalString(input, "nonce");
  if (!/^(?:0|[1-9][0-9]*)$/u.test(nonce)) {
    throw new TypeError(
      "TON source proof input must include the source-record nonce."
    );
  }
  return nonce;
};
var buildTonSourceProofPackage = (inputValue) => {
  const input = asRecord(inputValue, "TON source proof input");
  const transaction = asRecord(
    input.transaction ?? {},
    "TON source proof input.transaction"
  );
  const txId = normalizeHex32(
    input.txId ?? input.tx_id ?? transaction.hash ?? transaction.txId ?? transaction.tx_id,
    "txId"
  );
  const tonSender = readString(
    input.tonSender ?? input.ton_sender,
    "tonSender"
  );
  const tairaRecipient = readString(
    input.tairaRecipient ?? input.taira_recipient,
    "tairaRecipient"
  );
  const amount = readAmountBaseUnits(input, transaction);
  const nonce = readNonce(input, transaction);
  const payload = buildTairaXorTonToTairaTransferPayload({
    tonSender,
    tairaRecipient,
    amount,
    nonce,
    routeId: ROUTE_ID,
    assetKey: ASSET_KEY
  });
  const payloadHash = sccpPayloadHash(
    canonicalSccpPayloadEnvelopeBytes({
      kind: "Transfer",
      value: payload
    })
  );
  const messageId = sccpTransferMessageId(payload);
  const expectedPayloadHash = optionalString(
    transaction,
    "payloadHash",
    "payload_hash"
  );
  if (expectedPayloadHash && normalizeHex32(expectedPayloadHash, "payloadHash") !== payloadHash) {
    throw new TypeError(
      "TON source payload hash does not match the source record."
    );
  }
  const expectedMessageId = optionalString(
    transaction,
    "messageId",
    "message_id"
  );
  if (expectedMessageId && normalizeHex32(expectedMessageId, "messageId") !== messageId) {
    throw new TypeError(
      "TON source message id does not match the source record."
    );
  }
  const commitment = {
    version: 1,
    kind: "Transfer",
    target_domain: TAIRA_DOMAIN,
    message_id: messageId,
    payload_hash: payloadHash
  };
  const merkleProof = { steps: [] };
  const commitmentRoot = sccpMerkleRootFromCommitment(commitment, merkleProof);
  const expectedCommitmentRoot = optionalString(
    transaction,
    "commitmentRoot",
    "commitment_root"
  );
  if (expectedCommitmentRoot && normalizeHex32(expectedCommitmentRoot, "commitmentRoot") !== commitmentRoot) {
    throw new TypeError(
      "TON source commitment root does not match the source record."
    );
  }
  const sourceProof = buildTonTestnetPlaceholderSourceChainProofEnvelope({
    txId,
    messageId,
    payloadHash,
    commitmentRoot,
    ...optionalString(input, "finalityHeight", "finality_height") ? {
      finalityHeight: optionalString(
        input,
        "finalityHeight",
        "finality_height"
      )
    } : {},
    ...optionalString(input, "finalityBlockHash", "finality_block_hash") ? {
      finalityBlockHash: optionalString(
        input,
        "finalityBlockHash",
        "finality_block_hash"
      )
    } : {}
  });
  return {
    txId,
    messageId,
    commitmentRoot,
    amountBaseUnits: amount,
    sourceEventDigest: sourceProof.sourceEventDigest,
    messageBundle: {
      version: 1,
      commitmentRoot,
      commitment,
      merkleProof,
      payload: {
        kind: "Transfer",
        value: payload
      },
      finalityProof: sourceProof.sourceProofHex
    },
    settlement: {
      entrypoint: "finalize_inbound",
      route: ROUTE_ID
    }
  };
};
var proveTonSccpSource = async (input) => buildTonSourceProofPackage(input);
var irohaSccpTonSourceProve = proveTonSccpSource;
var tonSccpSourceProve = proveTonSccpSource;
var proveTonSource = proveTonSccpSource;
export {
  irohaSccpTonSourceProve,
  proveTonSccpSource,
  proveTonSource,
  tonSccpSourceProve
};
