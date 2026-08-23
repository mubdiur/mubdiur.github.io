var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// web/class-reader.ts
function parseClassMeta(data) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let pos = 0;
  function u8() {
    return dv.getUint8(pos++);
  }
  function u16() {
    const v = dv.getUint16(pos);
    pos += 2;
    return v;
  }
  function u32() {
    const v = dv.getUint32(pos);
    pos += 4;
    return v;
  }
  function skip(n) {
    pos += n;
  }
  const magic = u32();
  if (magic !== 3405691582) throw new Error("Not a valid .class file");
  skip(4);
  const cpCount = u16();
  const cp = [null];
  for (let i = 1; i < cpCount; i++) {
    const tag = u8();
    switch (tag) {
      case 1: {
        const len = u16();
        let s = "";
        for (let j = 0; j < len; j++) s += String.fromCharCode(u8());
        cp.push(s);
        break;
      }
      case 7: {
        cp.push(`#class:${u16()}`);
        break;
      }
      case 8: {
        cp.push(`#str:${u16()}`);
        break;
      }
      case 9: {
        cp.push(`#field:${u16()}:${u16()}`);
        break;
      }
      case 10: {
        cp.push(`#meth:${u16()}:${u16()}`);
        break;
      }
      case 11: {
        cp.push(`#imeth:${u16()}:${u16()}`);
        break;
      }
      case 12: {
        cp.push(`#nat:${u16()}:${u16()}`);
        break;
      }
      case 18: {
        cp.push(`#indy:${u16()}:${u16()}`);
        break;
      }
      case 3: {
        skip(4);
        cp.push(null);
        break;
      }
      // Integer
      case 4: {
        skip(4);
        cp.push(null);
        break;
      }
      // Float
      case 5: {
        skip(8);
        cp.push(null);
        cp.push(null);
        i++;
        break;
      }
      // Long (2 slots)
      case 6: {
        skip(8);
        cp.push(null);
        cp.push(null);
        i++;
        break;
      }
      // Double (2 slots)
      case 15: {
        skip(3);
        cp.push(null);
        break;
      }
      // MethodHandle
      case 16: {
        skip(2);
        cp.push(null);
        break;
      }
      // MethodType
      case 17: {
        skip(4);
        cp.push(null);
        break;
      }
      // Dynamic
      case 19: {
        skip(2);
        cp.push(null);
        break;
      }
      // Module
      case 20: {
        skip(2);
        cp.push(null);
        break;
      }
      // Package
      default: {
        cp.push(null);
        break;
      }
    }
  }
  function resolveClass(idx) {
    const entry = cp[idx];
    if (!entry) return "";
    const m = entry.match(/^#class:(\d+)$/);
    return m ? cp[+m[1]] ?? "" : "";
  }
  const accessFlags = u16();
  const thisClassName = resolveClass(u16());
  const superClassName = resolveClass(u16());
  const ifCount = u16();
  const interfaces = [];
  for (let i = 0; i < ifCount; i++) {
    interfaces.push(resolveClass(u16()));
  }
  const fieldCount = u16();
  const fields = [];
  for (let i = 0; i < fieldCount; i++) {
    const fFlags = u16();
    const fNameIdx = u16();
    const fDescIdx = u16();
    const fName = cp[fNameIdx] ?? "";
    const fDesc = cp[fDescIdx] ?? "";
    fields.push({ name: fName, descriptor: fDesc, accessFlags: fFlags });
    const attrCount = u16();
    for (let a = 0; a < attrCount; a++) {
      skip(2);
      skip(u32());
    }
  }
  const methodCount = u16();
  const methods = [];
  for (let i = 0; i < methodCount; i++) {
    const mFlags = u16();
    const mNameIdx = u16();
    const mDescIdx = u16();
    const mName = cp[mNameIdx] ?? "";
    const mDesc = cp[mDescIdx] ?? "";
    methods.push({ name: mName, descriptor: mDesc, accessFlags: mFlags });
    const attrCount = u16();
    for (let a = 0; a < attrCount; a++) {
      skip(2);
      skip(u32());
    }
  }
  return {
    name: thisClassName,
    accessFlags,
    superClass: superClassName,
    interfaces,
    fields,
    methods
  };
}
function parseBundleMeta(bundle) {
  const dv = new DataView(bundle.buffer, bundle.byteOffset, bundle.byteLength);
  const classes = [];
  let pos = 0;
  while (pos + 4 <= bundle.length) {
    const size = dv.getUint32(pos);
    pos += 4;
    if (pos + size > bundle.length) break;
    try {
      classes.push(parseClassMeta(bundle.subarray(pos, pos + size)));
    } catch {
    }
    pos += size;
  }
  return classes;
}
function descriptorToType(desc) {
  switch (desc[0]) {
    case "B":
      return "byte";
    case "C":
      return "char";
    case "S":
      return "short";
    case "I":
      return "int";
    case "J":
      return "long";
    case "F":
      return "float";
    case "D":
      return "double";
    case "Z":
      return "boolean";
    case "V":
      return "void";
    case "L": {
      const className = desc.slice(1, desc.length - 1);
      if (className === "java/lang/String") return "String";
      return { className };
    }
    case "[": {
      return { array: descriptorToType(desc.slice(1)) };
    }
    default:
      return { className: desc };
  }
}
function parseMethodDescriptor(desc) {
  const params = [];
  let i = 1;
  while (i < desc.length && desc[i] !== ")") {
    const [type, consumed] = parseOneDescriptor(desc, i);
    params.push(type);
    i += consumed;
  }
  i++;
  const [ret] = parseOneDescriptor(desc, i);
  return { params, ret };
}
function parseOneDescriptor(desc, start) {
  switch (desc[start]) {
    case "B":
      return ["byte", 1];
    case "C":
      return ["char", 1];
    case "S":
      return ["short", 1];
    case "I":
      return ["int", 1];
    case "J":
      return ["long", 1];
    case "F":
      return ["float", 1];
    case "D":
      return ["double", 1];
    case "Z":
      return ["boolean", 1];
    case "V":
      return ["void", 1];
    case "L": {
      const semi = desc.indexOf(";", start);
      const className = desc.slice(start + 1, semi);
      if (className === "java/lang/String") return ["String", semi - start + 1];
      return [{ className }, semi - start + 1];
    }
    case "[": {
      const [inner, consumed] = parseOneDescriptor(desc, start + 1);
      return [{ array: inner }, 1 + consumed];
    }
    default:
      return [{ className: desc.slice(start) }, desc.length - start];
  }
}
function buildClassInterfaces(classes) {
  const result = {};
  for (const cls of classes) {
    if (cls.interfaces.length > 0) {
      result[cls.name] = cls.interfaces;
    }
  }
  return result;
}
function buildMethodRegistry(classes) {
  const registry = {};
  for (const cls of classes) {
    const isInterface = (cls.accessFlags & 512) !== 0;
    for (const m of cls.methods) {
      const lparen = m.descriptor.indexOf("(");
      const rparen = m.descriptor.indexOf(")");
      if (lparen < 0 || rparen < 0) continue;
      const argDescs = m.descriptor.slice(lparen + 1, rparen);
      const retDesc = m.descriptor.slice(rparen + 1);
      const key = `${cls.name}.${m.name}(${argDescs})`;
      const { params } = parseMethodDescriptor(m.descriptor);
      const ret = descriptorToType(retDesc);
      const isStatic = (m.accessFlags & 8) !== 0;
      const isAbstract = (m.accessFlags & 1024) !== 0;
      registry[key] = {
        owner: cls.name,
        returnType: ret,
        paramTypes: params,
        ...isInterface ? { isInterface: true } : {},
        ...isStatic ? { isStatic: true } : {},
        isAbstract
      };
    }
  }
  return registry;
}
async function readJar(jarBytes) {
  const dv = new DataView(jarBytes.buffer, jarBytes.byteOffset, jarBytes.byteLength);
  const result = /* @__PURE__ */ new Map();
  let eocdPos = -1;
  for (let i = jarBytes.length - 22; i >= Math.max(0, jarBytes.length - 65557); i--) {
    if (dv.getUint32(i, true) === 101010256) {
      eocdPos = i;
      break;
    }
  }
  if (eocdPos < 0) throw new Error("Not a valid ZIP/JAR file (EOCD not found)");
  const cdOffset = dv.getUint32(eocdPos + 16, true);
  const cdEntries = dv.getUint16(eocdPos + 10, true);
  let cdPos = cdOffset;
  for (let i = 0; i < cdEntries; i++) {
    if (dv.getUint32(cdPos, true) !== 33639248) break;
    const compressionMethod = dv.getUint16(cdPos + 10, true);
    const compressedSize = dv.getUint32(cdPos + 20, true);
    const uncompressedSize = dv.getUint32(cdPos + 24, true);
    const nameLen = dv.getUint16(cdPos + 28, true);
    const extraLen = dv.getUint16(cdPos + 30, true);
    const commentLen = dv.getUint16(cdPos + 32, true);
    const localHeaderOffset = dv.getUint32(cdPos + 42, true);
    const nameBytes = jarBytes.subarray(cdPos + 46, cdPos + 46 + nameLen);
    const fileName = new TextDecoder().decode(nameBytes);
    cdPos += 46 + nameLen + extraLen + commentLen;
    if (!fileName.endsWith(".class")) continue;
    const localExtraLen = dv.getUint16(localHeaderOffset + 28, true);
    const localNameLen = dv.getUint16(localHeaderOffset + 26, true);
    const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const rawData = jarBytes.subarray(dataOffset, dataOffset + compressedSize);
    if (compressionMethod === 0) {
      result.set(fileName, rawData);
    } else if (compressionMethod === 8) {
      const ds = new DecompressionStream("deflate-raw");
      const writer = ds.writable.getWriter();
      const reader = ds.readable.getReader();
      const writePromise = writer.write(rawData).then(() => writer.close());
      const chunks = [];
      let totalLen = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalLen += value.length;
      }
      await writePromise;
      const decompressed = new Uint8Array(uncompressedSize || totalLen);
      let offset = 0;
      for (const chunk of chunks) {
        decompressed.set(chunk, offset);
        offset += chunk.length;
      }
      result.set(fileName, decompressed);
    }
  }
  return result;
}
function classFilesToBundle(classFiles) {
  let totalSize = 0;
  for (const data of classFiles.values()) {
    totalSize += 4 + data.length;
  }
  const bundle = new Uint8Array(totalSize);
  const dv = new DataView(bundle.buffer);
  let pos = 0;
  for (const data of classFiles.values()) {
    dv.setUint32(pos, data.length);
    pos += 4;
    bundle.set(data, pos);
    pos += data.length;
  }
  return bundle;
}

// web/javac/lexer.ts
var TokenKind = /* @__PURE__ */ ((TokenKind2) => {
  TokenKind2["IntLiteral"] = "IntLiteral";
  TokenKind2["LongLiteral"] = "LongLiteral";
  TokenKind2["FloatLiteral"] = "FloatLiteral";
  TokenKind2["DoubleLiteral"] = "DoubleLiteral";
  TokenKind2["CharLiteral"] = "CharLiteral";
  TokenKind2["StringLiteral"] = "StringLiteral";
  TokenKind2["BoolLiteral"] = "BoolLiteral";
  TokenKind2["NullLiteral"] = "NullLiteral";
  TokenKind2["Ident"] = "Ident";
  TokenKind2["KwClass"] = "class";
  TokenKind2["KwPublic"] = "public";
  TokenKind2["KwStatic"] = "static";
  TokenKind2["KwVoid"] = "void";
  TokenKind2["KwInt"] = "int";
  TokenKind2["KwLong"] = "long";
  TokenKind2["KwShort"] = "short";
  TokenKind2["KwByte"] = "byte";
  TokenKind2["KwChar"] = "char";
  TokenKind2["KwFloat"] = "float";
  TokenKind2["KwDouble"] = "double";
  TokenKind2["KwBoolean"] = "boolean";
  TokenKind2["KwString"] = "String";
  TokenKind2["KwReturn"] = "return";
  TokenKind2["KwNew"] = "new";
  TokenKind2["KwIf"] = "if";
  TokenKind2["KwElse"] = "else";
  TokenKind2["KwWhile"] = "while";
  TokenKind2["KwFor"] = "for";
  TokenKind2["KwSwitch"] = "switch";
  TokenKind2["KwCase"] = "case";
  TokenKind2["KwDefault"] = "default";
  TokenKind2["KwYield"] = "yield";
  TokenKind2["KwWhen"] = "when";
  TokenKind2["KwThis"] = "this";
  TokenKind2["KwSuper"] = "super";
  TokenKind2["KwExtends"] = "extends";
  TokenKind2["KwImplements"] = "implements";
  TokenKind2["KwImport"] = "import";
  TokenKind2["KwPackage"] = "package";
  TokenKind2["KwPrivate"] = "private";
  TokenKind2["KwProtected"] = "protected";
  TokenKind2["KwFinal"] = "final";
  TokenKind2["KwAbstract"] = "abstract";
  TokenKind2["KwVar"] = "var";
  TokenKind2["KwInstanceof"] = "instanceof";
  TokenKind2["KwRecord"] = "record";
  TokenKind2["KwModule"] = "module";
  TokenKind2["KwOpen"] = "open";
  TokenKind2["KwRequires"] = "requires";
  TokenKind2["KwTransitive"] = "transitive";
  TokenKind2["KwExports"] = "exports";
  TokenKind2["KwOpens"] = "opens";
  TokenKind2["KwTo"] = "to";
  TokenKind2["KwUses"] = "uses";
  TokenKind2["KwProvides"] = "provides";
  TokenKind2["KwWith"] = "with";
  TokenKind2["KwSealed"] = "sealed";
  TokenKind2["KwPermits"] = "permits";
  TokenKind2["KwNonSealed"] = "non-sealed";
  TokenKind2["KwInterface"] = "interface";
  TokenKind2["KwEnum"] = "enum";
  TokenKind2["KwDo"] = "do";
  TokenKind2["KwThrow"] = "throw";
  TokenKind2["KwThrows"] = "throws";
  TokenKind2["KwTry"] = "try";
  TokenKind2["KwCatch"] = "catch";
  TokenKind2["KwFinally"] = "finally";
  TokenKind2["KwAssert"] = "assert";
  TokenKind2["KwSynchronized"] = "synchronized";
  TokenKind2["KwBreak"] = "break";
  TokenKind2["KwContinue"] = "continue";
  TokenKind2["KwNative"] = "native";
  TokenKind2["KwStrictfp"] = "strictfp";
  TokenKind2["KwTransient"] = "transient";
  TokenKind2["KwVolatile"] = "volatile";
  TokenKind2["KwConst"] = "const";
  TokenKind2["KwGoto"] = "goto";
  TokenKind2["LParen"] = "(";
  TokenKind2["RParen"] = ")";
  TokenKind2["LBrace"] = "{";
  TokenKind2["RBrace"] = "}";
  TokenKind2["LBracket"] = "[";
  TokenKind2["RBracket"] = "]";
  TokenKind2["Semi"] = ";";
  TokenKind2["Comma"] = ",";
  TokenKind2["Dot"] = ".";
  TokenKind2["Ellipsis"] = "...";
  TokenKind2["At"] = "@";
  TokenKind2["Plus"] = "+";
  TokenKind2["Minus"] = "-";
  TokenKind2["Star"] = "*";
  TokenKind2["Slash"] = "/";
  TokenKind2["Percent"] = "%";
  TokenKind2["Assign"] = "=";
  TokenKind2["Eq"] = "==";
  TokenKind2["Ne"] = "!=";
  TokenKind2["Lt"] = "<";
  TokenKind2["Gt"] = ">";
  TokenKind2["Le"] = "<=";
  TokenKind2["Ge"] = ">=";
  TokenKind2["And"] = "&&";
  TokenKind2["Or"] = "||";
  TokenKind2["BitAnd"] = "&";
  TokenKind2["BitOr"] = "|";
  TokenKind2["BitXor"] = "^";
  TokenKind2["BitNot"] = "~";
  TokenKind2["ShiftLeft"] = "<<";
  TokenKind2["ShiftRight"] = ">>";
  TokenKind2["ShiftUnsigned"] = ">>>";
  TokenKind2["Not"] = "!";
  TokenKind2["PlusAssign"] = "+=";
  TokenKind2["MinusAssign"] = "-=";
  TokenKind2["StarAssign"] = "*=";
  TokenKind2["SlashAssign"] = "/=";
  TokenKind2["PercentAssign"] = "%=";
  TokenKind2["AndAssign"] = "&=";
  TokenKind2["OrAssign"] = "|=";
  TokenKind2["XorAssign"] = "^=";
  TokenKind2["ShiftLeftAssign"] = "<<=";
  TokenKind2["ShiftRightAssign"] = ">>=";
  TokenKind2["ShiftUnsignedAssign"] = ">>>=";
  TokenKind2["PlusPlus"] = "++";
  TokenKind2["MinusMinus"] = "--";
  TokenKind2["Question"] = "?";
  TokenKind2["Colon"] = ":";
  TokenKind2["ColonColon"] = "::";
  TokenKind2["Arrow"] = "->";
  TokenKind2["EOF"] = "EOF";
  return TokenKind2;
})(TokenKind || {});
var IDENT_START_RE = /[$_\p{ID_Start}]/u;
var IDENT_PART_RE = /[$_\u200C\u200D\p{ID_Continue}]/u;
var NUM_DEC = "[0-9](?:_?[0-9])*";
var NUM_NZ_DEC = "[1-9](?:_?[0-9])*";
var NUM_HEX = "[0-9a-fA-F](?:_?[0-9a-fA-F])*";
var NUM_BIN = "[01](?:_?[01])*";
var NUM_EXP10 = `[eE][+-]?${NUM_DEC}`;
var NUM_EXP2 = `[pP][+-]?${NUM_DEC}`;
var NUMBER_PATTERNS = [
  { re: new RegExp(`^0[xX](?:${NUM_HEX}\\.(?:${NUM_HEX})?|(?:${NUM_HEX})?\\.${NUM_HEX})${NUM_EXP2}[fFdD]?`), kind: "DoubleLiteral" /* DoubleLiteral */ },
  { re: new RegExp(`^0[xX]${NUM_HEX}${NUM_EXP2}[fFdD]?`), kind: "DoubleLiteral" /* DoubleLiteral */ },
  { re: new RegExp(`^(?:${NUM_DEC}\\.(?:${NUM_DEC})?|\\.${NUM_DEC})(?:${NUM_EXP10})?[fFdD]?`), kind: "DoubleLiteral" /* DoubleLiteral */ },
  { re: new RegExp(`^${NUM_DEC}${NUM_EXP10}[fFdD]?`), kind: "DoubleLiteral" /* DoubleLiteral */ },
  { re: new RegExp(`^${NUM_DEC}[fFdD]`), kind: "FloatLiteral" /* FloatLiteral */ },
  { re: new RegExp(`^0[xX]${NUM_HEX}[lL]?`), kind: "IntLiteral" /* IntLiteral */ },
  { re: new RegExp(`^0[bB]${NUM_BIN}[lL]?`), kind: "IntLiteral" /* IntLiteral */ },
  { re: new RegExp("^0(?:_?[0-7])+[lL]?"), kind: "IntLiteral" /* IntLiteral */ },
  { re: new RegExp(`^(?:0|${NUM_NZ_DEC})[lL]?`), kind: "IntLiteral" /* IntLiteral */ }
];
function isIdentifierStart(cp) {
  return cp !== "\0" && IDENT_START_RE.test(cp);
}
function isIdentifierPart(cp) {
  return cp !== "\0" && IDENT_PART_RE.test(cp);
}
function preprocessUnicodeEscapes(input) {
  let out = "";
  let line = 1;
  let col = 1;
  let lastWasCR = false;
  const bump = (ch) => {
    if (ch === "\r") {
      line++;
      col = 1;
      lastWasCR = true;
    } else if (ch === "\n") {
      if (!lastWasCR) {
        line++;
        col = 1;
      }
      lastWasCR = false;
    } else {
      col++;
      lastWasCR = false;
    }
  };
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch !== "\\") {
      out += ch;
      bump(ch);
      continue;
    }
    let j = i + 1;
    if (j >= input.length || input[j] !== "u") {
      out += ch;
      bump(ch);
      continue;
    }
    while (j < input.length && input[j] === "u") j++;
    if (j + 4 > input.length) throw new Error(`Invalid Unicode escape sequence at line ${line}:${col}`);
    const hex = input.slice(j, j + 4);
    if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Error(`Invalid Unicode escape: \\u${hex} at line ${line}:${col}`);
    const translated = String.fromCharCode(parseInt(hex, 16));
    out += translated;
    bump(translated);
    i = j + 3;
  }
  return out;
}
var KEYWORDS = {
  class: "class" /* KwClass */,
  public: "public" /* KwPublic */,
  static: "static" /* KwStatic */,
  void: "void" /* KwVoid */,
  int: "int" /* KwInt */,
  long: "long" /* KwLong */,
  short: "short" /* KwShort */,
  byte: "byte" /* KwByte */,
  char: "char" /* KwChar */,
  float: "float" /* KwFloat */,
  double: "double" /* KwDouble */,
  boolean: "boolean" /* KwBoolean */,
  String: "String" /* KwString */,
  return: "return" /* KwReturn */,
  new: "new" /* KwNew */,
  if: "if" /* KwIf */,
  else: "else" /* KwElse */,
  while: "while" /* KwWhile */,
  for: "for" /* KwFor */,
  switch: "switch" /* KwSwitch */,
  case: "case" /* KwCase */,
  default: "default" /* KwDefault */,
  yield: "yield" /* KwYield */,
  when: "when" /* KwWhen */,
  this: "this" /* KwThis */,
  super: "super" /* KwSuper */,
  true: "BoolLiteral" /* BoolLiteral */,
  false: "BoolLiteral" /* BoolLiteral */,
  null: "NullLiteral" /* NullLiteral */,
  extends: "extends" /* KwExtends */,
  implements: "implements" /* KwImplements */,
  import: "import" /* KwImport */,
  package: "package" /* KwPackage */,
  private: "private" /* KwPrivate */,
  protected: "protected" /* KwProtected */,
  final: "final" /* KwFinal */,
  abstract: "abstract" /* KwAbstract */,
  var: "var" /* KwVar */,
  instanceof: "instanceof" /* KwInstanceof */,
  record: "record" /* KwRecord */,
  module: "module" /* KwModule */,
  open: "open" /* KwOpen */,
  requires: "requires" /* KwRequires */,
  transitive: "transitive" /* KwTransitive */,
  exports: "exports" /* KwExports */,
  opens: "opens" /* KwOpens */,
  to: "to" /* KwTo */,
  uses: "uses" /* KwUses */,
  provides: "provides" /* KwProvides */,
  with: "with" /* KwWith */,
  sealed: "sealed" /* KwSealed */,
  permits: "permits" /* KwPermits */,
  "non-sealed": "non-sealed" /* KwNonSealed */,
  interface: "interface" /* KwInterface */,
  enum: "enum" /* KwEnum */,
  do: "do" /* KwDo */,
  throw: "throw" /* KwThrow */,
  throws: "throws" /* KwThrows */,
  try: "try" /* KwTry */,
  catch: "catch" /* KwCatch */,
  finally: "finally" /* KwFinally */,
  assert: "assert" /* KwAssert */,
  synchronized: "synchronized" /* KwSynchronized */,
  break: "break" /* KwBreak */,
  continue: "continue" /* KwContinue */,
  native: "native" /* KwNative */,
  strictfp: "strictfp" /* KwStrictfp */,
  transient: "transient" /* KwTransient */,
  volatile: "volatile" /* KwVolatile */,
  const: "const" /* KwConst */,
  goto: "goto" /* KwGoto */
};
function lex(source) {
  source = preprocessUnicodeEscapes(source);
  source = source.replace(/\r\n?/g, "\n");
  const tokens = [];
  let pos = 0;
  let line = 1;
  let col = 1;
  function peek() {
    return pos < source.length ? source[pos] : "\0";
  }
  function advance() {
    const ch = source[pos++];
    if (ch === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
    return ch;
  }
  function peekN(n) {
    return pos + n < source.length ? source[pos + n] : "\0";
  }
  function peekCodePoint() {
    const cp = source.codePointAt(pos);
    return cp === void 0 ? "\0" : String.fromCodePoint(cp);
  }
  function advanceCodePoint() {
    const cp = source.codePointAt(pos);
    if (cp === void 0) return "\0";
    const s = String.fromCodePoint(cp);
    pos += s.length;
    col += s.length;
    return s;
  }
  function parseEscape(startLine, startCol, inTextBlock) {
    const esc = advance();
    switch (esc) {
      case "b":
        return "\b";
      case "t":
        return "	";
      case "n":
        return "\n";
      case "f":
        return "\f";
      case "r":
        return "\r";
      case '"':
        return '"';
      case "'":
        return "'";
      case "\\":
        return "\\";
      case "s":
        return " ";
      case "\n":
        if (!inTextBlock) throw new Error(`Invalid escape sequence at line ${startLine}:${startCol}`);
        return "";
      default:
        if (/[0-7]/.test(esc)) {
          let oct = esc;
          const maxExtra = esc <= "3" ? 2 : 1;
          for (let i = 0; i < maxExtra; i++) {
            if (!/[0-7]/.test(peek())) break;
            oct += advance();
          }
          return String.fromCharCode(parseInt(oct, 8));
        }
        throw new Error(`Invalid escape sequence at line ${startLine}:${startCol}`);
    }
  }
  function parseNumberLiteral(startLine, startCol) {
    const rem = source.slice(pos);
    let best;
    for (const p of NUMBER_PATTERNS) {
      const m = rem.match(p.re);
      if (!m) continue;
      const text = m[0];
      if (!best || text.length > best.text.length) best = { text, kind: p.kind };
    }
    if (!best) return void 0;
    const matched = best.text;
    const last = matched[matched.length - 1];
    if (/^0[bB]/.test(rem) && !/^0[bB]/.test(matched)) {
      throw new Error(`Malformed binary literal at line ${startLine}:${startCol}`);
    }
    if (/^0[xX]/.test(rem) && !/^0[xX]/.test(matched)) {
      throw new Error(`Malformed hexadecimal literal at line ${startLine}:${startCol}`);
    }
    if (last === "_") {
      throw new Error(`Invalid underscore placement in number literal at line ${startLine}:${startCol}`);
    }
    const next = rem[matched.length] ?? "\0";
    if (/^0[bB]/.test(matched) && isIdentifierPart(next)) {
      throw new Error(`Malformed binary literal at line ${startLine}:${startCol}`);
    }
    if (/^0[xX]/.test(matched) && isIdentifierPart(next)) {
      throw new Error(`Malformed hexadecimal literal at line ${startLine}:${startCol}`);
    }
    if (isIdentifierPart(next)) {
      throw new Error(`Malformed number literal at line ${startLine}:${startCol}`);
    }
    if (/^0[xX]/.test(matched) && next === ".") {
      const afterDot = rem[matched.length + 1] ?? "\0";
      if (afterDot === "_" || afterDot === "\0" || /\s/.test(afterDot) || /[0-9]/.test(afterDot)) {
        throw new Error(`Malformed hexadecimal floating-point literal at line ${startLine}:${startCol}`);
      }
    }
    if (rem.startsWith("0") && matched === "0" && /[0-9_]/.test(next)) {
      throw new Error(`Malformed octal literal at line ${startLine}:${startCol}`);
    }
    if (/[fF]/.test(last)) best.kind = "FloatLiteral" /* FloatLiteral */;
    else if (/[dD]/.test(last)) best.kind = "DoubleLiteral" /* DoubleLiteral */;
    else if (/[lL]/.test(last)) best.kind = "LongLiteral" /* LongLiteral */;
    else if (best.kind === "IntLiteral" /* IntLiteral */) best.kind = "IntLiteral" /* IntLiteral */;
    else best.kind = "DoubleLiteral" /* DoubleLiteral */;
    return { kind: best.kind, value: matched, len: matched.length };
  }
  while (pos < source.length) {
    const ch = peek();
    if (/\s/.test(ch)) {
      advance();
      continue;
    }
    if (ch === "/" && pos + 1 < source.length && source[pos + 1] === "/") {
      while (pos < source.length && peek() !== "\n") advance();
      continue;
    }
    if (ch === "/" && pos + 1 < source.length && source[pos + 1] === "*") {
      const cLine = line;
      const cCol = col;
      advance();
      advance();
      while (pos + 1 < source.length && !(peek() === "*" && source[pos + 1] === "/")) advance();
      if (pos + 1 >= source.length) {
        throw new Error(`Unterminated block comment at line ${cLine}:${cCol}`);
      }
      advance();
      advance();
      continue;
    }
    const startLine = line;
    const startCol = col;
    if (ch === '"' && peekN(1) === '"' && peekN(2) === '"') {
      advance();
      advance();
      advance();
      while (peek() === " " || peek() === "	" || peek() === "\f") advance();
      if (peek() !== "\n") {
        throw new Error(`Text block opening delimiter must be followed by line terminator at line ${startLine}:${startCol}`);
      }
      advance();
      let s = "";
      let closed = false;
      while (pos < source.length) {
        if (peek() === '"' && peekN(1) === '"' && peekN(2) === '"') {
          advance();
          advance();
          advance();
          tokens.push({ kind: "StringLiteral" /* StringLiteral */, value: s, line: startLine, col: startCol });
          closed = true;
          break;
        }
        if (peek() === "\\") {
          const escLine = line;
          const escCol = col;
          advance();
          s += parseEscape(escLine, escCol, true);
        } else {
          s += advance();
        }
      }
      if (!closed) {
        throw new Error(`Unterminated text block at line ${startLine}:${startCol}`);
      }
      continue;
    }
    if (ch === '"') {
      advance();
      let s = "";
      while (peek() !== '"' && peek() !== "\0") {
        if (peek() === "\n") {
          throw new Error(`Unterminated string literal at line ${startLine}:${startCol}`);
        }
        if (peek() === "\\") {
          const escLine = line;
          const escCol = col;
          advance();
          s += parseEscape(escLine, escCol, false);
        } else {
          s += advance();
        }
      }
      if (peek() === "\0") {
        throw new Error(`Unterminated string literal at line ${startLine}:${startCol}`);
      }
      advance();
      tokens.push({ kind: "StringLiteral" /* StringLiteral */, value: s, line: startLine, col: startCol });
      continue;
    }
    if (ch === "'") {
      advance();
      if (peek() === "'" || peek() === "\n" || peek() === "\0") {
        throw new Error(`Malformed char literal at line ${startLine}:${startCol}`);
      }
      let chValue = "";
      if (peek() === "\\") {
        const escLine = line;
        const escCol = col;
        advance();
        chValue = parseEscape(escLine, escCol, false);
      } else {
        chValue = advance();
      }
      if (peek() !== "'") throw new Error(`Unterminated char literal at line ${startLine}:${startCol}`);
      advance();
      if (chValue.length !== 1) throw new Error(`Malformed char literal at line ${startLine}:${startCol}`);
      tokens.push({ kind: "CharLiteral" /* CharLiteral */, value: String(chValue.charCodeAt(0)), line: startLine, col: startCol });
      continue;
    }
    if (/[0-9]/.test(ch) || ch === "." && /[0-9]/.test(peekN(1))) {
      const parsed = parseNumberLiteral(startLine, startCol);
      if (!parsed) {
        const rem = source.slice(pos);
        if (/^0[xX]/.test(rem)) throw new Error(`Malformed hexadecimal literal at line ${startLine}:${startCol}`);
        if (/^0[bB]/.test(rem)) throw new Error(`Malformed binary literal at line ${startLine}:${startCol}`);
        throw new Error(`Malformed number literal at line ${startLine}:${startCol}`);
      }
      for (let i = 0; i < parsed.len; i++) advance();
      tokens.push({ kind: parsed.kind, value: parsed.value, line: startLine, col: startCol });
      continue;
    }
    if (source.startsWith("non-sealed", pos)) {
      const after = source[pos + "non-sealed".length] ?? "\0";
      if (!isIdentifierPart(after)) {
        for (let i = 0; i < "non-sealed".length; i++) advance();
        tokens.push({ kind: "non-sealed" /* KwNonSealed */, value: "non-sealed", line: startLine, col: startCol });
        continue;
      }
    }
    const firstCp = peekCodePoint();
    if (isIdentifierStart(firstCp)) {
      let ident = "";
      while (isIdentifierPart(peekCodePoint())) ident += advanceCodePoint();
      if (ident === "_") {
        throw new Error(`'_' is a reserved keyword and cannot be used as an identifier at line ${startLine}:${startCol}`);
      }
      const kw = Object.prototype.hasOwnProperty.call(KEYWORDS, ident) ? KEYWORDS[ident] : void 0;
      tokens.push({ kind: kw ?? "Ident" /* Ident */, value: ident, line: startLine, col: startCol });
      continue;
    }
    const two = pos + 1 < source.length ? ch + source[pos + 1] : "";
    const three = pos + 2 < source.length ? ch + source[pos + 1] + source[pos + 2] : "";
    const four = pos + 3 < source.length ? ch + source[pos + 1] + source[pos + 2] + source[pos + 3] : "";
    if (four === ">>>=") {
      advance();
      advance();
      advance();
      advance();
      tokens.push({ kind: ">>>=" /* ShiftUnsignedAssign */, value: ">>>=", line: startLine, col: startCol });
      continue;
    }
    if (three === "<<=") {
      advance();
      advance();
      advance();
      tokens.push({ kind: "<<=" /* ShiftLeftAssign */, value: "<<=", line: startLine, col: startCol });
      continue;
    }
    if (three === ">>>") {
      advance();
      advance();
      advance();
      tokens.push({ kind: ">>>" /* ShiftUnsigned */, value: ">>>", line: startLine, col: startCol });
      continue;
    }
    if (three === "...") {
      advance();
      advance();
      advance();
      tokens.push({ kind: "..." /* Ellipsis */, value: "...", line: startLine, col: startCol });
      continue;
    }
    if (three === ">>=") {
      advance();
      advance();
      advance();
      tokens.push({ kind: ">>=" /* ShiftRightAssign */, value: ">>=", line: startLine, col: startCol });
      continue;
    }
    if (two === "==") {
      advance();
      advance();
      tokens.push({ kind: "==" /* Eq */, value: "==", line: startLine, col: startCol });
      continue;
    }
    if (two === "!=") {
      advance();
      advance();
      tokens.push({ kind: "!=" /* Ne */, value: "!=", line: startLine, col: startCol });
      continue;
    }
    if (two === "<=") {
      advance();
      advance();
      tokens.push({ kind: "<=" /* Le */, value: "<=", line: startLine, col: startCol });
      continue;
    }
    if (two === ">=") {
      advance();
      advance();
      tokens.push({ kind: ">=" /* Ge */, value: ">=", line: startLine, col: startCol });
      continue;
    }
    if (two === "&&") {
      advance();
      advance();
      tokens.push({ kind: "&&" /* And */, value: "&&", line: startLine, col: startCol });
      continue;
    }
    if (two === "||") {
      advance();
      advance();
      tokens.push({ kind: "||" /* Or */, value: "||", line: startLine, col: startCol });
      continue;
    }
    if (two === "<<") {
      advance();
      advance();
      tokens.push({ kind: "<<" /* ShiftLeft */, value: "<<", line: startLine, col: startCol });
      continue;
    }
    if (two === ">>") {
      advance();
      advance();
      tokens.push({ kind: ">>" /* ShiftRight */, value: ">>", line: startLine, col: startCol });
      continue;
    }
    if (two === "+=") {
      advance();
      advance();
      tokens.push({ kind: "+=" /* PlusAssign */, value: "+=", line: startLine, col: startCol });
      continue;
    }
    if (two === "-=") {
      advance();
      advance();
      tokens.push({ kind: "-=" /* MinusAssign */, value: "-=", line: startLine, col: startCol });
      continue;
    }
    if (two === "*=") {
      advance();
      advance();
      tokens.push({ kind: "*=" /* StarAssign */, value: "*=", line: startLine, col: startCol });
      continue;
    }
    if (two === "/=") {
      advance();
      advance();
      tokens.push({ kind: "/=" /* SlashAssign */, value: "/=", line: startLine, col: startCol });
      continue;
    }
    if (two === "%=") {
      advance();
      advance();
      tokens.push({ kind: "%=" /* PercentAssign */, value: "%=", line: startLine, col: startCol });
      continue;
    }
    if (two === "&=") {
      advance();
      advance();
      tokens.push({ kind: "&=" /* AndAssign */, value: "&=", line: startLine, col: startCol });
      continue;
    }
    if (two === "|=") {
      advance();
      advance();
      tokens.push({ kind: "|=" /* OrAssign */, value: "|=", line: startLine, col: startCol });
      continue;
    }
    if (two === "^=") {
      advance();
      advance();
      tokens.push({ kind: "^=" /* XorAssign */, value: "^=", line: startLine, col: startCol });
      continue;
    }
    if (two === "::") {
      advance();
      advance();
      tokens.push({ kind: "::" /* ColonColon */, value: "::", line: startLine, col: startCol });
      continue;
    }
    if (two === "->") {
      advance();
      advance();
      tokens.push({ kind: "->" /* Arrow */, value: "->", line: startLine, col: startCol });
      continue;
    }
    if (two === "++") {
      advance();
      advance();
      tokens.push({ kind: "++" /* PlusPlus */, value: "++", line: startLine, col: startCol });
      continue;
    }
    if (two === "--") {
      advance();
      advance();
      tokens.push({ kind: "--" /* MinusMinus */, value: "--", line: startLine, col: startCol });
      continue;
    }
    const singles = {
      "(": "(" /* LParen */,
      ")": ")" /* RParen */,
      "{": "{" /* LBrace */,
      "}": "}" /* RBrace */,
      "[": "[" /* LBracket */,
      "]": "]" /* RBracket */,
      ";": ";" /* Semi */,
      ",": "," /* Comma */,
      ".": "." /* Dot */,
      "@": "@" /* At */,
      "+": "+" /* Plus */,
      "-": "-" /* Minus */,
      "*": "*" /* Star */,
      "/": "/" /* Slash */,
      "%": "%" /* Percent */,
      "=": "=" /* Assign */,
      "<": "<" /* Lt */,
      ">": ">" /* Gt */,
      "&": "&" /* BitAnd */,
      "|": "|" /* BitOr */,
      "^": "^" /* BitXor */,
      "~": "~" /* BitNot */,
      "!": "!" /* Not */,
      "?": "?" /* Question */,
      ":": ":" /* Colon */
    };
    if (singles[ch]) {
      advance();
      tokens.push({ kind: singles[ch], value: ch, line: startLine, col: startCol });
      continue;
    }
    throw new Error(`Unknown character "${ch}" at line ${startLine}:${startCol}`);
  }
  tokens.push({ kind: "EOF" /* EOF */, value: "", line, col });
  return tokens;
}

// web/javac/parser.ts
var JAVA_LANG_SIMPLE_NAMES = /* @__PURE__ */ new Set([
  "Object",
  "Class",
  "System",
  "Throwable",
  "Exception",
  "RuntimeException",
  "Integer",
  "Long",
  "Short",
  "Byte",
  "Character",
  "Boolean",
  "Float",
  "Double",
  "StringBuilder",
  "Math",
  "IO"
]);
function parseAll(tokens, implicitClassName) {
  let pos = 0;
  function peek() {
    return tokens[pos] ?? tokens[tokens.length - 1];
  }
  function advance() {
    return tokens[pos++];
  }
  function expect(kind) {
    const t = peek();
    if (t.kind !== kind) throw new Error(`Expected ${kind} but got ${t.kind} ("${t.value}") at line ${t.line}:${t.col}`);
    return advance();
  }
  function match(kind) {
    if (peek().kind === kind) {
      advance();
      return true;
    }
    return false;
  }
  function at(kind) {
    return peek().kind === kind;
  }
  function parseIntLiteral(raw) {
    let s = raw.replace(/_/g, "");
    if (s.endsWith("L") || s.endsWith("l")) s = s.slice(0, -1);
    if (/^0[xX][0-9a-fA-F]+$/.test(s)) return Number.parseInt(s.slice(2), 16);
    if (/^0[bB][01]+$/.test(s)) return Number.parseInt(s.slice(2), 2);
    if (/^0[0-7]+$/.test(s) && s.length > 1) return Number.parseInt(s.slice(1), 8);
    if (/^[0-9]+$/.test(s)) return Number.parseInt(s, 10);
    throw new Error(`Invalid integer literal: ${raw}`);
  }
  function isNameSegmentToken(kind) {
    return kind === "Ident" /* Ident */ || kind === "String" /* KwString */;
  }
  function parseNameSegment() {
    if (!isNameSegmentToken(peek().kind)) {
      const t = peek();
      throw new Error(`Expected Ident but got ${t.kind} ("${t.value}") at line ${t.line}:${t.col}`);
    }
    return advance().value;
  }
  function isIdentLikeToken(kind) {
    return kind === "Ident" /* Ident */ || kind === "yield" /* KwYield */;
  }
  function parseIdentLike() {
    const t = peek();
    if (!isIdentLikeToken(t.kind)) {
      throw new Error(`Expected Ident but got ${t.kind} ("${t.value}") at line ${t.line}:${t.col}`);
    }
    return advance().value;
  }
  function parseQualifiedName() {
    let name = parseNameSegment();
    while (at("." /* Dot */) && isNameSegmentToken(tokens[pos + 1]?.kind ?? "EOF" /* EOF */)) {
      advance();
      name += "." + parseNameSegment();
    }
    return name;
  }
  function consumeGenericAngleToken(depth) {
    let delta;
    if (at("<" /* Lt */)) delta = 1;
    else if (at(">" /* Gt */)) delta = -1;
    else if (at(">>" /* ShiftRight */)) delta = -2;
    else if (at(">>>" /* ShiftUnsigned */)) delta = -3;
    else return void 0;
    const t = advance();
    const nextDepth = depth + delta;
    if (nextDepth < 0) {
      throw new Error(`Unmatched '>' in generic type at line ${t.line}:${t.col}`);
    }
    return nextDepth;
  }
  function resolveDeclaredClassName(name) {
    if (name.includes("/")) return name;
    if (name.includes(".")) return name.replace(/\./g, "/");
    const explicit = importMap.get(name);
    if (explicit) return explicit;
    if (packageImports.includes("java/lang") && JAVA_LANG_SIMPLE_NAMES.has(name)) {
      return `java/lang/${name}`;
    }
    return name;
  }
  const importMap = /* @__PURE__ */ new Map();
  const packageImports = ["java/lang"];
  const staticWildcardImports = [];
  while (at("import" /* KwImport */) || at("package" /* KwPackage */)) {
    const isImport = at("import" /* KwImport */);
    advance();
    if (isImport) {
      const isStaticImport = match("static" /* KwStatic */);
      const base = parseQualifiedName();
      if (match("." /* Dot */)) {
        if (match("*" /* Star */)) {
          if (isStaticImport) {
            staticWildcardImports.push(base.replace(/\./g, "/"));
          } else {
            const internalBase = base.replace(/\./g, "/");
            packageImports.push(internalBase);
            if (/^[A-Z]/.test(base.split(".").pop() ?? "")) {
              staticWildcardImports.push(internalBase);
            }
          }
        } else {
          const member = expect("Ident" /* Ident */).value;
          if (!isStaticImport) {
            const fqn = `${base}.${member}`;
            importMap.set(member, fqn.replace(/\./g, "/"));
          }
        }
      } else if (!isStaticImport) {
        const simpleName = base.split(".").pop();
        importMap.set(simpleName, base.replace(/\./g, "/"));
      } else {
        const lastDot = base.lastIndexOf(".");
        if (lastDot < 0) throw new Error(`Invalid static import near "${base}"`);
      }
    } else {
      while (!at(";" /* Semi */) && !at("EOF" /* EOF */)) advance();
    }
    expect(";" /* Semi */);
  }
  function isCompactSource() {
    let i = pos;
    while (i < tokens.length && (tokens[i].kind === "public" /* KwPublic */ || tokens[i].kind === "abstract" /* KwAbstract */ || tokens[i].kind === "final" /* KwFinal */ || tokens[i].kind === "sealed" /* KwSealed */ || tokens[i].kind === "non-sealed" /* KwNonSealed */)) i++;
    const k = tokens[i]?.kind;
    if (k === "class" /* KwClass */ || k === "interface" /* KwInterface */ || k === "@" /* At */ && tokens[i + 1]?.kind === "interface" /* KwInterface */) {
      return false;
    }
    if (k === "record" /* KwRecord */ || k === "enum" /* KwEnum */) {
      for (let j = i + 1; j < tokens.length - 1; j++) {
        if (tokens[j].kind === "void" /* KwVoid */ && tokens[j + 1]?.kind === "Ident" /* Ident */ && tokens[j + 1]?.value === "main") {
          return true;
        }
      }
      return false;
    }
    return true;
  }
  if (!at("EOF" /* EOF */) && isCompactSource()) {
    return parseCompactSource(implicitClassName ?? "Main");
  }
  const results = [];
  while (!at("EOF" /* EOF */)) {
    results.push(parseOneClass());
  }
  return results;
  function parseCompactSource(className) {
    const fields = [];
    const methods = [];
    const nestedClasses = [];
    const siblings = [];
    while (!at("EOF" /* EOF */)) {
      if (at("record" /* KwRecord */) || at("enum" /* KwEnum */)) {
        const sibling = parseOneClass();
        importMap.set(sibling.name, sibling.name);
        siblings.push(sibling);
        continue;
      }
      parseMember(fields, methods, nestedClasses, className, "class");
    }
    for (const m of methods) {
      m.isStatic = true;
    }
    for (const f of fields) {
      f.isStatic = true;
    }
    const implicit = {
      name: className,
      kind: "class",
      superClass: "java/lang/Object",
      interfaces: [],
      fields,
      methods,
      nestedClasses,
      importMap,
      packageImports,
      staticWildcardImports,
      isImplicit: true
    };
    return [...siblings, implicit];
  }
  function parseOneClass() {
    let isFinal = false;
    let isAbstract = false;
    let isSealed = false;
    let isNonSealed = false;
    while (true) {
      if (at("public" /* KwPublic */)) {
        advance();
        continue;
      }
      if (at("abstract" /* KwAbstract */)) {
        advance();
        isAbstract = true;
        continue;
      }
      if (at("final" /* KwFinal */)) {
        advance();
        isFinal = true;
        continue;
      }
      if (at("sealed" /* KwSealed */)) {
        advance();
        isSealed = true;
        continue;
      }
      if (at("non-sealed" /* KwNonSealed */)) {
        advance();
        isNonSealed = true;
        continue;
      }
      break;
    }
    if (isAbstract && isFinal) throw new Error("'abstract' and 'final' cannot be combined");
    if (isSealed && isFinal) throw new Error("'sealed' and 'final' cannot be combined");
    if (isSealed && isNonSealed) throw new Error("'sealed' and 'non-sealed' cannot be combined");
    if (at("@" /* At */) && tokens[pos + 1]?.kind === "interface" /* KwInterface */) {
      return parseAnnotationDecl();
    }
    if (at("interface" /* KwInterface */)) {
      if (isFinal) throw new Error("'final' is not allowed on interface declarations");
      return parseInterfaceDecl(isAbstract, isSealed, isNonSealed);
    }
    if (at("enum" /* KwEnum */)) {
      return parseEnumDecl();
    }
    if (at("record" /* KwRecord */)) {
      if (isAbstract) throw new Error("'abstract' is not allowed on record declarations");
      if (isSealed) throw new Error("'sealed' is not allowed on record declarations");
      if (isNonSealed) throw new Error("'non-sealed' is not allowed on record declarations");
      advance();
      const recordName = expect("Ident" /* Ident */).value;
      skipTypeParametersIfPresent();
      expect("(" /* LParen */);
      const components = [];
      if (!at(")" /* RParen */)) {
        do {
          const cType = parseType();
          const cName = expect("Ident" /* Ident */).value;
          components.push({ name: cName, type: cType });
        } while (match("," /* Comma */));
      }
      expect(")" /* RParen */);
      const interfaces2 = [];
      if (match("implements" /* KwImplements */)) {
        interfaces2.push(...parseTypeNameList());
      }
      expect("{" /* LBrace */);
      const recordFields = [];
      const recordMethods = [];
      const recordNestedClasses = [];
      while (!at("}" /* RBrace */) && !at("EOF" /* EOF */)) {
        parseMember(recordFields, recordMethods, recordNestedClasses, recordName, "record");
      }
      expect("}" /* RBrace */);
      const compactInits = recordMethods.filter((m) => m.isCompactConstructor);
      if (compactInits.length > 1) {
        throw new Error("A record can have at most one compact canonical constructor");
      }
      for (const m of compactInits) {
        m.params = [...components];
      }
      if (compactInits.length > 0) {
        const typeKey = (t) => typeof t === "string" ? t : t.className;
        const canonicalSig = components.map((c) => typeKey(c.type)).join(",");
        const hasExplicitCanonical = recordMethods.some(
          (m) => !m.isCompactConstructor && m.name === "<init>" && m.params.length === components.length && m.params.map((p) => typeKey(p.type)).join(",") === canonicalSig
        );
        if (hasExplicitCanonical) {
          throw new Error("A record cannot have both a compact canonical constructor and an explicit canonical constructor");
        }
      }
      for (const c of components) {
        recordFields.push({ name: c.name, type: c.type, isStatic: false, isPrivate: true, isFinal: true });
      }
      const hasInit = recordMethods.some((m) => m.name === "<init>");
      if (!hasInit) {
        const initBody = components.map((c) => ({
          kind: "assign",
          target: { kind: "fieldAccess", object: { kind: "this" }, field: c.name },
          value: { kind: "ident", name: c.name }
        }));
        recordMethods.push({
          name: "<init>",
          returnType: "void",
          params: components,
          body: initBody,
          isStatic: false
        });
      }
      for (const c of components) {
        const alreadyDeclared = recordMethods.some((m) => m.name === c.name && m.params.length === 0);
        if (!alreadyDeclared) {
          recordMethods.push({
            name: c.name,
            returnType: c.type,
            params: [],
            body: [{ kind: "return", value: { kind: "fieldAccess", object: { kind: "this" }, field: c.name } }],
            isStatic: false
          });
        }
      }
      if (!recordMethods.some((m) => m.name === "equals" && m.params.length === 1)) {
        recordMethods.push({
          name: "equals",
          returnType: "boolean",
          params: [{ name: "other", type: { className: "java/lang/Object" } }],
          body: [{
            kind: "return",
            value: {
              kind: "binary",
              op: "==",
              left: { kind: "this" },
              right: { kind: "ident", name: "other" }
            }
          }],
          isStatic: false
        });
      }
      if (!recordMethods.some((m) => m.name === "hashCode" && m.params.length === 0)) {
        recordMethods.push({
          name: "hashCode",
          returnType: "int",
          params: [],
          body: [{ kind: "return", value: { kind: "intLit", value: 0 } }],
          isStatic: false
        });
      }
      if (!recordMethods.some((m) => m.name === "toString" && m.params.length === 0)) {
        let toStringExpr = { kind: "stringLit", value: `${recordName}[` };
        for (let ci = 0; ci < components.length; ci++) {
          const c = components[ci];
          const prefix = ci === 0 ? `${c.name}=` : `, ${c.name}=`;
          toStringExpr = {
            kind: "binary",
            op: "+",
            left: toStringExpr,
            right: { kind: "stringLit", value: prefix }
          };
          toStringExpr = {
            kind: "binary",
            op: "+",
            left: toStringExpr,
            right: { kind: "fieldAccess", object: { kind: "this" }, field: c.name }
          };
        }
        toStringExpr = {
          kind: "binary",
          op: "+",
          left: toStringExpr,
          right: { kind: "stringLit", value: "]" }
        };
        recordMethods.push({
          name: "toString",
          returnType: "String",
          params: [],
          body: [{ kind: "return", value: toStringExpr }],
          isStatic: false
        });
      }
      return {
        name: recordName,
        kind: "class",
        superClass: "java/lang/Record",
        interfaces: interfaces2,
        isRecord: true,
        recordComponents: components,
        fields: recordFields,
        methods: recordMethods,
        nestedClasses: recordNestedClasses,
        importMap,
        packageImports,
        staticWildcardImports
      };
    }
    expect("class" /* KwClass */);
    const className = expect("Ident" /* Ident */).value;
    skipTypeParametersIfPresent();
    let superClass = "java/lang/Object";
    if (match("extends" /* KwExtends */)) {
      superClass = parseResolvedTypeName();
    }
    const interfaces = [];
    if (match("implements" /* KwImplements */)) {
      interfaces.push(...parseTypeNameList());
    }
    let permittedSubclasses;
    if (match("permits" /* KwPermits */)) {
      if (!isSealed) throw new Error("'permits' clause requires 'sealed' modifier");
      permittedSubclasses = parseTypeNameList();
    }
    if (isSealed && !permittedSubclasses) {
      throw new Error("sealed class must have a 'permits' clause");
    }
    expect("{" /* LBrace */);
    const fields = [];
    const methods = [];
    const nestedClasses = [];
    while (!at("}" /* RBrace */) && !at("EOF" /* EOF */)) {
      parseMember(fields, methods, nestedClasses, className, "class");
    }
    expect("}" /* RBrace */);
    return {
      name: className,
      kind: "class",
      superClass,
      interfaces,
      isRecord: false,
      recordComponents: [],
      isFinal: isFinal || void 0,
      isAbstract: isAbstract || void 0,
      isSealed: isSealed || void 0,
      isNonSealed: isNonSealed || void 0,
      permittedSubclasses,
      fields,
      methods,
      nestedClasses,
      importMap,
      packageImports,
      staticWildcardImports
    };
  }
  function parseInterfaceDecl(isAbstract = false, isSealed = false, isNonSealed = false) {
    expect("interface" /* KwInterface */);
    const name = expect("Ident" /* Ident */).value;
    skipTypeParametersIfPresent();
    const interfaces = [];
    if (match("extends" /* KwExtends */)) {
      interfaces.push(...parseTypeNameList());
    }
    let permittedSubclasses;
    if (match("permits" /* KwPermits */)) {
      if (!isSealed) throw new Error("'permits' clause requires 'sealed' modifier");
      permittedSubclasses = parseTypeNameList();
    }
    if (isSealed && !permittedSubclasses) {
      throw new Error("sealed interface must have a 'permits' clause");
    }
    expect("{" /* LBrace */);
    const fields = [];
    const methods = [];
    const nestedClasses = [];
    while (!at("}" /* RBrace */) && !at("EOF" /* EOF */)) {
      parseMember(fields, methods, nestedClasses, name, "interface");
    }
    expect("}" /* RBrace */);
    return {
      name,
      kind: "interface",
      superClass: "java/lang/Object",
      interfaces,
      isSealed: isSealed || void 0,
      isNonSealed: isNonSealed || void 0,
      permittedSubclasses,
      fields,
      methods,
      nestedClasses,
      importMap,
      packageImports,
      staticWildcardImports
    };
  }
  function parseAnnotationDecl() {
    expect("@" /* At */);
    expect("interface" /* KwInterface */);
    const name = expect("Ident" /* Ident */).value;
    expect("{" /* LBrace */);
    const fields = [];
    const methods = [];
    const nestedClasses = [];
    while (!at("}" /* RBrace */) && !at("EOF" /* EOF */)) {
      parseMember(fields, methods, nestedClasses, name, "annotation");
    }
    expect("}" /* RBrace */);
    return {
      name,
      kind: "annotation",
      superClass: "java/lang/Object",
      interfaces: ["java/lang/annotation/Annotation"],
      fields,
      methods,
      nestedClasses,
      importMap,
      packageImports,
      staticWildcardImports
    };
  }
  function parseEnumDecl() {
    expect("enum" /* KwEnum */);
    const name = expect("Ident" /* Ident */).value;
    const interfaces = [];
    if (match("implements" /* KwImplements */)) {
      interfaces.push(...parseTypeNameList());
    }
    expect("{" /* LBrace */);
    const fields = [];
    const methods = [];
    const nestedClasses = [];
    while (!at("}" /* RBrace */) && !at(";" /* Semi */) && !at("EOF" /* EOF */)) {
      const constName = expect("Ident" /* Ident */).value;
      const args = [];
      if (match("(" /* LParen */)) {
        if (!at(")" /* RParen */)) {
          do {
            args.push(parseExpr());
          } while (match("," /* Comma */));
        }
        expect(")" /* RParen */);
      }
      if (match("{" /* LBrace */)) {
        let depth = 1;
        while (depth > 0 && !at("EOF" /* EOF */)) {
          if (match("{" /* LBrace */)) depth++;
          else if (match("}" /* RBrace */)) depth--;
          else advance();
        }
      }
      fields.push({
        name: constName,
        type: { className: name },
        isStatic: true,
        isFinal: true,
        isEnumConstant: true,
        initializer: { kind: "newExpr", className: name, args }
      });
      if (!match("," /* Comma */)) break;
      if (at(";" /* Semi */) || at("}" /* RBrace */) || at("EOF" /* EOF */)) break;
    }
    if (match(";" /* Semi */)) {
      while (!at("}" /* RBrace */) && !at("EOF" /* EOF */)) {
        parseMember(fields, methods, nestedClasses, name, "enum");
      }
    }
    expect("}" /* RBrace */);
    return {
      name,
      kind: "enum",
      superClass: "java/lang/Enum",
      interfaces,
      isRecord: false,
      recordComponents: [],
      fields,
      methods,
      nestedClasses,
      importMap,
      packageImports,
      staticWildcardImports
    };
  }
  function parseResolvedTypeName() {
    const name = parseQualifiedName();
    skipTypeArgumentsIfPresent();
    return resolveDeclaredClassName(name);
  }
  function parseTypeNameList() {
    const out = [parseResolvedTypeName()];
    while (match("," /* Comma */)) out.push(parseResolvedTypeName());
    return out;
  }
  function skipTypeParametersIfPresent() {
    if (!at("<" /* Lt */)) return;
    let depth = 1;
    advance();
    while (depth > 0 && !at("EOF" /* EOF */)) {
      const nextDepth = consumeGenericAngleToken(depth);
      if (nextDepth !== void 0) depth = nextDepth;
      else advance();
    }
  }
  function skipTypeArgumentsIfPresent() {
    skipTypeParametersIfPresent();
  }
  function parseMember(fields, methods, nestedClasses, ownerName, ownerKind) {
    let isStatic = false;
    const inInterfaceLikeOwner = ownerKind === "interface" || ownerKind === "annotation";
    let isAbstract = inInterfaceLikeOwner;
    let explicitAbstract = false;
    let isPublic = false;
    let isPrivate = false;
    let isProtected = false;
    let isFinal = false;
    let isVolatile = false;
    let isTransient = false;
    let isSynchronized = false;
    let isSealed = false;
    let isNonSealed = false;
    while (true) {
      if (at("public" /* KwPublic */)) {
        advance();
        isPublic = true;
        continue;
      }
      if (at("protected" /* KwProtected */)) {
        advance();
        isProtected = true;
        continue;
      }
      if (at("private" /* KwPrivate */)) {
        advance();
        isPrivate = true;
        continue;
      }
      if (at("static" /* KwStatic */)) {
        advance();
        isStatic = true;
        continue;
      }
      if (at("abstract" /* KwAbstract */)) {
        advance();
        isAbstract = true;
        explicitAbstract = true;
        continue;
      }
      if (at("final" /* KwFinal */)) {
        advance();
        isFinal = true;
        continue;
      }
      if (at("volatile" /* KwVolatile */)) {
        advance();
        isVolatile = true;
        continue;
      }
      if (at("transient" /* KwTransient */)) {
        advance();
        isTransient = true;
        continue;
      }
      if (at("default" /* KwDefault */)) {
        advance();
        continue;
      }
      if (at("sealed" /* KwSealed */)) {
        advance();
        isSealed = true;
        continue;
      }
      if (at("non-sealed" /* KwNonSealed */)) {
        advance();
        isNonSealed = true;
        continue;
      }
      if (at("synchronized" /* KwSynchronized */)) {
        if (ownerKind === "interface" || ownerKind === "annotation") {
          throw new Error("'synchronized' is not allowed on interface or annotation members");
        }
        advance();
        isSynchronized = true;
        continue;
      }
      break;
    }
    if (explicitAbstract && isFinal) throw new Error("'abstract' and 'final' cannot be combined");
    if (isSealed && isFinal) throw new Error("'sealed' and 'final' cannot be combined");
    if (isSealed && isNonSealed) throw new Error("'sealed' and 'non-sealed' cannot be combined");
    const accessCount = (isPublic ? 1 : 0) + (isProtected ? 1 : 0) + (isPrivate ? 1 : 0);
    if (accessCount > 1) throw new Error("only one of 'public', 'protected', or 'private' is allowed");
    const isTypeDecl = at("class" /* KwClass */) || at("interface" /* KwInterface */);
    if ((isSealed || isNonSealed) && !isTypeDecl) {
      throw new Error("'sealed' and 'non-sealed' can only be applied to class or interface declarations");
    }
    if ((isVolatile || isTransient) && isTypeDecl) {
      throw new Error("'volatile' and 'transient' are not allowed on class or interface declarations");
    }
    if (inInterfaceLikeOwner && !isTypeDecl) {
      if (isProtected) throw new Error("'protected' is not allowed on interface members");
      if (isFinal) throw new Error("'final' is not allowed on interface members");
    }
    if (at("class" /* KwClass */) || at("interface" /* KwInterface */)) {
      const isNestedInterface = at("interface" /* KwInterface */);
      if (!isNestedInterface && !isStatic) {
      } else {
        advance();
        const nestedName = expect("Ident" /* Ident */).value;
        const nestedKind = isNestedInterface ? "interface" : "class";
        const mangledName = ownerName + "$" + nestedName;
        let nestedSuper = "java/lang/Object";
        const nestedInterfaces = [];
        if (match("extends" /* KwExtends */)) {
          if (nestedKind === "class") nestedSuper = parseResolvedTypeName();
          else nestedInterfaces.push(...parseTypeNameList());
        }
        if (nestedKind === "class" && match("implements" /* KwImplements */)) {
          nestedInterfaces.push(...parseTypeNameList());
        }
        let nestedPermitted;
        if (match("permits" /* KwPermits */)) {
          if (!isSealed) throw new Error("'permits' clause requires 'sealed' modifier");
          nestedPermitted = parseTypeNameList();
        }
        if (isSealed && !nestedPermitted) {
          throw new Error("sealed type must have a 'permits' clause");
        }
        expect("{" /* LBrace */);
        const nf = [];
        const nm = [];
        const nnc = [];
        while (!at("}" /* RBrace */) && !at("EOF" /* EOF */)) {
          parseMember(nf, nm, nnc, mangledName, nestedKind);
        }
        expect("}" /* RBrace */);
        importMap.set(nestedName, mangledName);
        nestedClasses.push({
          name: mangledName,
          kind: nestedKind,
          superClass: nestedSuper,
          interfaces: nestedInterfaces,
          isRecord: false,
          recordComponents: [],
          isFinal: isFinal || void 0,
          isAbstract: explicitAbstract || void 0,
          isSealed: isSealed || void 0,
          isNonSealed: isNonSealed || void 0,
          permittedSubclasses: nestedPermitted,
          fields: nf,
          methods: nm,
          nestedClasses: nnc,
          importMap,
          packageImports,
          staticWildcardImports
        });
        return;
      }
    }
    const simpleOwnerName = ownerName.includes("$") ? ownerName.slice(ownerName.lastIndexOf("$") + 1) : ownerName;
    skipTypeParametersIfPresent();
    if (ownerKind === "record" && at("Ident" /* Ident */) && (tokens[pos + 1]?.kind === "{" /* LBrace */ || tokens[pos + 1]?.kind === "throws" /* KwThrows */) && (peek().value === ownerName || peek().value === simpleOwnerName)) {
      if (isSynchronized) throw new Error("'synchronized' is not allowed on constructors");
      if (isFinal) throw new Error("'final' is not allowed on constructors");
      if (explicitAbstract) throw new Error("'abstract' is not allowed on constructors");
      advance();
      const throwsTypes = parseOptionalThrowsClause();
      expect("{" /* LBrace */);
      const body = parseBlock();
      expect("}" /* RBrace */);
      const hasForbiddenStmt = (stmts) => stmts.some((s) => {
        if (s.kind === "return") return true;
        if (s.kind === "exprStmt" && s.expr.kind === "superCall") return true;
        if (s.kind === "block") return hasForbiddenStmt(s.stmts);
        if (s.kind === "if") return hasForbiddenStmt(s.then) || hasForbiddenStmt(s.else_ ?? []);
        if (s.kind === "while" || s.kind === "doWhile" || s.kind === "synchronized") return hasForbiddenStmt(s.body);
        if (s.kind === "for") return hasForbiddenStmt(s.body);
        if (s.kind === "forEach") return hasForbiddenStmt(s.body);
        if (s.kind === "labeled") return hasForbiddenStmt([s.stmt]);
        if (s.kind === "tryCatch") return hasForbiddenStmt(s.tryBody) || s.catches.some((c) => hasForbiddenStmt(c.body)) || hasForbiddenStmt(s.finallyBody ?? []);
        if (s.kind === "switch") return s.cases.some((c) => hasForbiddenStmt(c.stmts ?? []));
        return false;
      });
      if (hasForbiddenStmt(body)) throw new Error("compact canonical constructor must not contain a return statement or explicit constructor invocation");
      methods.push({ name: "<init>", returnType: "void", params: [], body, isStatic: false, isCompactConstructor: true, isPrivate: isPrivate || void 0, isProtected: isProtected || void 0, throwsTypes: throwsTypes.length > 0 ? throwsTypes : void 0 });
      return;
    }
    if ((ownerKind === "class" || ownerKind === "record" || ownerKind === "enum") && at("Ident" /* Ident */) && tokens[pos + 1]?.kind === "(" /* LParen */ && (peek().value === ownerName || peek().value === simpleOwnerName)) {
      if (isSynchronized) throw new Error("'synchronized' is not allowed on constructors");
      if (isFinal) throw new Error("'final' is not allowed on constructors");
      if (explicitAbstract) throw new Error("'abstract' is not allowed on constructors");
      advance();
      expect("(" /* LParen */);
      const params = [];
      if (!at(")" /* RParen */)) {
        do {
          const pType = parseType();
          const pName = expect("Ident" /* Ident */).value;
          params.push({ name: pName, type: pType });
        } while (match("," /* Comma */));
      }
      expect(")" /* RParen */);
      const throwsTypes = parseOptionalThrowsClause();
      if (match(";" /* Semi */)) throw new Error("constructor declaration cannot end with ';'");
      expect("{" /* LBrace */);
      const body = parseBlock();
      expect("}" /* RBrace */);
      methods.push({ name: "<init>", returnType: "void", params, body, isStatic: false, isPrivate: isPrivate || void 0, isProtected: isProtected || void 0, throwsTypes });
      return;
    }
    const retType = parseType();
    const name = expect("Ident" /* Ident */).value;
    if (at("(" /* LParen */)) {
      if (isVolatile) throw new Error("'volatile' is not allowed on methods");
      if (isTransient) throw new Error("'transient' is not allowed on methods");
      expect("(" /* LParen */);
      const params = [];
      if (!at(")" /* RParen */)) {
        do {
          const pType = parseType();
          const pName = expect("Ident" /* Ident */).value;
          params.push({ name: pName, type: pType });
        } while (match("," /* Comma */));
      }
      expect(")" /* RParen */);
      const throwsTypes = parseOptionalThrowsClause();
      if (ownerKind === "annotation" && at("default" /* KwDefault */)) {
        advance();
        parseExpr();
        expect(";" /* Semi */);
        methods.push({ name, returnType: retType, params, body: [], isStatic, isPrivate: isPrivate || void 0, isProtected: isProtected || void 0, isFinal: isFinal || void 0, isAbstract: true, isSynchronized, throwsTypes });
        return;
      }
      if (match(";" /* Semi */)) {
        if (!inInterfaceLikeOwner && !isAbstract) {
          throw new Error("Method declarations in classes, enums, and records must have a body unless declared abstract.");
        }
        if (inInterfaceLikeOwner && isPrivate) {
          throw new Error("private interface methods must have a body");
        }
        methods.push({ name, returnType: retType, params, body: [], isStatic, isPrivate: isPrivate || void 0, isProtected: isProtected || void 0, isFinal: isFinal || void 0, isAbstract: inInterfaceLikeOwner || isAbstract, isSynchronized, throwsTypes });
      } else {
        expect("{" /* LBrace */);
        const body = parseBlock();
        expect("}" /* RBrace */);
        methods.push({ name, returnType: retType, params, body, isStatic, isPrivate: isPrivate || void 0, isProtected: isProtected || void 0, isFinal: isFinal || void 0, isAbstract: false, isSynchronized, throwsTypes });
      }
    } else {
      let init;
      if (match("=" /* Assign */)) {
        init = parseExpr();
      }
      expect(";" /* Semi */);
      const inRecord = ownerKind === "record";
      fields.push({
        name,
        type: retType,
        isStatic: inInterfaceLikeOwner || isStatic,
        initializer: init,
        isPrivate: inInterfaceLikeOwner ? false : inRecord && !isStatic ? true : isPrivate,
        isProtected: isProtected || void 0,
        isFinal: inRecord && !isStatic ? true : inInterfaceLikeOwner ? true : isFinal || void 0,
        isVolatile: isVolatile || void 0,
        isTransient: isTransient || void 0
      });
    }
  }
  function parseOptionalThrowsClause() {
    if (!match("throws" /* KwThrows */)) return [];
    const out = [parseResolvedTypeName()];
    while (match("," /* Comma */)) {
      out.push(parseResolvedTypeName());
    }
    return out;
  }
  function parseType() {
    let base;
    if (match("int" /* KwInt */)) base = "int";
    else if (match("long" /* KwLong */)) base = "long";
    else if (match("short" /* KwShort */)) base = "short";
    else if (match("byte" /* KwByte */)) base = "byte";
    else if (match("char" /* KwChar */)) base = "char";
    else if (match("float" /* KwFloat */)) base = "float";
    else if (match("double" /* KwDouble */)) base = "double";
    else if (match("boolean" /* KwBoolean */)) base = "boolean";
    else if (match("void" /* KwVoid */)) base = "void";
    else if (match("String" /* KwString */)) base = "String";
    else if (match("var" /* KwVar */)) throw new Error(`'var' is only allowed for local variables with initializer`);
    else {
      const name = parseQualifiedName();
      if (at("<" /* Lt */)) {
        advance();
        let depth = 1;
        while (depth > 0 && !at("EOF" /* EOF */)) {
          const nextDepth = consumeGenericAngleToken(depth);
          if (nextDepth !== void 0) depth = nextDepth;
          else advance();
        }
      }
      const resolvedName = resolveDeclaredClassName(name);
      base = { className: resolvedName };
    }
    if (at("[" /* LBracket */) && tokens[pos + 1]?.kind === "]" /* RBracket */) {
      advance();
      advance();
      return { array: base };
    }
    return base;
  }
  function parseBlock() {
    const stmts = [];
    while (!at("}" /* RBrace */) && !at("EOF" /* EOF */)) {
      const s = parseStmt();
      if (s.kind === "block" && s.stmts.every((ss) => ss.kind === "varDecl")) {
        stmts.push(...s.stmts);
      } else {
        stmts.push(s);
      }
    }
    return stmts;
  }
  function parseSwitchLabel() {
    function parsePatternBindVar() {
      if (match("var" /* KwVar */)) return expect("Ident" /* Ident */).value;
      if ((at("int" /* KwInt */) || at("long" /* KwLong */) || at("boolean" /* KwBoolean */) || at("String" /* KwString */) || at("Ident" /* Ident */)) && tokens[pos + 1]?.kind === "Ident" /* Ident */) {
        advance();
      }
      return expect("Ident" /* Ident */).value;
    }
    function parseRecordPatternBindVars() {
      const bindVars = [];
      expect("(" /* LParen */);
      if (!at(")" /* RParen */)) {
        do {
          bindVars.push(parsePatternBindVar());
        } while (match("," /* Comma */));
      }
      expect(")" /* RParen */);
      return bindVars;
    }
    if (match("(" /* LParen */)) {
      const nested = parseSwitchLabel();
      if (nested.kind !== "typePattern") {
        if (nested.kind !== "recordPattern") {
          throw new Error("parenthesized switch label currently supports only type/record patterns");
        }
      }
      expect(")" /* RParen */);
      return nested;
    }
    if (at("NullLiteral" /* NullLiteral */)) {
      advance();
      return { kind: "null" };
    }
    if (at("BoolLiteral" /* BoolLiteral */)) {
      return { kind: "bool", value: advance().value === "true" };
    }
    if (at("IntLiteral" /* IntLiteral */)) {
      return { kind: "int", value: parseIntLiteral(advance().value) };
    }
    if (at("StringLiteral" /* StringLiteral */)) {
      return { kind: "string", value: advance().value };
    }
    if (at("Ident" /* Ident */)) {
      const typeName = parseQualifiedName();
      if (at("(" /* LParen */)) {
        return { kind: "recordPattern", typeName, bindVars: parseRecordPatternBindVars() };
      }
      const bindVar = expect("Ident" /* Ident */).value;
      return { kind: "typePattern", typeName, bindVar };
    }
    if (at("String" /* KwString */)) {
      advance();
      const bindVar = expect("Ident" /* Ident */).value;
      return { kind: "typePattern", typeName: "java/lang/String", bindVar };
    }
    throw new Error(`Unsupported switch label at line ${peek().line}:${peek().col}`);
  }
  function parseSwitchCases(isExpr) {
    const cases = [];
    expect("{" /* LBrace */);
    while (!at("}" /* RBrace */) && !at("EOF" /* EOF */)) {
      const labels = [];
      if (match("default" /* KwDefault */)) {
        labels.push({ kind: "default" });
      } else {
        expect("case" /* KwCase */);
        labels.push(parseSwitchLabel());
        while (match("," /* Comma */)) labels.push(parseSwitchLabel());
      }
      let guard;
      if (match("when" /* KwWhen */)) {
        guard = parseExpr();
      }
      if (at(":" /* Colon */)) {
        advance();
        const stmts = [];
        while (!at("}" /* RBrace */) && !at("case" /* KwCase */) && !at("default" /* KwDefault */) && !at("EOF" /* EOF */)) {
          stmts.push(parseStmt());
        }
        cases.push({ labels, guard, stmts });
        continue;
      }
      expect("->" /* Arrow */);
      if (isExpr) {
        if (at("{" /* LBrace */)) {
          expect("{" /* LBrace */);
          const stmts = [];
          while (!at("}" /* RBrace */) && !at("EOF" /* EOF */)) stmts.push(parseStmt());
          expect("}" /* RBrace */);
          cases.push({ labels, guard, stmts });
        } else {
          const expr = parseExpr();
          expect(";" /* Semi */);
          cases.push({ labels, guard, expr });
        }
      } else {
        if (at("{" /* LBrace */)) {
          expect("{" /* LBrace */);
          const stmts = [];
          while (!at("}" /* RBrace */) && !at("EOF" /* EOF */)) stmts.push(parseStmt());
          expect("}" /* RBrace */);
          cases.push({ labels, guard, stmts });
        } else {
          const stmt = parseStmt();
          cases.push({ labels, guard, stmts: [stmt] });
        }
      }
    }
    expect("}" /* RBrace */);
    validateSwitchCases(cases, isExpr);
    return cases;
  }
  function validateSwitchCases(cases, isExpr) {
    let defaultCount = 0;
    let nullCount = 0;
    let seenDefaultNoGuard = false;
    const seenConstLabels = /* @__PURE__ */ new Set();
    const seenUnguardedTypePatterns = /* @__PURE__ */ new Set();
    for (const c of cases) {
      let caseHasDefaultNoGuard = false;
      for (const l of c.labels) {
        if (l.kind === "default") {
          defaultCount++;
          if (defaultCount > 1) throw new Error("switch cannot have more than one default label");
        }
        if (l.kind === "null") {
          nullCount++;
          if (nullCount > 1) throw new Error("switch cannot have more than one null label");
        }
        if (l.kind === "default" && !c.guard) caseHasDefaultNoGuard = true;
        if (l.kind === "int") {
          const key = `int:${l.value}`;
          if (seenConstLabels.has(key)) throw new Error(`duplicate switch label: ${l.value}`);
          seenConstLabels.add(key);
        }
        if (l.kind === "bool") {
          const key = `bool:${l.value ? 1 : 0}`;
          if (seenConstLabels.has(key)) throw new Error(`duplicate switch label: ${l.value}`);
          seenConstLabels.add(key);
        }
        if (l.kind === "string") {
          const key = `str:${l.value}`;
          if (seenConstLabels.has(key)) throw new Error(`duplicate switch label: "${l.value}"`);
          seenConstLabels.add(key);
        }
        if (l.kind === "null") {
          const key = "null";
          if (seenConstLabels.has(key)) throw new Error("duplicate switch label: null");
          seenConstLabels.add(key);
        }
        if ((l.kind === "typePattern" || l.kind === "recordPattern") && seenUnguardedTypePatterns.has(l.typeName) && !c.guard) {
          throw new Error(`dominated switch label pattern: ${l.typeName}`);
        }
      }
      if (c.guard) {
        if (c.labels.length !== 1 || c.labels[0].kind !== "typePattern" && c.labels[0].kind !== "recordPattern") {
          throw new Error("switch guard 'when' is only supported with a single type pattern label");
        }
      }
      const unguardedPattern = c.labels.find((l) => l.kind === "typePattern" || l.kind === "recordPattern");
      if (unguardedPattern && !c.guard) {
        seenUnguardedTypePatterns.add(unguardedPattern.typeName);
      }
      if (isExpr && !c.expr && !(c.stmts && c.stmts.some((s) => s.kind === "yield"))) {
        throw new Error("switch expression case must provide value expression or yield");
      }
      if (seenDefaultNoGuard && !caseHasDefaultNoGuard) {
        throw new Error("switch has unreachable case after unguarded default");
      }
      if (caseHasDefaultNoGuard) seenDefaultNoGuard = true;
    }
  }
  function parseAssignOrCompoundTail(target) {
    if (match("=" /* Assign */)) {
      const value = parseExpr();
      return { kind: "assign", target, value };
    }
    function makeCompound(op) {
      const value = parseExpr();
      return { kind: "compoundAssign", target, op, value };
    }
    if (match("+=" /* PlusAssign */)) return makeCompound("+");
    if (match("-=" /* MinusAssign */)) return makeCompound("-");
    if (match("*=" /* StarAssign */)) return makeCompound("*");
    if (match("/=" /* SlashAssign */)) return makeCompound("/");
    if (match("%=" /* PercentAssign */)) return makeCompound("%");
    if (match("&=" /* AndAssign */)) return makeCompound("&");
    if (match("|=" /* OrAssign */)) return makeCompound("|");
    if (match("^=" /* XorAssign */)) return makeCompound("^");
    if (match("<<=" /* ShiftLeftAssign */)) return makeCompound("<<");
    if (match(">>=" /* ShiftRightAssign */)) return makeCompound(">>");
    if (match(">>>=" /* ShiftUnsignedAssign */)) return makeCompound(">>>");
    if (at(">" /* Gt */) && tokens[pos + 1]?.kind === ">=" /* Ge */) {
      advance();
      advance();
      return makeCompound(">>");
    }
    if (at(">" /* Gt */) && tokens[pos + 1]?.kind === ">" /* Gt */ && tokens[pos + 2]?.kind === ">=" /* Ge */) {
      advance();
      advance();
      advance();
      return makeCompound(">>>");
    }
    return null;
  }
  function parseStmt() {
    if (at("{" /* LBrace */)) {
      expect("{" /* LBrace */);
      const stmts = parseBlock();
      expect("}" /* RBrace */);
      return { kind: "block", stmts };
    }
    if (at("return" /* KwReturn */)) {
      advance();
      if (at(";" /* Semi */)) {
        advance();
        return { kind: "return" };
      }
      const value = parseExpr();
      expect(";" /* Semi */);
      return { kind: "return", value };
    }
    if (at("yield" /* KwYield */)) {
      advance();
      const value = parseExpr();
      expect(";" /* Semi */);
      return { kind: "yield", value };
    }
    if (at("if" /* KwIf */)) {
      advance();
      expect("(" /* LParen */);
      const cond = parseExpr();
      expect(")" /* RParen */);
      let then;
      if (at("{" /* LBrace */)) {
        expect("{" /* LBrace */);
        then = parseBlock();
        expect("}" /* RBrace */);
      } else {
        then = [parseStmt()];
      }
      let else_;
      if (match("else" /* KwElse */)) {
        if (at("{" /* LBrace */)) {
          expect("{" /* LBrace */);
          else_ = parseBlock();
          expect("}" /* RBrace */);
        } else {
          else_ = [parseStmt()];
        }
      }
      return { kind: "if", cond, then, else_ };
    }
    if (at("while" /* KwWhile */)) {
      advance();
      expect("(" /* LParen */);
      const cond = parseExpr();
      expect(")" /* RParen */);
      let body;
      if (at("{" /* LBrace */)) {
        expect("{" /* LBrace */);
        body = parseBlock();
        expect("}" /* RBrace */);
      } else {
        body = [parseStmt()];
      }
      return { kind: "while", cond, body };
    }
    if (at("do" /* KwDo */)) {
      advance();
      let body;
      if (at("{" /* LBrace */)) {
        expect("{" /* LBrace */);
        body = parseBlock();
        expect("}" /* RBrace */);
      } else {
        body = [parseStmt()];
      }
      expect("while" /* KwWhile */);
      expect("(" /* LParen */);
      const cond = parseExpr();
      expect(")" /* RParen */);
      expect(";" /* Semi */);
      return { kind: "doWhile", cond, body };
    }
    if (at("for" /* KwFor */)) {
      advance();
      expect("(" /* LParen */);
      if (isEnhancedFor()) {
        const varType = parseType();
        const varName = expect("Ident" /* Ident */).value;
        expect(":" /* Colon */);
        const iterable = parseExpr();
        expect(")" /* RParen */);
        let body2;
        if (at("{" /* LBrace */)) {
          expect("{" /* LBrace */);
          body2 = parseBlock();
          expect("}" /* RBrace */);
        } else {
          body2 = [parseStmt()];
        }
        return { kind: "forEach", varName, varType, iterable, body: body2 };
      }
      let init;
      if (!at(";" /* Semi */)) init = parseStmtNoSemi();
      expect(";" /* Semi */);
      let cond;
      if (!at(";" /* Semi */)) cond = parseExpr();
      expect(";" /* Semi */);
      let update;
      if (!at(")" /* RParen */)) update = parseStmtNoSemi();
      expect(")" /* RParen */);
      let body;
      if (at("{" /* LBrace */)) {
        expect("{" /* LBrace */);
        body = parseBlock();
        expect("}" /* RBrace */);
      } else {
        body = [parseStmt()];
      }
      return { kind: "for", init, cond, update, body };
    }
    if (at("throw" /* KwThrow */)) {
      advance();
      const expr2 = parseExpr();
      expect(";" /* Semi */);
      return { kind: "throw", expr: expr2 };
    }
    if (at("assert" /* KwAssert */)) {
      advance();
      const cond = parseExpr();
      let message;
      if (match(":" /* Colon */)) {
        message = parseExpr();
      }
      expect(";" /* Semi */);
      return { kind: "assert", cond, message };
    }
    if (at("synchronized" /* KwSynchronized */)) {
      advance();
      expect("(" /* LParen */);
      const monitor = parseExpr();
      expect(")" /* RParen */);
      expect("{" /* LBrace */);
      const body = parseBlock();
      expect("}" /* RBrace */);
      return { kind: "synchronized", monitor, body };
    }
    if (at("try" /* KwTry */)) {
      advance();
      const resources = [];
      if (match("(" /* LParen */)) {
        if (at(")" /* RParen */)) {
          throw new Error("try-with-resources requires at least one resource");
        }
        while (!at(")" /* RParen */) && !at("EOF" /* EOF */)) {
          while (at("final" /* KwFinal */)) advance();
          let resType;
          let resName;
          let resInit;
          if (match("var" /* KwVar */)) {
            resName = expect("Ident" /* Ident */).value;
            expect("=" /* Assign */);
            resInit = parseExpr();
            resType = inferLocalVarType(resInit);
          } else {
            resType = parseType();
            resName = expect("Ident" /* Ident */).value;
            expect("=" /* Assign */);
            resInit = parseExpr();
          }
          resources.push({ name: resName, type: resType, init: resInit });
          if (match(";" /* Semi */)) {
            if (at(")" /* RParen */)) break;
          } else {
            break;
          }
        }
        expect(")" /* RParen */);
      }
      expect("{" /* LBrace */);
      const tryBody = parseBlock();
      expect("}" /* RBrace */);
      const catches = [];
      while (at("catch" /* KwCatch */)) {
        advance();
        expect("(" /* LParen */);
        const exType = expect("Ident" /* Ident */).value;
        const varName = expect("Ident" /* Ident */).value;
        expect(")" /* RParen */);
        expect("{" /* LBrace */);
        const body = parseBlock();
        expect("}" /* RBrace */);
        catches.push({ exType, varName, body });
      }
      let finallyBody;
      if (at("finally" /* KwFinally */)) {
        advance();
        expect("{" /* LBrace */);
        finallyBody = parseBlock();
        expect("}" /* RBrace */);
      }
      if (resources.length === 0) return { kind: "tryCatch", tryBody, catches, finallyBody };
      let loweredTryBody = tryBody;
      for (let i = resources.length - 1; i >= 0; i--) {
        const r = resources[i];
        const exName = `twr_ex_${i}`;
        const closeExName = `twr_close_ex_${i}`;
        const primaryName = `twr_primary_${i}`;
        const closeWithPrimary = {
          kind: "if",
          cond: { kind: "binary", op: "!=", left: { kind: "ident", name: r.name }, right: { kind: "nullLit" } },
          then: [
            {
              kind: "if",
              cond: { kind: "binary", op: "!=", left: { kind: "ident", name: primaryName }, right: { kind: "nullLit" } },
              then: [{
                kind: "tryCatch",
                tryBody: [{
                  kind: "exprStmt",
                  expr: { kind: "call", object: { kind: "ident", name: r.name }, method: "close", args: [] }
                }],
                catches: [{
                  exType: "Throwable",
                  varName: closeExName,
                  body: [{
                    kind: "exprStmt",
                    expr: {
                      kind: "call",
                      object: { kind: "ident", name: primaryName },
                      method: "addSuppressed",
                      args: [{ kind: "ident", name: closeExName }]
                    }
                  }]
                }]
              }],
              else_: [{
                kind: "exprStmt",
                expr: { kind: "call", object: { kind: "ident", name: r.name }, method: "close", args: [] }
              }]
            }
          ]
        };
        loweredTryBody = [{
          kind: "block",
          stmts: [
            { kind: "varDecl", name: r.name, type: r.type, init: { kind: "nullLit" } },
            { kind: "varDecl", name: primaryName, type: { className: "java/lang/Throwable" }, init: { kind: "nullLit" } },
            {
              kind: "tryCatch",
              tryBody: [
                { kind: "assign", target: { kind: "ident", name: r.name }, value: r.init },
                ...loweredTryBody
              ],
              catches: [{
                exType: "Throwable",
                varName: exName,
                body: [
                  { kind: "assign", target: { kind: "ident", name: primaryName }, value: { kind: "ident", name: exName } },
                  { kind: "throw", expr: { kind: "ident", name: exName } }
                ]
              }],
              finallyBody: [closeWithPrimary]
            }
          ]
        }];
      }
      return { kind: "tryCatch", tryBody: loweredTryBody, catches, finallyBody };
    }
    if (at("break" /* KwBreak */)) {
      advance();
      let label;
      if (at("Ident" /* Ident */)) label = advance().value;
      expect(";" /* Semi */);
      return { kind: "break", label };
    }
    if (at("continue" /* KwContinue */)) {
      advance();
      let label;
      if (at("Ident" /* Ident */)) label = advance().value;
      expect(";" /* Semi */);
      return { kind: "continue", label };
    }
    if (at("switch" /* KwSwitch */)) {
      advance();
      expect("(" /* LParen */);
      const selector = parseExpr();
      expect(")" /* RParen */);
      const cases = parseSwitchCases(false);
      return { kind: "switch", selector, cases };
    }
    if (at("var" /* KwVar */)) {
      advance();
      const name = expect("Ident" /* Ident */).value;
      expect("=" /* Assign */);
      const init = parseExpr();
      if (at("," /* Comma */)) {
        const stmts = [{ kind: "varDecl", name, type: inferLocalVarType(init), init }];
        while (match("," /* Comma */)) {
          const n2 = expect("Ident" /* Ident */).value;
          expect("=" /* Assign */);
          const i2 = parseExpr();
          stmts.push({ kind: "varDecl", name: n2, type: inferLocalVarType(i2), init: i2 });
        }
        expect(";" /* Semi */);
        return { kind: "block", stmts };
      }
      expect(";" /* Semi */);
      return { kind: "varDecl", name, type: inferLocalVarType(init), init };
    }
    if (isTypeStart() && isVarDecl()) {
      const type = parseType();
      const name = expect("Ident" /* Ident */).value;
      let init;
      if (match("=" /* Assign */)) init = parseExpr();
      if (at("," /* Comma */)) {
        const stmts = [{ kind: "varDecl", name, type, init }];
        while (match("," /* Comma */)) {
          const n2 = expect("Ident" /* Ident */).value;
          let i2;
          if (match("=" /* Assign */)) i2 = parseExpr();
          stmts.push({ kind: "varDecl", name: n2, type, init: i2 });
        }
        expect(";" /* Semi */);
        return { kind: "block", stmts };
      }
      expect(";" /* Semi */);
      return { kind: "varDecl", name, type, init };
    }
    if (at("Ident" /* Ident */) && tokens[pos + 1]?.kind === ":" /* Colon */ && tokens[pos + 2]?.kind !== ":" /* Colon */) {
      const label = advance().value;
      advance();
      const stmt = parseStmt();
      return { kind: "labeled", label, stmt };
    }
    const expr = parseExpr();
    const assignStmt = parseAssignOrCompoundTail(expr);
    if (assignStmt) {
      expect(";" /* Semi */);
      return assignStmt;
    }
    expect(";" /* Semi */);
    return { kind: "exprStmt", expr };
  }
  function parseStmtNoSemi() {
    if (at("var" /* KwVar */)) {
      advance();
      const name = expect("Ident" /* Ident */).value;
      expect("=" /* Assign */);
      const init = parseExpr();
      return { kind: "varDecl", name, type: inferLocalVarType(init), init };
    }
    if (isTypeStart() && isVarDecl()) {
      const type = parseType();
      const name = expect("Ident" /* Ident */).value;
      let init;
      if (match("=" /* Assign */)) init = parseExpr();
      return { kind: "varDecl", name, type, init };
    }
    const expr = parseExpr();
    const assignStmt = parseAssignOrCompoundTail(expr);
    if (assignStmt) return assignStmt;
    if (match("++" /* PlusPlus */)) {
      return { kind: "assign", target: expr, value: { kind: "binary", op: "+", left: expr, right: { kind: "intLit", value: 1 } } };
    }
    if (match("--" /* MinusMinus */)) {
      return { kind: "assign", target: expr, value: { kind: "binary", op: "-", left: expr, right: { kind: "intLit", value: 1 } } };
    }
    return { kind: "exprStmt", expr };
  }
  function isTypeStart() {
    const k = peek().kind;
    return k === "int" /* KwInt */ || k === "long" /* KwLong */ || k === "short" /* KwShort */ || k === "byte" /* KwByte */ || k === "char" /* KwChar */ || k === "float" /* KwFloat */ || k === "double" /* KwDouble */ || k === "boolean" /* KwBoolean */ || k === "void" /* KwVoid */ || k === "String" /* KwString */ || k === "Ident" /* Ident */;
  }
  function isVarDecl() {
    const saved = pos;
    try {
      if (at("int" /* KwInt */) || at("long" /* KwLong */) || at("short" /* KwShort */) || at("byte" /* KwByte */) || at("char" /* KwChar */) || at("float" /* KwFloat */) || at("double" /* KwDouble */) || at("boolean" /* KwBoolean */) || at("void" /* KwVoid */) || at("String" /* KwString */)) {
        advance();
        if (at("[" /* LBracket */) && tokens[pos + 1]?.kind === "]" /* RBracket */) {
          advance();
          advance();
        }
      } else if (at("Ident" /* Ident */) || at("String" /* KwString */)) {
        advance();
        while (at("." /* Dot */)) {
          advance();
          if (!(at("Ident" /* Ident */) || at("String" /* KwString */))) return false;
          advance();
        }
        if (at("<" /* Lt */)) {
          let depth = 1;
          advance();
          while (depth > 0 && !at("EOF" /* EOF */)) {
            const nextDepth = consumeGenericAngleToken(depth);
            if (nextDepth !== void 0) depth = nextDepth;
            else advance();
          }
        }
      } else {
        return false;
      }
      if (at("(" /* LParen */)) return false;
      if (at("[" /* LBracket */) && tokens[pos + 1]?.kind === "]" /* RBracket */) {
        advance();
        advance();
      }
      if (!at("Ident" /* Ident */)) return false;
      advance();
      if (at("(" /* LParen */)) return false;
      return true;
    } finally {
      pos = saved;
    }
  }
  function isEnhancedFor() {
    const saved = pos;
    try {
      if (at("var" /* KwVar */)) {
        advance();
      } else if (at("int" /* KwInt */) || at("long" /* KwLong */) || at("short" /* KwShort */) || at("byte" /* KwByte */) || at("char" /* KwChar */) || at("float" /* KwFloat */) || at("double" /* KwDouble */) || at("boolean" /* KwBoolean */) || at("String" /* KwString */)) {
        advance();
        if (at("[" /* LBracket */) && tokens[pos + 1]?.kind === "]" /* RBracket */) {
          advance();
          advance();
        }
      } else if (at("Ident" /* Ident */)) {
        advance();
        while (at("." /* Dot */)) {
          advance();
          if (!at("Ident" /* Ident */)) return false;
          advance();
        }
        if (at("<" /* Lt */)) {
          let depth = 1;
          advance();
          while (depth > 0 && !at("EOF" /* EOF */)) {
            const nextDepth = consumeGenericAngleToken(depth);
            if (nextDepth !== void 0) depth = nextDepth;
            else advance();
          }
        }
        if (at("[" /* LBracket */) && tokens[pos + 1]?.kind === "]" /* RBracket */) {
          advance();
          advance();
        }
      } else {
        return false;
      }
      if (!at("Ident" /* Ident */)) return false;
      advance();
      return at(":" /* Colon */);
    } finally {
      pos = saved;
    }
  }
  function parseExpr() {
    if (isLambdaStart()) {
      return parseLambdaExpr();
    }
    const expr = parseOr();
    if (at("?" /* Question */)) {
      advance();
      const thenExpr = parseExpr();
      expect(":" /* Colon */);
      const elseExpr = parseExpr();
      return { kind: "ternary", cond: expr, thenExpr, elseExpr };
    }
    return expr;
  }
  function isLambdaStart() {
    if (at("Ident" /* Ident */) && tokens[pos + 1]?.kind === "->" /* Arrow */) return true;
    if (!at("(" /* LParen */)) return false;
    let i = pos + 1;
    let expectIdent = true;
    while (i < tokens.length && tokens[i].kind !== ")" /* RParen */) {
      const k = tokens[i].kind;
      if (expectIdent) {
        if (k !== "Ident" /* Ident */) return false;
        expectIdent = false;
      } else {
        if (k !== "," /* Comma */) return false;
        expectIdent = true;
      }
      i++;
    }
    if (i >= tokens.length || tokens[i].kind !== ")" /* RParen */) return false;
    return tokens[i + 1]?.kind === "->" /* Arrow */;
  }
  function parseLambdaExpr() {
    const params = [];
    if (at("Ident" /* Ident */) && tokens[pos + 1]?.kind === "->" /* Arrow */) {
      params.push(advance().value);
      expect("->" /* Arrow */);
    } else {
      expect("(" /* LParen */);
      if (!at(")" /* RParen */)) {
        do {
          params.push(expect("Ident" /* Ident */).value);
        } while (match("," /* Comma */));
      }
      expect(")" /* RParen */);
      expect("->" /* Arrow */);
    }
    if (at("{" /* LBrace */)) {
      expect("{" /* LBrace */);
      const bodyStmts = parseBlock();
      expect("}" /* RBrace */);
      return { kind: "lambda", params, bodyStmts };
    }
    const bodyExpr = parseExpr();
    return { kind: "lambda", params, bodyExpr };
  }
  function inferLocalVarType(init) {
    switch (init.kind) {
      case "intLit":
        return "int";
      case "longLit":
        return "long";
      case "floatLit":
        return "float";
      case "doubleLit":
        return "double";
      case "charLit":
        return "char";
      case "boolLit":
        return "boolean";
      case "stringLit":
        return "String";
      case "newArray":
        return { array: init.elemType };
      case "arrayLit":
        return { array: init.elemType };
      case "newExpr":
        return { className: init.className };
      case "cast":
        return init.type;
      default:
        return { className: "java/lang/Object" };
    }
  }
  function parseOr() {
    let left = parseAnd();
    while (at("||" /* Or */)) {
      advance();
      const right = parseAnd();
      left = { kind: "binary", op: "||", left, right };
    }
    return left;
  }
  function parseAnd() {
    let left = parseBitwiseOr();
    while (at("&&" /* And */)) {
      advance();
      const right = parseBitwiseOr();
      left = { kind: "binary", op: "&&", left, right };
    }
    return left;
  }
  function parseBitwiseOr() {
    let left = parseBitwiseXor();
    while (at("|" /* BitOr */)) {
      advance();
      const right = parseBitwiseXor();
      left = { kind: "binary", op: "|", left, right };
    }
    return left;
  }
  function parseBitwiseXor() {
    let left = parseBitwiseAnd();
    while (at("^" /* BitXor */)) {
      advance();
      const right = parseBitwiseAnd();
      left = { kind: "binary", op: "^", left, right };
    }
    return left;
  }
  function parseBitwiseAnd() {
    let left = parseEquality();
    while (at("&" /* BitAnd */)) {
      advance();
      const right = parseEquality();
      left = { kind: "binary", op: "&", left, right };
    }
    return left;
  }
  function parseEquality() {
    let left = parseComparison();
    while (at("==" /* Eq */) || at("!=" /* Ne */) || at("instanceof" /* KwInstanceof */)) {
      if (at("instanceof" /* KwInstanceof */)) {
        let parsePatternBindVar = function() {
          if (match("var" /* KwVar */)) return expect("Ident" /* Ident */).value;
          if ((at("int" /* KwInt */) || at("long" /* KwLong */) || at("boolean" /* KwBoolean */) || at("String" /* KwString */) || at("Ident" /* Ident */)) && tokens[pos + 1]?.kind === "Ident" /* Ident */) {
            advance();
          }
          return expect("Ident" /* Ident */).value;
        }, parseInstanceofPattern = function() {
          if (match("(" /* LParen */)) {
            const inner = parseInstanceofPattern();
            expect(")" /* RParen */);
            return inner;
          }
          let typeName;
          if (at("String" /* KwString */)) {
            advance();
            typeName = "java/lang/String";
          } else {
            typeName = parseQualifiedName();
          }
          if (at("<" /* Lt */)) {
            let depth = 1;
            advance();
            while (depth > 0 && !at("EOF" /* EOF */)) {
              const nextDepth = consumeGenericAngleToken(depth);
              if (nextDepth !== void 0) depth = nextDepth;
              else advance();
            }
          }
          if (at("(" /* LParen */)) {
            const bindVars = [];
            advance();
            if (!at(")" /* RParen */)) {
              do {
                bindVars.push(parsePatternBindVar());
              } while (match("," /* Comma */));
            }
            expect(")" /* RParen */);
            return { typeName, recordBindVars: bindVars };
          }
          let bindVar;
          if (at("Ident" /* Ident */)) bindVar = advance().value;
          return { typeName, bindVar };
        };
        advance();
        const p = parseInstanceofPattern();
        left = { kind: "instanceof", expr: left, checkType: p.typeName, bindVar: p.bindVar, recordBindVars: p.recordBindVars };
      } else {
        const op = advance().value;
        const right = parseComparison();
        left = { kind: "binary", op, left, right };
      }
    }
    return left;
  }
  function parseComparison() {
    let left = parseShift();
    while (at("<" /* Lt */) || at(">" /* Gt */) || at("<=" /* Le */) || at(">=" /* Ge */)) {
      const op = advance().value;
      const right = parseShift();
      left = { kind: "binary", op, left, right };
    }
    return left;
  }
  function parseShift() {
    let left = parseAdditive();
    while (true) {
      if (match("<<" /* ShiftLeft */)) {
        const right = parseAdditive();
        left = { kind: "binary", op: "<<", left, right };
        continue;
      }
      if (match(">>" /* ShiftRight */)) {
        const right = parseAdditive();
        left = { kind: "binary", op: ">>", left, right };
        continue;
      }
      if (match(">>>" /* ShiftUnsigned */)) {
        const right = parseAdditive();
        left = { kind: "binary", op: ">>>", left, right };
        continue;
      }
      if (at(">" /* Gt */) && tokens[pos + 1]?.kind === ">" /* Gt */) {
        if (tokens[pos + 2]?.kind === ">=" /* Ge */) break;
        if (tokens[pos + 2]?.kind === ">" /* Gt */) {
          advance();
          advance();
          advance();
          const right2 = parseAdditive();
          left = { kind: "binary", op: ">>>", left, right: right2 };
          continue;
        }
        advance();
        advance();
        const right = parseAdditive();
        left = { kind: "binary", op: ">>", left, right };
        continue;
      }
      break;
    }
    return left;
  }
  function parseAdditive() {
    let left = parseMultiplicative();
    while (at("+" /* Plus */) || at("-" /* Minus */)) {
      const op = advance().value;
      const right = parseMultiplicative();
      left = { kind: "binary", op, left, right };
    }
    return left;
  }
  function parseMultiplicative() {
    let left = parseUnary();
    while (at("*" /* Star */) || at("/" /* Slash */) || at("%" /* Percent */)) {
      const op = advance().value;
      const right = parseUnary();
      left = { kind: "binary", op, left, right };
    }
    return left;
  }
  function parseUnary() {
    if (at("-" /* Minus */)) {
      advance();
      const operand = parseUnary();
      return { kind: "unary", op: "-", operand };
    }
    if (at("!" /* Not */)) {
      advance();
      const operand = parseUnary();
      return { kind: "unary", op: "!", operand };
    }
    if (at("~" /* BitNot */)) {
      advance();
      const operand = parseUnary();
      return { kind: "unary", op: "~", operand };
    }
    if (at("++" /* PlusPlus */)) {
      advance();
      const operand = parseUnary();
      return { kind: "preIncrement", operand, op: "++" };
    }
    if (at("--" /* MinusMinus */)) {
      advance();
      const operand = parseUnary();
      return { kind: "preIncrement", operand, op: "--" };
    }
    return parsePostfix();
  }
  function parsePostfix() {
    function exprToQualifiedName(e) {
      if (e.kind === "ident") return e.name;
      if (e.kind === "fieldAccess") {
        const left = exprToQualifiedName(e.object);
        if (!left) return null;
        return `${left}.${e.field}`;
      }
      return null;
    }
    let expr = parsePrimary();
    while (true) {
      if (at("." /* Dot */)) {
        advance();
        if (at("class" /* KwClass */)) {
          advance();
          const qn = exprToQualifiedName(expr);
          if (!qn) throw new Error("Class literal target must be a type name");
          expr = { kind: "classLit", className: qn };
          continue;
        }
        const name = parseIdentLike();
        if (at("(" /* LParen */)) {
          expect("(" /* LParen */);
          const args = [];
          if (!at(")" /* RParen */)) {
            do {
              args.push(parseExpr());
            } while (match("," /* Comma */));
          }
          expect(")" /* RParen */);
          expr = { kind: "call", object: expr, method: name, args };
        } else {
          expr = { kind: "fieldAccess", object: expr, field: name };
        }
      } else if (at("[" /* LBracket */)) {
        advance();
        const index = parseExpr();
        expect("]" /* RBracket */);
        expr = { kind: "arrayAccess", array: expr, index };
      } else if (at("++" /* PlusPlus */)) {
        advance();
        expr = { kind: "postIncrement", operand: expr, op: "++" };
      } else if (at("--" /* MinusMinus */)) {
        advance();
        expr = { kind: "postIncrement", operand: expr, op: "--" };
      } else if (at("::" /* ColonColon */)) {
        advance();
        if (match("new" /* KwNew */)) {
          expr = { kind: "methodRef", target: expr, method: "<init>", isConstructor: true };
        } else {
          const method = parseIdentLike();
          expr = { kind: "methodRef", target: expr, method, isConstructor: false };
        }
        break;
      } else {
        break;
      }
    }
    return expr;
  }
  function parsePrimary() {
    if (at("IntLiteral" /* IntLiteral */)) {
      return { kind: "intLit", value: parseIntLiteral(advance().value) };
    }
    if (at("LongLiteral" /* LongLiteral */)) {
      return { kind: "longLit", value: parseIntLiteral(advance().value) };
    }
    if (at("FloatLiteral" /* FloatLiteral */)) {
      let raw = advance().value.replace(/_/g, "");
      if (raw.endsWith("f") || raw.endsWith("F")) raw = raw.slice(0, -1);
      return { kind: "floatLit", value: parseFloat(raw) };
    }
    if (at("DoubleLiteral" /* DoubleLiteral */)) {
      let raw = advance().value.replace(/_/g, "");
      if (raw.endsWith("d") || raw.endsWith("D")) raw = raw.slice(0, -1);
      return { kind: "doubleLit", value: parseFloat(raw) };
    }
    if (at("CharLiteral" /* CharLiteral */)) {
      return { kind: "charLit", value: parseInt(advance().value, 10) };
    }
    if (at("StringLiteral" /* StringLiteral */)) {
      return { kind: "stringLit", value: advance().value };
    }
    if (at("BoolLiteral" /* BoolLiteral */)) {
      return { kind: "boolLit", value: advance().value === "true" };
    }
    if (at("NullLiteral" /* NullLiteral */)) {
      advance();
      return { kind: "nullLit" };
    }
    if (at("this" /* KwThis */)) {
      advance();
      return { kind: "this" };
    }
    if (at("String" /* KwString */)) {
      advance();
      return { kind: "ident", name: "String" };
    }
    if (at("switch" /* KwSwitch */)) {
      advance();
      expect("(" /* LParen */);
      const selector = parseExpr();
      expect(")" /* RParen */);
      const cases = parseSwitchCases(true);
      return { kind: "switchExpr", selector, cases };
    }
    if (at("super" /* KwSuper */)) {
      advance();
      expect("(" /* LParen */);
      const args = [];
      if (!at(")" /* RParen */)) {
        do {
          args.push(parseExpr());
        } while (match("," /* Comma */));
      }
      expect(")" /* RParen */);
      return { kind: "superCall", args };
    }
    if (at("{" /* LBrace */)) {
      advance();
      const elements = [];
      if (!at("}" /* RBrace */)) {
        do {
          elements.push(parseExpr());
        } while (match("," /* Comma */));
      }
      expect("}" /* RBrace */);
      return { kind: "arrayLit", elemType: "int", elements };
    }
    if (at("new" /* KwNew */)) {
      advance();
      if (at("int" /* KwInt */) || at("boolean" /* KwBoolean */)) {
        const elemType = at("int" /* KwInt */) ? "int" : "boolean";
        advance();
        expect("[" /* LBracket */);
        const size = parseExpr();
        expect("]" /* RBracket */);
        return { kind: "newArray", elemType, size };
      }
      const cls = expect("Ident" /* Ident */).value;
      if (at("[" /* LBracket */)) {
        advance();
        const size = parseExpr();
        expect("]" /* RBracket */);
        return { kind: "newArray", elemType: { className: cls }, size };
      }
      if (at("<" /* Lt */)) {
        let depth = 1;
        advance();
        while (depth > 0 && !at("EOF" /* EOF */)) {
          const nextDepth = consumeGenericAngleToken(depth);
          if (nextDepth !== void 0) depth = nextDepth;
          else advance();
        }
      }
      expect("(" /* LParen */);
      const args = [];
      if (!at(")" /* RParen */)) {
        do {
          args.push(parseExpr());
        } while (match("," /* Comma */));
      }
      expect(")" /* RParen */);
      return { kind: "newExpr", className: cls, args };
    }
    if (at("(" /* LParen */)) {
      const savedPos = pos;
      advance();
      if (at("Ident" /* Ident */) || at("String" /* KwString */) || at("int" /* KwInt */) || at("long" /* KwLong */) || at("short" /* KwShort */) || at("byte" /* KwByte */) || at("char" /* KwChar */) || at("float" /* KwFloat */) || at("double" /* KwDouble */) || at("boolean" /* KwBoolean */)) {
        let typeName = advance().value;
        if (at("<" /* Lt */)) {
          let depth = 1;
          advance();
          while (depth > 0 && !at("EOF" /* EOF */)) {
            const nextDepth = consumeGenericAngleToken(depth);
            if (nextDepth !== void 0) depth = nextDepth;
            else advance();
          }
        }
        if (at(")" /* RParen */)) {
          advance();
          if (at("Ident" /* Ident */) || at("this" /* KwThis */) || at("new" /* KwNew */) || at("(" /* LParen */) || at("IntLiteral" /* IntLiteral */) || at("StringLiteral" /* StringLiteral */) || at("LongLiteral" /* LongLiteral */) || at("FloatLiteral" /* FloatLiteral */) || at("DoubleLiteral" /* DoubleLiteral */) || at("CharLiteral" /* CharLiteral */) || at("BoolLiteral" /* BoolLiteral */) || at("NullLiteral" /* NullLiteral */)) {
            const castExpr = parseUnary();
            const castType = typeName === "String" ? "String" : typeName === "int" ? "int" : typeName === "long" ? "long" : typeName === "short" ? "short" : typeName === "byte" ? "byte" : typeName === "char" ? "char" : typeName === "float" ? "float" : typeName === "double" ? "double" : typeName === "boolean" ? "boolean" : { className: typeName };
            return { kind: "cast", type: castType, expr: castExpr };
          }
        }
        pos = savedPos;
        advance();
      }
      const expr = parseExpr();
      expect(")" /* RParen */);
      return expr;
    }
    if (at("Ident" /* Ident */)) {
      const name = advance().value;
      if (at("(" /* LParen */)) {
        expect("(" /* LParen */);
        const args = [];
        if (!at(")" /* RParen */)) {
          do {
            args.push(parseExpr());
          } while (match("," /* Comma */));
        }
        expect(")" /* RParen */);
        return { kind: "call", method: name, args };
      }
      return { kind: "ident", name };
    }
    throw new Error(`Unexpected token: ${peek().kind} ("${peek().value}") at line ${peek().line}:${peek().col}`);
  }
}

// web/javac/method-registry.ts
var BASE_KNOWN_METHODS = {
  // IO (java.lang.IO — JEP 463/512 compact source helper, 199xVM native stub)
  "java/lang/IO.println(Ljava/lang/Object;)": { owner: "java/lang/IO", returnType: "void", paramTypes: [{ className: "java/lang/Object" }], isStatic: true },
  "java/lang/IO.println()": { owner: "java/lang/IO", returnType: "void", paramTypes: [], isStatic: true },
  "java/lang/IO.print(Ljava/lang/Object;)": { owner: "java/lang/IO", returnType: "void", paramTypes: [{ className: "java/lang/Object" }], isStatic: true }
};
var knownMethods = { ...BASE_KNOWN_METHODS };
var methodIndex = /* @__PURE__ */ new Map();
var ownerSet = /* @__PURE__ */ new Set();
function rebuildIndexes() {
  methodIndex = /* @__PURE__ */ new Map();
  ownerSet = /* @__PURE__ */ new Set();
  addToIndexes(knownMethods);
}
function addToIndexes(entries) {
  for (const key of Object.keys(entries)) {
    const dotIdx = key.indexOf(".");
    if (dotIdx < 0) continue;
    const owner = key.slice(0, dotIdx);
    ownerSet.add(owner);
    const parenIdx = key.indexOf("(", dotIdx);
    const groupKey = parenIdx > 0 ? key.slice(0, parenIdx) : key;
    let group = methodIndex.get(groupKey);
    if (!group) {
      group = [];
      methodIndex.set(groupKey, group);
    }
    if (!group.some((e) => e.key === key)) {
      group.push({ key, sig: entries[key] });
    }
  }
}
rebuildIndexes();
var knownClassInterfaces = {};
function setMethodRegistry(reg) {
  knownMethods = { ...knownMethods, ...reg };
  addToIndexes(reg);
}
function setClassInterfaces(ifaces) {
  for (const [cls, list] of Object.entries(ifaces)) {
    const existing = new Set(knownClassInterfaces[cls] ?? []);
    for (const i of list) existing.add(i);
    knownClassInterfaces[cls] = [...existing];
  }
}
function getKnownClassInterfaces(cls) {
  return knownClassInterfaces[cls];
}
function resetMethodRegistry() {
  knownMethods = { ...BASE_KNOWN_METHODS };
  knownClassInterfaces = {};
  rebuildIndexes();
}
var OBJECT_PUBLIC_INSTANCE_METHODS = /* @__PURE__ */ new Set([
  "toString()",
  "hashCode()",
  "equals(Ljava/lang/Object;)",
  "getClass()",
  "notify()",
  "notifyAll()",
  "wait()",
  "wait(J)",
  "wait(JI)"
]);
function lookupKnownMethod(owner, method, argDescs) {
  const exact = knownMethods[`${owner}.${method}(${argDescs})`];
  if (exact) return exact;
  const group = methodIndex.get(`${owner}.${method}`);
  if (!group) return void 0;
  const wantedArgs = splitDescriptorArgs(argDescs);
  for (const entry of group) {
    const start = entry.key.indexOf("(");
    const end = entry.key.indexOf(")");
    if (start < 0 || end < 0) continue;
    const keyArgs = splitDescriptorArgs(entry.key.slice(start + 1, end));
    if (keyArgs.length !== wantedArgs.length) continue;
    const compatible = keyArgs.every((a, i) => {
      const b = wantedArgs[i];
      if (a === b) return true;
      const aRef = a.startsWith("L") || a.startsWith("[");
      const bRef = b.startsWith("L") || b.startsWith("[");
      if (aRef && bRef) return true;
      if (aRef && !bRef) return true;
      return false;
    });
    if (compatible) return entry.sig;
  }
  return void 0;
}
function findKnownMethodByArity(owner, method, arity, wantStatic) {
  const group = methodIndex.get(`${owner}.${method}`);
  if (!group) return void 0;
  for (const entry of group) {
    const isStatic = entry.sig.isStatic ?? false;
    if (isStatic !== wantStatic) continue;
    if (entry.sig.paramTypes.length === arity) return entry.sig;
  }
  return void 0;
}
function findKnownFunctionalInterface(owner) {
  const prefix = `${owner}.`;
  const candidates = [];
  for (const [groupKey, group] of methodIndex) {
    if (!groupKey.startsWith(prefix)) continue;
    const methodName = groupKey.slice(prefix.length);
    for (const entry of group) {
      const open = entry.key.indexOf("(");
      const end = entry.key.indexOf(")");
      if (open < 0 || end < 0) continue;
      const signatureKey = `${methodName}(${entry.key.slice(open + 1, end)})`;
      if (methodName === "<init>" || OBJECT_PUBLIC_INSTANCE_METHODS.has(signatureKey)) continue;
      const sig = entry.sig;
      if (!sig.isInterface || sig.isStatic) continue;
      if (sig.isAbstract === false) continue;
      candidates.push({ name: methodName, sig });
    }
  }
  if (candidates.length !== 1) return void 0;
  return {
    samMethod: candidates[0].name,
    params: candidates[0].sig.paramTypes,
    returnType: candidates[0].sig.returnType
  };
}
function splitDescriptorArgs(descs) {
  const args = [];
  for (let i = 0; i < descs.length; ) {
    if (descs[i] === "[") {
      let j = i;
      while (descs[j] === "[") j++;
      if (descs[j] === "L") {
        const semi = descs.indexOf(";", j);
        args.push(descs.slice(i, semi + 1));
        i = semi + 1;
      } else {
        args.push(descs.slice(i, j + 1));
        i = j + 1;
      }
      continue;
    }
    if (descs[i] === "L") {
      const semi = descs.indexOf(";", i);
      args.push(descs.slice(i, semi + 1));
      i = semi + 1;
      continue;
    }
    args.push(descs[i]);
    i++;
  }
  return args;
}
function hasFunctionalArg(args) {
  return args.some((a) => a.kind === "lambda" || a.kind === "methodRef");
}
function hasKnownMethodOwnerPrefix(owner) {
  return ownerSet.has(owner);
}
function getKnownClassNames() {
  return [...ownerSet];
}
function getKnownClassesByPackage(pkg) {
  const prefix = pkg + "/";
  return [...ownerSet].filter((c) => c.startsWith(prefix) && !c.includes("/", prefix.length));
}
function getMethodsForClass(owner) {
  const prefix = `${owner}.`;
  const results = [];
  for (const [groupKey, group] of methodIndex) {
    if (!groupKey.startsWith(prefix)) continue;
    const methodName = groupKey.slice(prefix.length);
    for (const entry of group) {
      results.push({ name: methodName, sig: entry.sig });
    }
  }
  return results;
}

// web/javac/compiler.ts
var ConstantPoolBuilder = class {
  constructor() {
    __publicField(this, "entries", [{ tag: 0, data: [] }]);
    // index 0 placeholder
    __publicField(this, "utf8Cache", /* @__PURE__ */ new Map());
  }
  get count() {
    return this.entries.length;
  }
  addUtf8(s) {
    const cached = this.utf8Cache.get(s);
    if (cached !== void 0) return cached;
    const bytes = new TextEncoder().encode(s);
    const data = [bytes.length >> 8 & 255, bytes.length & 255, ...bytes];
    const idx = this.entries.length;
    this.entries.push({ tag: 1, data });
    this.utf8Cache.set(s, idx);
    return idx;
  }
  addInteger(v) {
    const data = [v >> 24 & 255, v >> 16 & 255, v >> 8 & 255, v & 255];
    const idx = this.entries.length;
    this.entries.push({ tag: 3, data });
    return idx;
  }
  addFloat(v) {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, v);
    const bytes = new Uint8Array(buf);
    const data = [bytes[0], bytes[1], bytes[2], bytes[3]];
    const idx = this.entries.length;
    this.entries.push({ tag: 4, data });
    return idx;
  }
  addDouble(v) {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, v);
    const bytes = new Uint8Array(buf);
    const data = [...bytes];
    const idx = this.entries.length;
    this.entries.push({ tag: 6, data });
    this.entries.push({ tag: 0, data: [] });
    return idx;
  }
  addLong(v) {
    const hi = Math.floor(v / 4294967296);
    const lo = v >>> 0;
    const data = [
      hi >> 24 & 255,
      hi >> 16 & 255,
      hi >> 8 & 255,
      hi & 255,
      lo >> 24 & 255,
      lo >> 16 & 255,
      lo >> 8 & 255,
      lo & 255
    ];
    const idx = this.entries.length;
    this.entries.push({ tag: 5, data });
    this.entries.push({ tag: 0, data: [] });
    return idx;
  }
  addClass(name) {
    const nameIdx = this.addUtf8(name);
    const idx = this.entries.length;
    this.entries.push({ tag: 7, data: [nameIdx >> 8 & 255, nameIdx & 255] });
    return idx;
  }
  addString(s) {
    const strIdx = this.addUtf8(s);
    const idx = this.entries.length;
    this.entries.push({ tag: 8, data: [strIdx >> 8 & 255, strIdx & 255] });
    return idx;
  }
  addNameAndType(name, descriptor) {
    const nameIdx = this.addUtf8(name);
    const descIdx = this.addUtf8(descriptor);
    const idx = this.entries.length;
    this.entries.push({ tag: 12, data: [
      nameIdx >> 8 & 255,
      nameIdx & 255,
      descIdx >> 8 & 255,
      descIdx & 255
    ] });
    return idx;
  }
  addFieldref(className, fieldName, descriptor) {
    const classIdx = this.addClass(className);
    const natIdx = this.addNameAndType(fieldName, descriptor);
    const idx = this.entries.length;
    this.entries.push({ tag: 9, data: [
      classIdx >> 8 & 255,
      classIdx & 255,
      natIdx >> 8 & 255,
      natIdx & 255
    ] });
    return idx;
  }
  addMethodref(className, methodName, descriptor) {
    const classIdx = this.addClass(className);
    const natIdx = this.addNameAndType(methodName, descriptor);
    const idx = this.entries.length;
    this.entries.push({ tag: 10, data: [
      classIdx >> 8 & 255,
      classIdx & 255,
      natIdx >> 8 & 255,
      natIdx & 255
    ] });
    return idx;
  }
  addInterfaceMethodref(className, methodName, descriptor) {
    const classIdx = this.addClass(className);
    const natIdx = this.addNameAndType(methodName, descriptor);
    const idx = this.entries.length;
    this.entries.push({ tag: 11, data: [
      classIdx >> 8 & 255,
      classIdx & 255,
      natIdx >> 8 & 255,
      natIdx & 255
    ] });
    return idx;
  }
  addMethodHandle(referenceKind, referenceIndex) {
    const idx = this.entries.length;
    this.entries.push({ tag: 15, data: [referenceKind & 255, referenceIndex >> 8 & 255, referenceIndex & 255] });
    return idx;
  }
  addMethodType(descriptor) {
    const descIdx = this.addUtf8(descriptor);
    const idx = this.entries.length;
    this.entries.push({ tag: 16, data: [descIdx >> 8 & 255, descIdx & 255] });
    return idx;
  }
  addInvokeDynamic(bootstrapMethodAttrIndex, name, descriptor) {
    const natIdx = this.addNameAndType(name, descriptor);
    const idx = this.entries.length;
    this.entries.push({ tag: 18, data: [
      bootstrapMethodAttrIndex >> 8 & 255,
      bootstrapMethodAttrIndex & 255,
      natIdx >> 8 & 255,
      natIdx & 255
    ] });
    return idx;
  }
  serialize() {
    const out = [];
    const count = this.entries.length;
    out.push(count >> 8 & 255, count & 255);
    for (let i = 1; i < count; i++) {
      const e = this.entries[i];
      if (e.tag === 0) continue;
      out.push(e.tag, ...e.data);
    }
    return out;
  }
};
var BytecodeEmitter = class {
  constructor() {
    __publicField(this, "code", []);
    __publicField(this, "maxStack", 0);
    __publicField(this, "maxLocals", 0);
    __publicField(this, "exceptionTable", []);
    __publicField(this, "currentStack", 0);
  }
  adjustStack(delta) {
    this.currentStack += delta;
    if (this.currentStack > this.maxStack) this.maxStack = this.currentStack;
  }
  emit(byte) {
    this.code.push(byte);
  }
  emitU16(v) {
    this.code.push(v >> 8 & 255, v & 255);
  }
  get pc() {
    return this.code.length;
  }
  // Stack-tracking emit helpers
  emitPush(opcode) {
    this.emit(opcode);
    this.adjustStack(1);
  }
  emitPop(opcode) {
    this.emit(opcode);
    this.adjustStack(-1);
  }
  emitIconst(v) {
    if (v >= -1 && v <= 5) {
      this.emit(3 + v);
      if (v === -1) this.code[this.code.length - 1] = 2;
      else this.code[this.code.length - 1] = 3 + v;
    } else if (v >= -128 && v <= 127) {
      this.emit(16);
      this.emit(v & 255);
    } else if (v >= -32768 && v <= 32767) {
      this.emit(17);
      this.emitU16(v & 65535);
    } else {
      return false;
    }
    this.adjustStack(1);
    return true;
  }
  emitFload(idx) {
    if (idx <= 3) this.emit(34 + idx);
    else {
      this.emit(23);
      this.emit(idx);
    }
    this.adjustStack(1);
  }
  emitFstore(idx) {
    if (idx <= 3) this.emit(67 + idx);
    else {
      this.emit(56);
      this.emit(idx);
    }
    this.adjustStack(-1);
  }
  emitDload(idx) {
    if (idx <= 3) this.emit(38 + idx);
    else {
      this.emit(24);
      this.emit(idx);
    }
    this.adjustStack(1);
  }
  emitDstore(idx) {
    if (idx <= 3) this.emit(71 + idx);
    else {
      this.emit(57);
      this.emit(idx);
    }
    this.adjustStack(-1);
  }
  emitFconst(v, cp) {
    if (v === 0) {
      this.emit(11);
      this.adjustStack(1);
    } else if (v === 1) {
      this.emit(12);
      this.adjustStack(1);
    } else if (v === 2) {
      this.emit(13);
      this.adjustStack(1);
    } else {
      this.emitLdc(cp.addFloat(v));
    }
  }
  emitDconst(v, cp) {
    if (v === 0) {
      this.emit(14);
    } else if (v === 1) {
      this.emit(15);
    } else {
      const cpIdx = cp.addDouble(v);
      this.emit(20);
      this.emitU16(cpIdx);
    }
    this.adjustStack(1);
  }
  emitLconst(v, cp) {
    if (v === 0) {
      this.emit(9);
    } else if (v === 1) {
      this.emit(10);
    } else {
      const cpIdx = cp.addLong(v);
      this.emit(20);
      this.emitU16(cpIdx);
    }
    this.adjustStack(1);
  }
  emitLdc(cpIdx) {
    if (cpIdx <= 255) {
      this.emit(18);
      this.emit(cpIdx);
    } else {
      this.emit(19);
      this.emitU16(cpIdx);
    }
    this.adjustStack(1);
  }
  emitAload(idx) {
    if (idx <= 3) this.emit(42 + idx);
    else {
      this.emit(25);
      this.emit(idx);
    }
    this.adjustStack(1);
  }
  emitAstore(idx) {
    if (idx <= 3) this.emit(75 + idx);
    else {
      this.emit(58);
      this.emit(idx);
    }
    this.adjustStack(-1);
  }
  emitIload(idx) {
    if (idx <= 3) this.emit(26 + idx);
    else {
      this.emit(21);
      this.emit(idx);
    }
    this.adjustStack(1);
  }
  emitIstore(idx) {
    if (idx <= 3) this.emit(59 + idx);
    else {
      this.emit(54);
      this.emit(idx);
    }
    this.adjustStack(-1);
  }
  emitLload(idx) {
    if (idx <= 3) this.emit(30 + idx);
    else {
      this.emit(22);
      this.emit(idx);
    }
    this.adjustStack(1);
  }
  emitLstore(idx) {
    if (idx <= 3) this.emit(63 + idx);
    else {
      this.emit(55);
      this.emit(idx);
    }
    this.adjustStack(-1);
  }
  emitInvokevirtual(cpIdx, argCount, hasReturn) {
    this.emit(182);
    this.emitU16(cpIdx);
    this.adjustStack(-(argCount + 1) + (hasReturn ? 1 : 0));
  }
  emitInvokespecial(cpIdx, argCount, hasReturn) {
    this.emit(183);
    this.emitU16(cpIdx);
    this.adjustStack(-(argCount + 1) + (hasReturn ? 1 : 0));
  }
  emitInvokestatic(cpIdx, argCount, hasReturn) {
    this.emit(184);
    this.emitU16(cpIdx);
    this.adjustStack(-argCount + (hasReturn ? 1 : 0));
  }
  emitInvokeinterface(cpIdx, argCount, hasReturn) {
    this.emit(185);
    this.emitU16(cpIdx);
    this.emit(argCount + 1);
    this.emit(0);
    this.adjustStack(-(argCount + 1) + (hasReturn ? 1 : 0));
  }
  emitInvokedynamic(cpIdx, argCount, hasReturn) {
    this.emit(186);
    this.emitU16(cpIdx);
    this.emit(0);
    this.emit(0);
    this.adjustStack(-argCount + (hasReturn ? 1 : 0));
  }
  // Branch helpers: emit placeholder offset, return patch position
  emitBranch(opcode) {
    this.emit(opcode);
    const patchPos = this.code.length;
    this.emitU16(0);
    return patchPos;
  }
  patchBranch(patchPos, targetPc) {
    const offset = targetPc - (patchPos - 1);
    this.code[patchPos] = offset >> 8 & 255;
    this.code[patchPos + 1] = offset & 255;
  }
  emitReturn(type) {
    if (type === "void") this.emit(177);
    else if (type === "long") {
      this.emit(173);
      this.adjustStack(-1);
    } else if (type === "float") {
      this.emit(174);
      this.adjustStack(-1);
    } else if (type === "double") {
      this.emit(175);
      this.adjustStack(-1);
    } else if (type === "int" || type === "boolean" || type === "short" || type === "byte" || type === "char") {
      this.emit(172);
      this.adjustStack(-1);
    } else {
      this.emit(176);
      this.adjustStack(-1);
    }
  }
  // For if_icmpge etc: pops 2, pushes 0
  adjustStackForCompare() {
    this.adjustStack(-2);
  }
  // For iaload/aaload: pops 2 (arrayref + index), pushes 1 (element)
  adjustStackForArrayLoad() {
    this.adjustStack(-1);
  }
  // Exception handler entry point: pushes exception object onto empty stack
  adjustStackForCatch() {
    this.adjustStack(1);
  }
};
function typeToDescriptor(t) {
  if (t === "int") return "I";
  if (t === "long") return "J";
  if (t === "short") return "S";
  if (t === "byte") return "B";
  if (t === "char") return "C";
  if (t === "float") return "F";
  if (t === "double") return "D";
  if (t === "boolean") return "Z";
  if (t === "void") return "V";
  if (t === "String") return "Ljava/lang/String;";
  if (typeof t === "object" && "className" in t) return `L${t.className.replace(/\./g, "/")};`;
  if (typeof t === "object" && "array" in t) return `[${typeToDescriptor(t.array)}`;
  return "Ljava/lang/Object;";
}
function methodDescriptor(params, returnType) {
  return "(" + params.map((p) => typeToDescriptor(p.type)).join("") + ")" + typeToDescriptor(returnType);
}
function enumConstructorDescriptor(paramTypes) {
  return "(Ljava/lang/String;I" + paramTypes.map(typeToDescriptor).join("") + ")V";
}
function isRefType(t) {
  return t !== "int" && t !== "long" && t !== "short" && t !== "byte" && t !== "char" && t !== "float" && t !== "double" && t !== "boolean" && t !== "void";
}
function isPrimitiveType(t) {
  return t === "int" || t === "long" || t === "short" || t === "byte" || t === "char" || t === "float" || t === "double" || t === "boolean";
}
function isIntegralType(t) {
  return t === "int" || t === "long" || t === "short" || t === "byte" || t === "char";
}
function sameType(a, b) {
  if (a === b) return true;
  if (typeof a === "object" && typeof b === "object") {
    if ("className" in a && "className" in b) return a.className === b.className;
    if ("array" in a && "array" in b) return sameType(a.array, b.array);
  }
  return false;
}
var WIDENING_RANK = {
  byte: 0,
  short: 1,
  int: 2,
  long: 3,
  float: 4,
  double: 5,
  char: 2
  /* char → int level */
};
function isAssignable(to, from) {
  if (sameType(to, from)) return true;
  if (isRefType(to) && isRefType(from)) return true;
  if (isIntLike(to) && isIntLike(from)) return true;
  const toR = typeof to === "string" ? WIDENING_RANK[to] : void 0;
  const fromR = typeof from === "string" ? WIDENING_RANK[from] : void 0;
  if (toR !== void 0 && fromR !== void 0) return toR >= fromR;
  return false;
}
function isKnownClass(ctx, cls) {
  return cls === "java/lang/Object" || ctx.classSupers.has(cls) || !!BUILTIN_SUPERS[cls];
}
function isAssignableInContext(ctx, to, from) {
  if (sameType(to, from)) return true;
  if (isPrimitiveType(to) && isPrimitiveType(from)) return isAssignable(to, from);
  if (isPrimitiveType(to) || isPrimitiveType(from)) return false;
  if (typeof to === "object" && "array" in to) {
    return typeof from === "object" && "array" in from && isAssignableInContext(ctx, to.array, from.array);
  }
  if (typeof from === "object" && "array" in from) {
    const toCls2 = toInternalClassName(ctx, to);
    return toCls2 === "java/lang/Object";
  }
  const toCls = toInternalClassName(ctx, to);
  const fromCls = toInternalClassName(ctx, from);
  if (!toCls || !fromCls) return isAssignable(to, from);
  if (toCls === "java/lang/Object") return true;
  if (fromCls === "java/lang/Object") return true;
  if (isClassSupertype(ctx, toCls, fromCls)) return true;
  if (isKnownClass(ctx, toCls) && isKnownClass(ctx, fromCls)) return false;
  return true;
}
function isCastConvertible(to, from) {
  if (sameType(to, from)) return true;
  const toPrim = isPrimitiveType(to);
  const fromPrim = isPrimitiveType(from);
  if (toPrim && fromPrim) {
    const numerics = ["byte", "short", "char", "int", "long", "float", "double"];
    return numerics.includes(to) && numerics.includes(from);
  }
  if (toPrim && !fromPrim) return true;
  if (!toPrim && fromPrim) return true;
  return true;
}
var UNBOX_INFO = {
  int: { wrapper: "java/lang/Integer", method: "intValue", desc: "()I" },
  long: { wrapper: "java/lang/Long", method: "longValue", desc: "()J" },
  float: { wrapper: "java/lang/Float", method: "floatValue", desc: "()F" },
  double: { wrapper: "java/lang/Double", method: "doubleValue", desc: "()D" },
  boolean: { wrapper: "java/lang/Boolean", method: "booleanValue", desc: "()Z" },
  byte: { wrapper: "java/lang/Byte", method: "byteValue", desc: "()B" },
  short: { wrapper: "java/lang/Short", method: "shortValue", desc: "()S" },
  char: { wrapper: "java/lang/Character", method: "charValue", desc: "()C" }
};
var BOX_INFO = {
  int: { wrapper: "java/lang/Integer", desc: "(I)Ljava/lang/Integer;" },
  long: { wrapper: "java/lang/Long", desc: "(J)Ljava/lang/Long;" },
  float: { wrapper: "java/lang/Float", desc: "(F)Ljava/lang/Float;" },
  double: { wrapper: "java/lang/Double", desc: "(D)Ljava/lang/Double;" },
  boolean: { wrapper: "java/lang/Boolean", desc: "(Z)Ljava/lang/Boolean;" },
  byte: { wrapper: "java/lang/Byte", desc: "(B)Ljava/lang/Byte;" },
  short: { wrapper: "java/lang/Short", desc: "(S)Ljava/lang/Short;" },
  char: { wrapper: "java/lang/Character", desc: "(C)Ljava/lang/Character;" }
};
function mergeTernaryType(a, b) {
  if (sameType(a, b)) return a;
  const numOrder = ["byte", "short", "char", "int", "long", "float", "double"];
  const ai = numOrder.indexOf(a);
  const bi = numOrder.indexOf(b);
  if (ai >= 0 && bi >= 0) return numOrder[Math.max(ai, bi)];
  if (a === "int" && b === "boolean" || a === "boolean" && b === "int") return "int";
  if (isRefType(a) && isRefType(b)) return { className: "java/lang/Object" };
  return a;
}
function resolveWildcardImport(name, packageImports) {
  if (!/^[A-Z]/.test(name) || packageImports.length === 0) return void 0;
  const matches = /* @__PURE__ */ new Set();
  for (const pkg of packageImports) {
    const candidate = `${pkg}/${name}`;
    if (hasKnownMethodOwnerPrefix(candidate)) {
      matches.add(candidate);
      if (matches.size > 1) {
        throw new Error(`Ambiguous class name '${name}': found in ${[...matches].join(" and ")}`);
      }
    }
  }
  return matches.size === 1 ? matches.values().next().value : void 0;
}
function resolveClassName(ctx, name) {
  if (name.includes("/")) return name;
  if (name.includes(".")) return name.replace(/\./g, "/");
  const explicit = ctx.importMap.get(name);
  if (explicit) return explicit;
  if (ctx.classDecls.has(name)) return name;
  return resolveWildcardImport(name, ctx.packageImports) ?? name;
}
function ownerSearchOrder(ctx, startOwner) {
  const classChain = [];
  const seenClass = /* @__PURE__ */ new Set();
  let cur = startOwner;
  while (cur && !seenClass.has(cur)) {
    seenClass.add(cur);
    classChain.push(cur);
    const decl = ctx.classDecls.get(cur);
    if (decl) cur = decl.superClass ? resolveClassName(ctx, decl.superClass) : void 0;
    else cur = ctx.classSupers.get(cur) ?? BUILTIN_SUPERS[cur];
  }
  const interfaces = [];
  const seenIface = /* @__PURE__ */ new Set();
  const queue = [];
  for (const owner of classChain) {
    const decl = ctx.classDecls.get(owner);
    if (decl) {
      for (const itf of decl.interfaces ?? []) queue.push(resolveClassName(ctx, itf));
    }
    const knownIfaces = getKnownClassInterfaces(owner);
    if (knownIfaces) {
      for (const itf of knownIfaces) queue.push(itf);
    }
  }
  while (queue.length > 0) {
    const itf = queue.shift();
    if (seenIface.has(itf)) continue;
    seenIface.add(itf);
    interfaces.push(itf);
    const decl = ctx.classDecls.get(itf);
    if (!decl) continue;
    for (const parent of decl.interfaces ?? []) queue.push(resolveClassName(ctx, parent));
  }
  return [...classChain, ...interfaces];
}
function resolveMethodCandidate(ctx, ownerClass, method, args, wantStatic) {
  const argTypes = args.map((a) => inferType(ctx, a));
  return resolveMethodCandidateByTypes(ctx, ownerClass, method, argTypes, wantStatic, args);
}
function resolveMethodCandidateByTypes(ctx, ownerClass, method, argTypes, wantStatic, originalArgs = []) {
  const argDescs = argTypes.map(typeToDescriptor).join("");
  for (const owner of ownerSearchOrder(ctx, ownerClass)) {
    const decl = ctx.classDecls.get(owner);
    if (decl) {
      let exactMatch;
      let exactCount = 0;
      let arityMatch;
      let arityCount = 0;
      for (const mm of decl.methods) {
        if (mm.name !== method || mm.isStatic !== wantStatic || mm.params.length !== argTypes.length) continue;
        arityCount++;
        arityMatch = mm;
        if (mm.params.map((p) => typeToDescriptor(p.type)).join("") === argDescs) {
          exactCount++;
          exactMatch = mm;
        }
      }
      if (arityCount === 0) continue;
      let m;
      if (exactCount === 1) m = exactMatch;
      else if (exactCount > 1) {
        throw new Error(`Ambiguous method overload: ${owner}.${method}(${argDescs})`);
      } else if (arityCount === 1) {
        m = arityMatch;
      } else {
        throw new Error(`Ambiguous method overload: ${owner}.${method}(${argDescs})`);
      }
      return {
        owner,
        paramTypes: m.params.map((p) => p.type),
        returnType: m.returnType,
        isStatic: m.isStatic,
        isInterface: decl.kind === "interface" || decl.kind === "annotation"
      };
    }
    const exactSig = lookupKnownMethod(owner, method, argDescs);
    const sig = exactSig ?? (hasFunctionalArg(originalArgs) ? findKnownMethodByArity(owner, method, argTypes.length, wantStatic) : void 0);
    if (!sig) continue;
    return {
      owner,
      paramTypes: sig.paramTypes,
      returnType: sig.returnType,
      isStatic: !!sig.isStatic,
      isInterface: !!sig.isInterface
    };
  }
  return void 0;
}
function resolveUnqualifiedMethodCandidate(ctx, method, args) {
  const staticResolved = resolveMethodCandidate(ctx, ctx.className, method, args, true);
  const instResolved = resolveMethodCandidate(ctx, ctx.className, method, args, false);
  if (ctx.ownerIsStatic) {
    if (instResolved && !staticResolved) {
      throw new Error(`Cannot call instance method '${method}' from static context`);
    }
    return staticResolved;
  }
  return instResolved ?? staticResolved;
}
function buildNearestFieldMap(fields) {
  const map = /* @__PURE__ */ new Map();
  for (const f of fields) {
    if (!map.has(f.name)) map.set(f.name, f);
  }
  return map;
}
function findLocal(ctx, name) {
  for (let i = ctx.locals.length - 1; i >= 0; i--) {
    if (ctx.locals[i].name === name) return ctx.locals[i];
  }
  return void 0;
}
function addLocal(ctx, name, type, synthetic = false) {
  if (!synthetic) {
    for (let i = ctx.locals.length - 1; i >= 0; i--) {
      const l = ctx.locals[i];
      if (!l.synthetic && l.name === name) {
        throw new Error(`Variable '${name}' is already defined in the scope`);
      }
    }
  }
  const slot = ctx.nextSlot++;
  ctx.locals.push({ name, type, slot, synthetic });
  return slot;
}
function inferType(ctx, expr) {
  switch (expr.kind) {
    case "intLit":
      return "int";
    case "longLit":
      return "long";
    case "floatLit":
      return "float";
    case "doubleLit":
      return "double";
    case "charLit":
      return "char";
    case "stringLit":
      return "String";
    case "boolLit":
      return "boolean";
    case "nullLit":
      return { className: "java/lang/Object" };
    case "this":
      return { className: ctx.className };
    case "ident": {
      const loc = findLocal(ctx, expr.name);
      if (loc) return loc.type;
      const field = ctx.fieldMap.get(expr.name);
      if (field) return field.type;
      const inherited = ctx.inheritedFieldMap.get(expr.name);
      if (inherited) return inherited.type;
      return { className: expr.name };
    }
    case "binary": {
      if (["+", "-", "*", "/", "%"].includes(expr.op)) {
        const lt = inferType(ctx, expr.left);
        const rt = inferType(ctx, expr.right);
        if (expr.op === "+" && (lt === "String" || rt === "String")) return "String";
        if (lt === "double" || rt === "double") return "double";
        if (lt === "float" || rt === "float") return "float";
        if (lt === "long" || rt === "long") return "long";
        return "int";
      }
      if (["<<", ">>", ">>>"].includes(expr.op)) {
        const lt = inferType(ctx, expr.left);
        return lt === "long" ? "long" : "int";
      }
      if (["&", "|", "^"].includes(expr.op)) {
        const lt = inferType(ctx, expr.left);
        const rt = inferType(ctx, expr.right);
        if (lt === "boolean" && rt === "boolean") return "boolean";
        if (lt === "long" || rt === "long") return "long";
        return "int";
      }
      return "boolean";
    }
    case "unary": {
      if (expr.op === "~") {
        const t2 = inferType(ctx, expr.operand);
        return t2 === "long" ? "long" : "int";
      }
      if (expr.op === "!") return "boolean";
      const t = inferType(ctx, expr.operand);
      if (t === "double") return "double";
      if (t === "float") return "float";
      if (t === "long") return "long";
      return "int";
    }
    case "newExpr":
      return { className: resolveClassName(ctx, expr.className) };
    case "call": {
      if (expr.object) {
        const objType = inferType(ctx, expr.object);
        const rawOwner = objType === "String" ? "java/lang/String" : typeof objType === "object" && "className" in objType ? objType.className : "java/lang/Object";
        const ownerClass = resolveClassName(ctx, rawOwner);
        const resolved = resolveMethodCandidate(ctx, ownerClass, expr.method, expr.args, false);
        if (resolved) return resolved.returnType;
      } else {
        const resolved = resolveUnqualifiedMethodCandidate(ctx, expr.method, expr.args);
        if (resolved) return resolved.returnType;
        if (ctx.staticWildcardImports.length > 0) {
          for (const owner of ctx.staticWildcardImports) {
            const resolved2 = resolveMethodCandidate(ctx, owner, expr.method, expr.args, true);
            if (resolved2) return resolved2.returnType;
          }
        }
      }
      return { className: "java/lang/Object" };
    }
    case "staticCall": {
      const internalName = resolveClassName(ctx, expr.className);
      const resolved = resolveMethodCandidate(ctx, internalName, expr.method, expr.args, true);
      if (resolved) return resolved.returnType;
      return { className: "java/lang/Object" };
    }
    case "fieldAccess": {
      if (expr.field === "out") return { className: "java/io/PrintStream" };
      if (expr.field === "length") return "int";
      const fld = ctx.fieldMap.get(expr.field);
      if (fld) return fld.type;
      return { className: "java/lang/Object" };
    }
    case "cast":
      return expr.type;
    case "postIncrement":
      return inferType(ctx, expr.operand);
    case "preIncrement":
      return inferType(ctx, expr.operand);
    case "instanceof":
      return "boolean";
    case "staticField":
      return { className: "java/lang/Object" };
    case "arrayAccess": {
      const arrType = inferType(ctx, expr.array);
      if (typeof arrType === "object" && "array" in arrType) return arrType.array;
      return "int";
    }
    case "arrayLit":
      return { array: expr.elemType };
    case "newArray":
      return { array: expr.elemType };
    case "superCall":
      return "void";
    case "ternary":
      return mergeTernaryType(inferType(ctx, expr.thenExpr), inferType(ctx, expr.elseExpr));
    case "switchExpr": {
      let current;
      for (const c of expr.cases) {
        if (c.expr) {
          const t = inferType(ctx, c.expr);
          current = current ? mergeTernaryType(current, t) : t;
        } else if (c.stmts) {
          for (const s of c.stmts) {
            if (s.kind === "yield") {
              const t = inferType(ctx, s.value);
              current = current ? mergeTernaryType(current, t) : t;
            }
          }
        }
      }
      return current ?? { className: "java/lang/Object" };
    }
    case "lambda":
      return { className: "java/lang/Object" };
    case "methodRef":
      return { className: "java/lang/Object" };
    case "classLit":
      return { className: "java/lang/Class" };
  }
}
function compileExpr(ctx, emitter, expr, expectedType) {
  switch (expr.kind) {
    case "intLit": {
      if (!emitter.emitIconst(expr.value)) {
        const cpIdx = ctx.cp.addInteger(expr.value);
        emitter.emitLdc(cpIdx);
      }
      break;
    }
    case "longLit": {
      emitter.emitLconst(expr.value, ctx.cp);
      break;
    }
    case "floatLit": {
      emitter.emitFconst(expr.value, ctx.cp);
      break;
    }
    case "doubleLit": {
      emitter.emitDconst(expr.value, ctx.cp);
      break;
    }
    case "charLit": {
      if (!emitter.emitIconst(expr.value)) {
        const cpIdx = ctx.cp.addInteger(expr.value);
        emitter.emitLdc(cpIdx);
      }
      break;
    }
    case "stringLit": {
      const cpIdx = ctx.cp.addString(expr.value);
      emitter.emitLdc(cpIdx);
      break;
    }
    case "boolLit": {
      emitter.emitIconst(expr.value ? 1 : 0);
      break;
    }
    case "nullLit": {
      emitter.emit(1);
      break;
    }
    case "this": {
      emitter.emitAload(0);
      break;
    }
    case "ident": {
      const loc = findLocal(ctx, expr.name);
      if (loc) {
        emitLoadLocalByType(emitter, loc.slot, loc.type);
        break;
      }
      const field = ctx.fieldMap.get(expr.name);
      if (field) {
        if (field.isStatic) {
          const fRef = ctx.cp.addFieldref(ctx.className, expr.name, typeToDescriptor(field.type));
          emitter.emit(178);
          emitter.emitU16(fRef);
        } else {
          emitter.emitAload(0);
          const fRef = ctx.cp.addFieldref(ctx.className, expr.name, typeToDescriptor(field.type));
          emitter.emit(180);
          emitter.emitU16(fRef);
        }
        break;
      }
      const inherited = ctx.inheritedFieldMap.get(expr.name);
      if (inherited) {
        emitter.emitAload(0);
        const fRef = ctx.cp.addFieldref(ctx.superClass, expr.name, typeToDescriptor(inherited.type));
        emitter.emit(180);
        emitter.emitU16(fRef);
        break;
      }
      break;
    }
    case "binary": {
      let promoteNumeric = function(a, b) {
        if (a === "double" || b === "double") return "double";
        if (a === "float" || b === "float") return "float";
        if (a === "long" || b === "long") return "long";
        return "int";
      }, promoteIntegral = function(a, b) {
        return a === "long" || b === "long" ? "long" : "int";
      };
      const leftType = inferType(ctx, expr.left);
      const rightType = inferType(ctx, expr.right);
      if (expr.op === "+" && (leftType === "String" || rightType === "String")) {
        compileStringConcat(ctx, emitter, expr);
        break;
      }
      if (expr.op === "&&") {
        if (!(leftType === "boolean" && rightType === "boolean")) {
          throw new Error("Operator '&&' requires boolean operands");
        }
        compileExpr(ctx, emitter, expr.left);
        const patchFalse = emitter.emitBranch(153);
        compileExpr(ctx, emitter, expr.right);
        const patchEnd = emitter.emitBranch(167);
        emitter.patchBranch(patchFalse, emitter.pc);
        emitter.emitIconst(0);
        emitter.patchBranch(patchEnd, emitter.pc);
        break;
      }
      if (expr.op === "||") {
        if (!(leftType === "boolean" && rightType === "boolean")) {
          throw new Error("Operator '||' requires boolean operands");
        }
        compileExpr(ctx, emitter, expr.left);
        const patchEvalRight = emitter.emitBranch(153);
        emitter.emitIconst(1);
        const patchEnd = emitter.emitBranch(167);
        emitter.patchBranch(patchEvalRight, emitter.pc);
        compileExpr(ctx, emitter, expr.right);
        emitter.patchBranch(patchEnd, emitter.pc);
        break;
      }
      if (["&", "|", "^"].includes(expr.op) && leftType === "boolean" && rightType === "boolean") {
        compileExpr(ctx, emitter, expr.left);
        compileExpr(ctx, emitter, expr.right);
        if (expr.op === "&") emitter.emit(126);
        else if (expr.op === "|") emitter.emit(128);
        else emitter.emit(130);
        break;
      }
      if (["+", "-", "*", "/", "%"].includes(expr.op)) {
        if (!isPrimitiveType(leftType) || !isPrimitiveType(rightType) || leftType === "boolean" || rightType === "boolean") {
          throw new Error(`Operator '${expr.op}' requires numeric operands`);
        }
      }
      if (["&", "|", "^"].includes(expr.op)) {
        if (!isIntegralType(leftType) || !isIntegralType(rightType)) {
          throw new Error(`Operator '${expr.op}' requires integral operands`);
        }
      }
      if (["<<", ">>", ">>>"].includes(expr.op)) {
        if (!isIntegralType(leftType) || !isIntegralType(rightType)) {
          throw new Error(`Operator '${expr.op}' requires integral operands`);
        }
      }
      if (["<", ">", "<=", ">="].includes(expr.op)) {
        if (!isPrimitiveType(leftType) || !isPrimitiveType(rightType) || leftType === "boolean" || rightType === "boolean") {
          throw new Error(`Operator '${expr.op}' requires numeric operands`);
        }
      }
      if (expr.op === "==" || expr.op === "!=") {
        const leftRef = isRefType(leftType);
        const rightRef = isRefType(rightType);
        if (leftRef !== rightRef) {
          throw new Error(`Operator '${expr.op}' requires operands of compatible categories`);
        }
        if (!leftRef && !rightRef && !sameType(leftType, rightType)) {
          if (leftType === "boolean" || rightType === "boolean") {
            throw new Error(`Operator '${expr.op}' requires operands of the same primitive type`);
          }
        }
      }
      const promoted = (expr.op === "==" || expr.op === "!=") && (isRefType(leftType) || isRefType(rightType)) ? leftType : ["&", "|", "^"].includes(expr.op) ? promoteIntegral(leftType, rightType) : promoteNumeric(leftType, rightType);
      if (["<<", ">>", ">>>"].includes(expr.op)) {
        const promotedLeft = leftType === "long" ? "long" : "int";
        compileExpr(ctx, emitter, expr.left);
        emitWideningConversion(emitter, leftType, promotedLeft);
        compileExpr(ctx, emitter, expr.right);
        emitWideningConversion(emitter, rightType, "int");
        emitNarrowingConversion(emitter, rightType, "int");
        if (promotedLeft === "long") {
          if (expr.op === "<<") emitter.emit(121);
          else if (expr.op === ">>") emitter.emit(123);
          else emitter.emit(125);
        } else {
          if (expr.op === "<<") emitter.emit(120);
          else if (expr.op === ">>") emitter.emit(122);
          else emitter.emit(124);
        }
        break;
      }
      compileExpr(ctx, emitter, expr.left);
      if (!isRefType(leftType)) emitWideningConversion(emitter, leftType, promoted);
      compileExpr(ctx, emitter, expr.right);
      if (!isRefType(rightType)) emitWideningConversion(emitter, rightType, promoted);
      if (promoted === "double") {
        switch (expr.op) {
          case "+":
            emitter.emit(99);
            break;
          // dadd
          case "-":
            emitter.emit(103);
            break;
          // dsub
          case "*":
            emitter.emit(107);
            break;
          // dmul
          case "/":
            emitter.emit(111);
            break;
          // ddiv
          case "%":
            emitter.emit(115);
            break;
          // drem
          case "==":
          case "!=":
          case "<":
          case ">":
          case "<=":
          case ">=": {
            emitter.emitPush(151);
            const jumpOp = { "==": 154, "!=": 153, "<": 156, ">": 158, "<=": 157, ">=": 155 }[expr.op];
            const patchFalse = emitter.emitBranch(jumpOp);
            emitter.emitIconst(1);
            const patchEnd = emitter.emitBranch(167);
            emitter.patchBranch(patchFalse, emitter.pc);
            emitter.emitIconst(0);
            emitter.patchBranch(patchEnd, emitter.pc);
            break;
          }
          default:
            throw new Error(`Unsupported binary operator: ${expr.op}`);
        }
      } else if (promoted === "float") {
        switch (expr.op) {
          case "+":
            emitter.emit(98);
            break;
          // fadd
          case "-":
            emitter.emit(102);
            break;
          // fsub
          case "*":
            emitter.emit(106);
            break;
          // fmul
          case "/":
            emitter.emit(110);
            break;
          // fdiv
          case "%":
            emitter.emit(114);
            break;
          // frem
          case "==":
          case "!=":
          case "<":
          case ">":
          case "<=":
          case ">=": {
            emitter.emitPush(149);
            const jumpOp = { "==": 154, "!=": 153, "<": 156, ">": 158, "<=": 157, ">=": 155 }[expr.op];
            const patchFalse = emitter.emitBranch(jumpOp);
            emitter.emitIconst(1);
            const patchEnd = emitter.emitBranch(167);
            emitter.patchBranch(patchFalse, emitter.pc);
            emitter.emitIconst(0);
            emitter.patchBranch(patchEnd, emitter.pc);
            break;
          }
          default:
            throw new Error(`Unsupported binary operator: ${expr.op}`);
        }
      } else if (promoted === "long") {
        switch (expr.op) {
          case "+":
            emitter.emit(97);
            break;
          // ladd
          case "-":
            emitter.emit(101);
            break;
          // lsub
          case "*":
            emitter.emit(105);
            break;
          // lmul
          case "/":
            emitter.emit(109);
            break;
          // ldiv
          case "%":
            emitter.emit(113);
            break;
          // lrem
          case "&":
            emitter.emit(127);
            break;
          // land
          case "|":
            emitter.emit(129);
            break;
          // lor
          case "^":
            emitter.emit(131);
            break;
          // lxor
          case "==":
          case "!=":
          case "<":
          case ">":
          case "<=":
          case ">=": {
            emitter.emitPush(148);
            const jumpOp = { "==": 154, "!=": 153, "<": 156, ">": 158, "<=": 157, ">=": 155 }[expr.op];
            const patchFalse = emitter.emitBranch(jumpOp);
            emitter.emitIconst(1);
            const patchEnd = emitter.emitBranch(167);
            emitter.patchBranch(patchFalse, emitter.pc);
            emitter.emitIconst(0);
            emitter.patchBranch(patchEnd, emitter.pc);
            break;
          }
          default:
            throw new Error(`Unsupported binary operator: ${expr.op}`);
        }
      } else {
        switch (expr.op) {
          case "+":
            emitter.emit(96);
            break;
          // iadd
          case "-":
            emitter.emit(100);
            break;
          // isub
          case "*":
            emitter.emit(104);
            break;
          // imul
          case "/":
            emitter.emit(108);
            break;
          // idiv
          case "%":
            emitter.emit(112);
            break;
          // irem
          case "&":
            emitter.emit(126);
            break;
          // iand
          case "|":
            emitter.emit(128);
            break;
          // ior
          case "^":
            emitter.emit(130);
            break;
          // ixor
          case "==":
          case "!=":
          case "<":
          case ">":
          case "<=":
          case ">=": {
            const refCompare = (expr.op === "==" || expr.op === "!=") && (isRefType(leftType) || isRefType(rightType));
            const jumpOp = refCompare ? expr.op === "==" ? 166 : 165 : { "==": 160, "!=": 159, "<": 162, ">": 164, "<=": 163, ">=": 161 }[expr.op];
            const patchFalse = emitter.emitBranch(jumpOp);
            emitter.emitIconst(1);
            const patchEnd = emitter.emitBranch(167);
            emitter.patchBranch(patchFalse, emitter.pc);
            emitter.emitIconst(0);
            emitter.patchBranch(patchEnd, emitter.pc);
            break;
          }
          default:
            throw new Error(`Unsupported binary operator: ${expr.op}`);
        }
      }
      break;
    }
    case "unary": {
      const operandType = inferType(ctx, expr.operand);
      compileExpr(ctx, emitter, expr.operand);
      if (expr.op === "-") {
        if (operandType === "double") emitter.emit(119);
        else if (operandType === "float") emitter.emit(118);
        else if (operandType === "long") emitter.emit(117);
        else if (isPrimitiveType(operandType) && operandType !== "boolean") emitter.emit(116);
        else throw new Error("Unary '-' requires numeric operand");
      }
      if (expr.op === "!") {
        if (operandType !== "boolean") throw new Error("Unary '!' requires boolean operand");
        emitter.emitIconst(1);
        emitter.emit(130);
      }
      if (expr.op === "~") {
        if (!isIntegralType(operandType)) throw new Error("Unary '~' requires integral operand");
        if (operandType === "long") {
          emitter.emitLconst(-1, ctx.cp);
          emitter.emit(131);
        } else {
          emitter.emitIconst(-1) || (() => {
            const cpIdx = ctx.cp.addInteger(-1);
            emitter.emitLdc(cpIdx);
          })();
          emitter.emit(130);
        }
      }
      break;
    }
    case "newExpr": {
      const internalName = resolveClassName(ctx, expr.className);
      const classIdx = ctx.cp.addClass(internalName);
      emitter.emit(187);
      emitter.emitU16(classIdx);
      emitter.emit(89);
      const resolvedCtor = resolveMethodCandidate(ctx, internalName, "<init>", expr.args, false);
      let desc;
      if (resolvedCtor) {
        expr.args.forEach((arg, i) => compileExpr(ctx, emitter, arg, resolvedCtor.paramTypes[i] ?? { className: "java/lang/Object" }));
        const sigArgDescs = resolvedCtor.paramTypes.map(typeToDescriptor).join("");
        desc = "(" + sigArgDescs + ")V";
      } else {
        const argTypes = expr.args.map((a) => typeToDescriptor(inferType(ctx, a)));
        for (const arg of expr.args) compileExpr(ctx, emitter, arg);
        desc = "(" + argTypes.join("") + ")V";
      }
      const mRef = ctx.cp.addMethodref(internalName, "<init>", desc);
      emitter.emitInvokespecial(mRef, expr.args.length, false);
      break;
    }
    case "call": {
      compileCall(ctx, emitter, expr);
      break;
    }
    case "staticCall": {
      const internalName = resolveClassName(ctx, expr.className);
      const resolved = resolveMethodCandidate(ctx, internalName, expr.method, expr.args, true);
      if (resolved) {
        expr.args.forEach((arg, i) => compileExpr(ctx, emitter, arg, resolved.paramTypes[i] ?? { className: "java/lang/Object" }));
        const sigArgDescs = resolved.paramTypes.map(typeToDescriptor).join("");
        const desc = "(" + sigArgDescs + ")" + typeToDescriptor(resolved.returnType);
        const mRef = ctx.cp.addMethodref(internalName, expr.method, desc);
        emitter.emitInvokestatic(mRef, expr.args.length, resolved.returnType !== "void");
      } else {
        const argTypes = expr.args.map((a) => typeToDescriptor(inferType(ctx, a)));
        for (const arg of expr.args) compileExpr(ctx, emitter, arg);
        const retType = inferType(ctx, expr);
        const desc = "(" + argTypes.join("") + ")" + typeToDescriptor(retType);
        const mRef = ctx.cp.addMethodref(internalName, expr.method, desc);
        emitter.emitInvokestatic(mRef, expr.args.length, retType !== "void");
      }
      break;
    }
    case "fieldAccess": {
      compileFieldAccess(ctx, emitter, expr);
      break;
    }
    case "postIncrement": {
      if (expr.operand.kind === "ident") {
        const loc = findLocal(ctx, expr.operand.name);
        if (loc && (loc.type === "int" || loc.type === "boolean")) {
          emitter.emitIload(loc.slot);
          emitter.emit(132);
          emitter.emit(loc.slot);
          emitter.emit(expr.op === "++" ? 1 : 255);
          break;
        }
      }
      compileExpr(ctx, emitter, expr.operand);
      break;
    }
    case "preIncrement": {
      if (expr.operand.kind === "ident") {
        const loc = findLocal(ctx, expr.operand.name);
        if (loc && (loc.type === "int" || loc.type === "boolean")) {
          emitter.emit(132);
          emitter.emit(loc.slot);
          emitter.emit(expr.op === "++" ? 1 : 255);
          emitter.emitIload(loc.slot);
          break;
        }
      }
      compileExpr(ctx, emitter, expr.operand);
      break;
    }
    case "cast": {
      const srcType = inferType(ctx, expr.expr);
      if (!isCastConvertible(expr.type, srcType)) {
        throw new Error(`Invalid cast from ${typeToDescriptor(srcType)} to ${typeToDescriptor(expr.type)}`);
      }
      compileExpr(ctx, emitter, expr.expr);
      if (isPrimitiveType(expr.type) && isRefType(srcType)) {
        const info = UNBOX_INFO[expr.type];
        if (info) {
          const classIdx = ctx.cp.addClass(info.wrapper);
          emitter.emit(192);
          emitter.emitU16(classIdx);
          const methodRef = ctx.cp.addMethodref(info.wrapper, info.method, info.desc);
          emitter.emit(182);
          emitter.emitU16(methodRef);
        }
      } else if (isRefType(expr.type) && isPrimitiveType(srcType)) {
        const info = BOX_INFO[srcType];
        if (info) {
          const methodRef = ctx.cp.addMethodref(info.wrapper, "valueOf", info.desc);
          emitter.emit(184);
          emitter.emitU16(methodRef);
        }
      } else if (isRefType(expr.type)) {
        const castClass = typeof expr.type === "object" && "className" in expr.type ? resolveClassName(ctx, expr.type.className) : "java/lang/Object";
        const classIdx = ctx.cp.addClass(castClass);
        emitter.emit(192);
        emitter.emitU16(classIdx);
      } else if (isPrimitiveType(expr.type) && isPrimitiveType(srcType)) {
        emitWideningConversion(emitter, srcType, expr.type);
        emitNarrowingConversion(emitter, srcType, expr.type);
      }
      break;
    }
    case "instanceof": {
      compileExpr(ctx, emitter, expr.expr);
      const checkClass = resolveClassName(ctx, expr.checkType);
      const classIdx = ctx.cp.addClass(checkClass);
      emitter.emit(193);
      emitter.emitU16(classIdx);
      break;
    }
    case "staticField": {
      const ownerClass = resolveClassName(ctx, expr.className);
      if (ownerClass === "java/lang/System" && expr.field === "out") {
        const fieldRef = ctx.cp.addFieldref("java/lang/System", "out", "Ljava/io/PrintStream;");
        emitter.emit(178);
        emitter.emitU16(fieldRef);
      } else {
        const fieldRef = ctx.cp.addFieldref(ownerClass, expr.field, "Ljava/lang/Object;");
        emitter.emit(178);
        emitter.emitU16(fieldRef);
      }
      break;
    }
    case "newArray": {
      compileExpr(ctx, emitter, expr.size);
      if (expr.elemType === "int" || expr.elemType === "boolean") {
        emitter.emit(188);
        emitter.emit(expr.elemType === "int" ? 10 : 4);
      } else {
        const internalName = typeof expr.elemType === "object" && "className" in expr.elemType ? expr.elemType.className : "java/lang/Object";
        const classIdx = ctx.cp.addClass(internalName);
        emitter.emit(189);
        emitter.emitU16(classIdx);
      }
      break;
    }
    case "arrayLit": {
      emitter.emitIconst(expr.elements.length) || (() => {
        const cpIdx = ctx.cp.addInteger(expr.elements.length);
        emitter.emitLdc(cpIdx);
      })();
      if (expr.elemType === "int" || expr.elemType === "boolean") {
        emitter.emit(188);
        emitter.emit(10);
      } else {
        const internalName = typeof expr.elemType === "object" && "className" in expr.elemType ? expr.elemType.className : "java/lang/Object";
        const classIdx = ctx.cp.addClass(internalName);
        emitter.emit(189);
        emitter.emitU16(classIdx);
      }
      for (let i = 0; i < expr.elements.length; i++) {
        emitter.emit(89);
        emitter.emitIconst(i) || (() => {
          const ci = ctx.cp.addInteger(i);
          emitter.emitLdc(ci);
        })();
        compileExpr(ctx, emitter, expr.elements[i]);
        if (expr.elemType === "int" || expr.elemType === "boolean") {
          emitter.emit(79);
        } else {
          emitter.emit(83);
        }
      }
      break;
    }
    case "arrayAccess": {
      compileExpr(ctx, emitter, expr.array);
      compileExpr(ctx, emitter, expr.index);
      const elemType = inferType(ctx, expr);
      if (elemType === "int" || elemType === "boolean") {
        emitter.emit(46);
      } else {
        emitter.emit(50);
      }
      break;
    }
    case "superCall": {
      emitter.emitAload(0);
      const argTypes = expr.args.map((a) => typeToDescriptor(inferType(ctx, a)));
      for (const arg of expr.args) compileExpr(ctx, emitter, arg);
      const desc = "(" + argTypes.join("") + ")V";
      const mRef = ctx.cp.addMethodref(ctx.superClass, "<init>", desc);
      emitter.emitInvokespecial(mRef, expr.args.length, false);
      break;
    }
    case "ternary": {
      if (inferType(ctx, expr.cond) !== "boolean") {
        throw new Error("Ternary condition must be boolean");
      }
      const thenType = inferType(ctx, expr.thenExpr);
      const elseType = inferType(ctx, expr.elseExpr);
      const refCompatible = isRefType(thenType) && isRefType(elseType);
      if (!refCompatible && !isAssignableInContext(ctx, thenType, elseType) && !isAssignableInContext(ctx, elseType, thenType)) {
        throw new Error("Ternary branches must have compatible types");
      }
      compileExpr(ctx, emitter, expr.cond);
      const patchElse = emitter.emitBranch(153);
      compileExpr(ctx, emitter, expr.thenExpr);
      const patchEnd = emitter.emitBranch(167);
      emitter.patchBranch(patchElse, emitter.pc);
      compileExpr(ctx, emitter, expr.elseExpr);
      emitter.patchBranch(patchEnd, emitter.pc);
      break;
    }
    case "switchExpr": {
      compileSwitchExpr(ctx, emitter, expr, expectedType);
      break;
    }
    case "lambda": {
      if (!expectedType) {
        throw new Error("Lambda expression requires target type context");
      }
      const { ifaceName, sig } = functionalSigForType(ctx, expectedType);
      if (expr.params.length !== sig.params.length) {
        throw new Error(`Lambda parameter count mismatch: expected ${sig.params.length}, got ${expr.params.length}`);
      }
      const used = /* @__PURE__ */ new Set();
      if (expr.bodyExpr) collectExprIdentifiers(expr.bodyExpr, used);
      if (expr.bodyStmts) for (const s of expr.bodyStmts) collectStmtIdentifiers(s, used);
      const paramSet = new Set(expr.params);
      const captures = ctx.locals.filter((l) => used.has(l.name) && !paramSet.has(l.name));
      const assignedInLambda = /* @__PURE__ */ new Set();
      if (expr.bodyStmts) for (const s of expr.bodyStmts) collectAssignedInStmt(s, assignedInLambda);
      if (expr.bodyExpr) collectAssignedInExpr(expr.bodyExpr, assignedInLambda);
      for (const cap of captures) {
        if (assignedInLambda.has(cap.name)) {
          throw new Error(`Variable '${cap.name}' must be effectively final when captured by a lambda`);
        }
      }
      const needsThisCapture = !ctx.ownerIsStatic;
      const lambdaId = ctx.lambdaCounter.value++;
      const implName = `lambda$${ctx.method.name}$${lambdaId}`;
      const captureParams = captures.map((c) => ({ name: c.name, type: c.type }));
      const lambdaParams = expr.params.map((p, i) => ({ name: p, type: sig.params[i] }));
      const implParams = [...captureParams, ...lambdaParams];
      const implBody = expr.bodyExpr ? [{ kind: "return", value: expr.bodyExpr }] : expr.bodyStmts ?? [];
      const implMethod = {
        name: implName,
        returnType: sig.returnType,
        params: implParams,
        body: implBody,
        isStatic: !needsThisCapture
      };
      ctx.generatedMethods.push(implMethod);
      const implDesc = methodDescriptor(implParams, sig.returnType);
      const capturedTypes = [
        ...needsThisCapture ? [{ className: ctx.className }] : [],
        ...captures.map((c) => c.type)
      ];
      for (const cap of captures) {
        if (cap.type === "void") throw new Error("Unsupported capture type: void");
      }
      for (let i = 0; i < capturedTypes.length; i++) {
        compileExpr(ctx, emitter, needsThisCapture && i === 0 ? { kind: "this" } : { kind: "ident", name: captures[needsThisCapture ? i - 1 : i].name });
      }
      const invokedDesc = "(" + capturedTypes.map(typeToDescriptor).join("") + ")" + typeToDescriptor(expectedType);
      const samDescriptor = "(" + sig.params.map(typeToDescriptor).join("") + ")" + typeToDescriptor(sig.returnType);
      ctx.lambdaBootstraps.push({
        samDescriptor,
        implOwner: ctx.className,
        implMethodName: implName,
        implDescriptor: implDesc,
        invokedName: sig.samMethod,
        invokedDescriptor: invokedDesc,
        implRefKind: needsThisCapture ? 5 : 6
      });
      const bootstrapIdx = ctx.lambdaBootstraps.length - 1;
      const indyIdx = ctx.cp.addInvokeDynamic(bootstrapIdx, sig.samMethod, invokedDesc);
      emitter.emitInvokedynamic(indyIdx, capturedTypes.length, true);
      break;
    }
    case "methodRef": {
      if (!expectedType) throw new Error("Method reference requires target type context");
      const { sig } = functionalSigForType(ctx, expectedType);
      let implOwner = "";
      let implName = expr.method;
      let implDescriptor = "";
      let implRefKind = 6;
      let implIsInterface = false;
      let captureTypes = [];
      const isClassRef = expr.target.kind === "ident" && !findLocal(ctx, expr.target.name) && (/^[A-Z]/.test(expr.target.name) || ctx.importMap.has(expr.target.name) || resolveClassName(ctx, expr.target.name) !== expr.target.name);
      if (expr.isConstructor) {
        if (!(expr.target.kind === "ident" && isClassRef)) {
          throw new Error("Constructor method reference target must be a class name");
        }
        const targetClass = resolveClassName(ctx, expr.target.name);
        const ctorId = ctx.lambdaCounter.value++;
        const ctorImplName = `lambda$ctor$${ctorId}`;
        const ctorParams = sig.params.map((p, i) => ({ name: `p${i}`, type: p }));
        const ctorResolved = resolveMethodCandidateByTypes(
          ctx,
          targetClass,
          "<init>",
          ctorParams.map((p) => p.type),
          false
        );
        const ctorTypes = ctorResolved?.paramTypes ?? ctorParams.map((p) => p.type);
        const ctorArgs = ctorParams.map((p, i) => {
          const need = ctorTypes[i];
          if (need && !sameType(need, p.type)) {
            return { kind: "cast", type: need, expr: { kind: "ident", name: p.name } };
          }
          return { kind: "ident", name: p.name };
        });
        const ctorMethod = {
          name: ctorImplName,
          returnType: sig.returnType,
          params: ctorParams,
          body: [{ kind: "return", value: { kind: "newExpr", className: targetClass, args: ctorArgs } }],
          isStatic: true
        };
        ctx.generatedMethods.push(ctorMethod);
        const implDescCtor = methodDescriptor(ctorMethod.params, ctorMethod.returnType);
        const invokedDescriptorCtor = "()" + typeToDescriptor(expectedType);
        const samDescriptorCtor = "(" + sig.params.map(typeToDescriptor).join("") + ")" + typeToDescriptor(sig.returnType);
        ctx.lambdaBootstraps.push({
          samDescriptor: samDescriptorCtor,
          implOwner: ctx.className,
          implMethodName: ctorImplName,
          implDescriptor: implDescCtor,
          invokedName: sig.samMethod,
          invokedDescriptor: invokedDescriptorCtor,
          implRefKind: 6
        });
        const bootstrapIdx2 = ctx.lambdaBootstraps.length - 1;
        const indyIdx2 = ctx.cp.addInvokeDynamic(bootstrapIdx2, sig.samMethod, invokedDescriptorCtor);
        emitter.emitInvokedynamic(indyIdx2, 0, true);
        break;
      }
      if (isClassRef && expr.target.kind === "ident") {
        implOwner = resolveClassName(ctx, expr.target.name);
        const staticResolved = resolveMethodCandidateByTypes(ctx, implOwner, expr.method, sig.params, true);
        if (staticResolved) {
          implDescriptor = "(" + staticResolved.paramTypes.map(typeToDescriptor).join("") + ")" + typeToDescriptor(staticResolved.returnType);
          implRefKind = 6;
          implIsInterface = staticResolved.isInterface;
        } else {
          const instResolved = resolveMethodCandidateByTypes(
            ctx,
            implOwner,
            expr.method,
            sig.params.slice(1),
            false
          );
          if (instResolved) {
            implDescriptor = "(" + instResolved.paramTypes.map(typeToDescriptor).join("") + ")" + typeToDescriptor(instResolved.returnType);
            implRefKind = instResolved.isInterface ? 9 : 5;
            implIsInterface = instResolved.isInterface;
          } else if (implOwner === ctx.className) {
            const staticUser = ctx.allMethods.find((m) => m.name === expr.method && m.isStatic && m.params.length === sig.params.length);
            if (staticUser) {
              implDescriptor = methodDescriptor(staticUser.params, staticUser.returnType);
              implRefKind = 6;
            } else {
              const instUser = ctx.allMethods.find((m) => m.name === expr.method && !m.isStatic && m.params.length === Math.max(0, sig.params.length - 1));
              if (!instUser) throw new Error(`Cannot resolve method reference ${implOwner}::${expr.method}`);
              implDescriptor = methodDescriptor(instUser.params, instUser.returnType);
              implRefKind = 5;
            }
          } else {
            throw new Error(`Cannot resolve method reference ${implOwner}::${expr.method}`);
          }
        }
      } else {
        const t = inferType(ctx, expr.target);
        implOwner = t === "String" ? "java/lang/String" : typeof t === "object" && "className" in t ? resolveClassName(ctx, t.className) : "java/lang/Object";
        captureTypes = [t === "String" ? "String" : t];
        compileExpr(ctx, emitter, expr.target);
        const boundResolved = resolveMethodCandidateByTypes(ctx, implOwner, expr.method, sig.params, false);
        if (boundResolved) {
          implDescriptor = "(" + boundResolved.paramTypes.map(typeToDescriptor).join("") + ")" + typeToDescriptor(boundResolved.returnType);
          implRefKind = boundResolved.isInterface ? 9 : 5;
          implIsInterface = boundResolved.isInterface;
        } else if (implOwner === ctx.className) {
          const m = ctx.allMethods.find((mm) => mm.name === expr.method && !mm.isStatic && mm.params.length === sig.params.length);
          if (!m) throw new Error(`Cannot resolve method reference target::${expr.method}`);
          implDescriptor = methodDescriptor(m.params, m.returnType);
          implRefKind = 5;
        } else {
          throw new Error(`Cannot resolve method reference target::${expr.method}`);
        }
      }
      const invokedDescriptor = "(" + captureTypes.map(typeToDescriptor).join("") + ")" + typeToDescriptor(expectedType);
      const samDescriptor = "(" + sig.params.map(typeToDescriptor).join("") + ")" + typeToDescriptor(sig.returnType);
      ctx.lambdaBootstraps.push({
        samDescriptor,
        implOwner,
        implMethodName: implName,
        implDescriptor,
        implIsInterface,
        invokedName: sig.samMethod,
        invokedDescriptor,
        implRefKind
      });
      const bootstrapIdx = ctx.lambdaBootstraps.length - 1;
      const indyIdx = ctx.cp.addInvokeDynamic(bootstrapIdx, sig.samMethod, invokedDescriptor);
      emitter.emitInvokedynamic(indyIdx, captureTypes.length, true);
      break;
    }
    case "classLit": {
      const className = resolveClassName(ctx, expr.className);
      const classIdx = ctx.cp.addClass(className);
      emitter.emitLdc(classIdx);
      break;
    }
    default:
      throw new Error(`Unsupported expression: ${expr.kind}`);
  }
  if (expectedType && isRefType(expectedType)) {
    const actualType = inferType(ctx, expr);
    if (isPrimitiveType(actualType)) {
      const info = BOX_INFO[actualType];
      if (info) {
        const mRef = ctx.cp.addMethodref(info.wrapper, "valueOf", info.desc);
        emitter.emit(184);
        emitter.emitU16(mRef);
      }
    }
  }
}
function compileStringConcat(ctx, emitter, expr) {
  const parts = [];
  function flatten(e) {
    if (e.kind === "binary" && e.op === "+") {
      const lt = inferType(ctx, e.left);
      const rt = inferType(ctx, e.right);
      if (lt === "String" || rt === "String") {
        flatten(e.left);
        flatten(e.right);
        return;
      }
    }
    parts.push(e);
  }
  flatten(expr);
  const sbClass = ctx.cp.addClass("java/lang/StringBuilder");
  emitter.emit(187);
  emitter.emitU16(sbClass);
  emitter.emit(89);
  const initRef = ctx.cp.addMethodref("java/lang/StringBuilder", "<init>", "()V");
  emitter.emitInvokespecial(initRef, 0, false);
  for (const part of parts) {
    const partType = inferType(ctx, part);
    compileExpr(ctx, emitter, part);
    let appendDesc;
    if (partType === "int" || partType === "short" || partType === "byte") {
      appendDesc = "(I)Ljava/lang/StringBuilder;";
    } else if (partType === "long") {
      appendDesc = "(J)Ljava/lang/StringBuilder;";
    } else if (partType === "float") {
      appendDesc = "(F)Ljava/lang/StringBuilder;";
    } else if (partType === "double") {
      appendDesc = "(D)Ljava/lang/StringBuilder;";
    } else if (partType === "char") {
      appendDesc = "(C)Ljava/lang/StringBuilder;";
    } else if (partType === "boolean") {
      appendDesc = "(Z)Ljava/lang/StringBuilder;";
    } else if (partType === "String") {
      appendDesc = "(Ljava/lang/String;)Ljava/lang/StringBuilder;";
    } else {
      appendDesc = "(Ljava/lang/Object;)Ljava/lang/StringBuilder;";
    }
    const appendRef = ctx.cp.addMethodref("java/lang/StringBuilder", "append", appendDesc);
    emitter.emitInvokevirtual(appendRef, 1, true);
  }
  const toStringRef = ctx.cp.addMethodref("java/lang/StringBuilder", "toString", "()Ljava/lang/String;");
  emitter.emitInvokevirtual(toStringRef, 0, true);
}
function compileCall(ctx, emitter, expr) {
  if (expr.object?.kind === "fieldAccess" && expr.object.object.kind === "ident" && expr.object.object.name === "System" && expr.object.field === "out") {
    const fieldRef = ctx.cp.addFieldref("java/lang/System", "out", "Ljava/io/PrintStream;");
    emitter.emit(178);
    emitter.emitU16(fieldRef);
    const argType = expr.args.length > 0 ? inferType(ctx, expr.args[0]) : "void";
    for (const arg of expr.args) compileExpr(ctx, emitter, arg);
    let desc;
    if (argType === "int" || argType === "short" || argType === "byte") desc = "(I)V";
    else if (argType === "long") desc = "(J)V";
    else if (argType === "float") desc = "(F)V";
    else if (argType === "double") desc = "(D)V";
    else if (argType === "char") desc = "(C)V";
    else if (argType === "boolean") desc = "(Z)V";
    else if (argType === "String") desc = "(Ljava/lang/String;)V";
    else desc = "(Ljava/lang/Object;)V";
    const mRef = ctx.cp.addMethodref("java/io/PrintStream", expr.method, desc);
    emitter.emitInvokevirtual(mRef, expr.args.length, false);
    return;
  }
  if (expr.object) {
    const objType = inferType(ctx, expr.object);
    if (expr.object.kind === "ident") {
      const name = expr.object.name;
      if ((/^[A-Z]/.test(name) || ctx.importMap.has(name)) && !findLocal(ctx, name)) {
        const internalName = resolveClassName(ctx, name);
        const resolved2 = resolveMethodCandidate(ctx, internalName, expr.method, expr.args, true);
        if (resolved2) {
          expr.args.forEach((arg, i) => compileExpr(ctx, emitter, arg, resolved2.paramTypes[i] ?? { className: "java/lang/Object" }));
          const sigArgDescs = resolved2.paramTypes.map((t) => typeToDescriptor(t)).join("");
          const desc2 = "(" + sigArgDescs + ")" + typeToDescriptor(resolved2.returnType);
          const mRef = ctx.cp.addMethodref(internalName, expr.method, desc2);
          emitter.emitInvokestatic(mRef, expr.args.length, resolved2.returnType !== "void");
        } else {
          const argTypes2 = expr.args.map((a) => typeToDescriptor(inferType(ctx, a)));
          for (const arg of expr.args) compileExpr(ctx, emitter, arg);
          const userMethod = ctx.classDecls.get(internalName)?.methods.find((m) => m.name === expr.method && m.isStatic && m.params.length === expr.args.length);
          const retType2 = userMethod ? userMethod.returnType : { className: "java/lang/Object" };
          const desc2 = "(" + argTypes2.join("") + ")" + typeToDescriptor(retType2);
          const mRef = ctx.cp.addMethodref(internalName, expr.method, desc2);
          emitter.emitInvokestatic(mRef, expr.args.length, retType2 !== "void");
        }
        return;
      }
    }
    compileExpr(ctx, emitter, expr.object);
    const argTypes = expr.args.map((a) => typeToDescriptor(inferType(ctx, a)));
    const rawOwner = objType === "String" ? "java/lang/String" : typeof objType === "object" && "className" in objType ? objType.className : "java/lang/Object";
    const ownerClass = resolveClassName(ctx, rawOwner);
    const resolved = resolveMethodCandidate(ctx, ownerClass, expr.method, expr.args, false);
    let desc;
    let retType;
    let isInterface = false;
    if (resolved) {
      expr.args.forEach((arg, i) => compileExpr(ctx, emitter, arg, resolved.paramTypes[i] ?? { className: "java/lang/Object" }));
      retType = resolved.returnType;
      const sigArgDescs = resolved.paramTypes.map((t) => typeToDescriptor(t)).join("");
      desc = "(" + sigArgDescs + ")" + typeToDescriptor(retType);
      isInterface = resolved.isInterface;
    } else {
      const userMethod = ctx.classDecls.get(ownerClass)?.methods.find((m) => m.name === expr.method && !m.isStatic && m.params.length === expr.args.length);
      if (userMethod) {
        expr.args.forEach((arg, i) => compileExpr(ctx, emitter, arg, userMethod.params[i]?.type));
      } else {
        for (const arg of expr.args) compileExpr(ctx, emitter, arg);
      }
      retType = userMethod ? userMethod.returnType : { className: "java/lang/Object" };
      desc = "(" + argTypes.join("") + ")" + typeToDescriptor(retType);
    }
    if (isInterface) {
      const mRef = ctx.cp.addInterfaceMethodref(ownerClass, expr.method, desc);
      emitter.emitInvokeinterface(mRef, expr.args.length, retType !== "void");
    } else {
      const mRef = ctx.cp.addMethodref(ownerClass, expr.method, desc);
      emitter.emitInvokevirtual(mRef, expr.args.length, retType !== "void");
    }
  } else {
    const resolved = resolveUnqualifiedMethodCandidate(ctx, expr.method, expr.args);
    if (resolved) {
      const desc = "(" + resolved.paramTypes.map(typeToDescriptor).join("") + ")" + typeToDescriptor(resolved.returnType);
      if (resolved.isStatic) {
        const mRef = ctx.cp.addMethodref(resolved.owner, expr.method, desc);
        expr.args.forEach((arg, i) => compileExpr(ctx, emitter, arg, resolved.paramTypes[i] ?? { className: "java/lang/Object" }));
        emitter.emitInvokestatic(mRef, expr.args.length, resolved.returnType !== "void");
      } else {
        if (ctx.ownerIsStatic) {
          throw new Error(`Cannot call instance method '${expr.method}' from static context`);
        }
        emitter.emitAload(0);
        expr.args.forEach((arg, i) => compileExpr(ctx, emitter, arg, resolved.paramTypes[i] ?? { className: "java/lang/Object" }));
        if (resolved.isInterface) {
          const mRef = ctx.cp.addInterfaceMethodref(resolved.owner, expr.method, desc);
          emitter.emitInvokeinterface(mRef, expr.args.length, resolved.returnType !== "void");
        } else {
          const mRef = ctx.cp.addMethodref(resolved.owner, expr.method, desc);
          emitter.emitInvokevirtual(mRef, expr.args.length, resolved.returnType !== "void");
        }
      }
    } else if (ctx.staticWildcardImports.length > 0) {
      let ownerClass = ctx.staticWildcardImports[0];
      let resolved2;
      for (const owner of ctx.staticWildcardImports) {
        const candidate = resolveMethodCandidate(ctx, owner, expr.method, expr.args, true);
        if (candidate) {
          ownerClass = owner;
          resolved2 = candidate;
          break;
        }
      }
      const argTypes = expr.args.map((a) => typeToDescriptor(inferType(ctx, a)));
      if (resolved2) {
        expr.args.forEach((arg, i) => compileExpr(ctx, emitter, arg, resolved2.paramTypes[i] ?? { className: "java/lang/Object" }));
      } else {
        for (const arg of expr.args) compileExpr(ctx, emitter, arg);
      }
      const retType = resolved2?.returnType ?? { className: "java/lang/Object" };
      const sigArgDescs = resolved2 ? resolved2.paramTypes.map((t) => typeToDescriptor(t)).join("") : argTypes.join("");
      const desc = "(" + sigArgDescs + ")" + typeToDescriptor(retType);
      const mRef = ctx.cp.addMethodref(ownerClass, expr.method, desc);
      emitter.emitInvokestatic(mRef, expr.args.length, retType !== "void");
    } else {
      throw new Error(`Cannot resolve unqualified method call: ${expr.method}/${expr.args.length}`);
    }
  }
}
function compileFieldAccess(ctx, emitter, expr) {
  if (expr.object.kind === "ident") {
    const name = expr.object.name;
    const resolved = resolveClassName(ctx, name);
    const isLocal = !!findLocal(ctx, name);
    const isClassRef = !isLocal && (/^[A-Z]/.test(name) || ctx.importMap.has(name) || resolved !== name);
    if (isClassRef) {
      let desc = "Ljava/lang/Object;";
      if (resolved === "java/lang/System" && expr.field === "out") desc = "Ljava/io/PrintStream;";
      const fieldRef2 = ctx.cp.addFieldref(resolved, expr.field, desc);
      emitter.emit(178);
      emitter.emitU16(fieldRef2);
      return;
    }
  }
  if (expr.object.kind === "fieldAccess") {
    let collapseChain = function(e) {
      if (e.kind === "fieldAccess") {
        const inner = collapseChain(e.object);
        if (inner) return { className: inner.className + "/" + inner.field, field: e.field };
      }
      if (e.kind === "ident") return { className: e.name, field: "" };
      return null;
    };
    const chain = collapseChain(expr.object);
    if (chain) {
      const ownerClass2 = (chain.field ? chain.className + "/" + chain.field : chain.className).replace(/\./g, "/");
      let desc = "Ljava/lang/Object;";
      if (ownerClass2 === "java/lang/System" && expr.field === "out") desc = "Ljava/io/PrintStream;";
      const fieldRef2 = ctx.cp.addFieldref(ownerClass2, expr.field, desc);
      emitter.emit(178);
      emitter.emitU16(fieldRef2);
      return;
    }
  }
  if (expr.field === "length") {
    const objType2 = inferType(ctx, expr.object);
    if (typeof objType2 === "object" && "array" in objType2) {
      compileExpr(ctx, emitter, expr.object);
      emitter.emit(190);
      return;
    }
  }
  compileExpr(ctx, emitter, expr.object);
  const objType = inferType(ctx, expr.object);
  const ownerClass = typeof objType === "object" && "className" in objType ? objType.className : ctx.className;
  const fld = ctx.fieldMap.get(expr.field);
  const fieldType = fld ? typeToDescriptor(fld.type) : "Ljava/lang/Object;";
  const fieldRef = ctx.cp.addFieldref(ownerClass, expr.field, fieldType);
  emitter.emit(180);
  emitter.emitU16(fieldRef);
}
function withScopedLocals(ctx, fn) {
  const savedLen = ctx.locals.length;
  const savedNext = ctx.nextSlot;
  fn();
  ctx.locals.length = savedLen;
  ctx.nextSlot = savedNext;
}
function getExitActions(ctx) {
  const anyCtx = ctx;
  if (!anyCtx.__exitActions) anyCtx.__exitActions = [];
  return anyCtx.__exitActions;
}
function emitPendingExitActions(ctx, emitter, minDepth = 0) {
  const actions = getExitActions(ctx);
  for (let i = actions.length - 1; i >= minDepth; i--) {
    const action = actions[i];
    if (action.kind === "monitor") {
      emitter.emitAload(action.slot);
      emitter.emitPop(195);
    } else {
      withScopedLocals(ctx, () => {
        for (const s of action.body) compileStmt(ctx, emitter, s);
      });
    }
  }
}
function ensureAssignable(ctx, target, value, reason) {
  if (!isAssignableInContext(ctx, target, value)) {
    throw new Error(`Type mismatch for ${reason}: cannot assign ${typeToDescriptor(value)} to ${typeToDescriptor(target)}`);
  }
}
function collectExprIdentifiers(expr, out) {
  switch (expr.kind) {
    case "ident":
      out.add(expr.name);
      break;
    case "binary":
      collectExprIdentifiers(expr.left, out);
      collectExprIdentifiers(expr.right, out);
      break;
    case "unary":
      collectExprIdentifiers(expr.operand, out);
      break;
    case "call":
      if (expr.object) collectExprIdentifiers(expr.object, out);
      for (const a of expr.args) collectExprIdentifiers(a, out);
      break;
    case "staticCall":
      for (const a of expr.args) collectExprIdentifiers(a, out);
      break;
    case "fieldAccess":
      collectExprIdentifiers(expr.object, out);
      break;
    case "newExpr":
      for (const a of expr.args) collectExprIdentifiers(a, out);
      break;
    case "cast":
      collectExprIdentifiers(expr.expr, out);
      break;
    case "postIncrement":
      collectExprIdentifiers(expr.operand, out);
      break;
    case "preIncrement":
      collectExprIdentifiers(expr.operand, out);
      break;
    case "instanceof":
      collectExprIdentifiers(expr.expr, out);
      break;
    case "arrayAccess":
      collectExprIdentifiers(expr.array, out);
      collectExprIdentifiers(expr.index, out);
      break;
    case "arrayLit":
      for (const e of expr.elements) collectExprIdentifiers(e, out);
      break;
    case "newArray":
      collectExprIdentifiers(expr.size, out);
      break;
    case "superCall":
      for (const a of expr.args) collectExprIdentifiers(a, out);
      break;
    case "ternary":
      collectExprIdentifiers(expr.cond, out);
      collectExprIdentifiers(expr.thenExpr, out);
      collectExprIdentifiers(expr.elseExpr, out);
      break;
    case "switchExpr":
      collectExprIdentifiers(expr.selector, out);
      for (const c of expr.cases) {
        if (c.guard) collectExprIdentifiers(c.guard, out);
        if (c.expr) collectExprIdentifiers(c.expr, out);
        if (c.stmts) for (const s of c.stmts) collectStmtIdentifiers(s, out);
      }
      break;
    case "lambda":
      break;
    case "methodRef":
      collectExprIdentifiers(expr.target, out);
      break;
    case "classLit":
      break;
    default:
      break;
  }
}
function collectStmtIdentifiers(stmt, out) {
  switch (stmt.kind) {
    case "varDecl":
      if (stmt.init) collectExprIdentifiers(stmt.init, out);
      break;
    case "assign":
      collectExprIdentifiers(stmt.target, out);
      collectExprIdentifiers(stmt.value, out);
      break;
    case "compoundAssign":
      collectExprIdentifiers(stmt.target, out);
      collectExprIdentifiers(stmt.value, out);
      break;
    case "exprStmt":
      collectExprIdentifiers(stmt.expr, out);
      break;
    case "return":
      if (stmt.value) collectExprIdentifiers(stmt.value, out);
      break;
    case "yield":
      collectExprIdentifiers(stmt.value, out);
      break;
    case "if":
      collectExprIdentifiers(stmt.cond, out);
      for (const s of stmt.then) collectStmtIdentifiers(s, out);
      if (stmt.else_) for (const s of stmt.else_) collectStmtIdentifiers(s, out);
      break;
    case "while":
      collectExprIdentifiers(stmt.cond, out);
      for (const s of stmt.body) collectStmtIdentifiers(s, out);
      break;
    case "for":
      if (stmt.init) collectStmtIdentifiers(stmt.init, out);
      if (stmt.cond) collectExprIdentifiers(stmt.cond, out);
      if (stmt.update) collectStmtIdentifiers(stmt.update, out);
      for (const s of stmt.body) collectStmtIdentifiers(s, out);
      break;
    case "switch":
      collectExprIdentifiers(stmt.selector, out);
      for (const c of stmt.cases) {
        if (c.guard) collectExprIdentifiers(c.guard, out);
        if (c.expr) collectExprIdentifiers(c.expr, out);
        if (c.stmts) for (const s of c.stmts) collectStmtIdentifiers(s, out);
      }
      break;
    case "doWhile":
      collectExprIdentifiers(stmt.cond, out);
      for (const s of stmt.body) collectStmtIdentifiers(s, out);
      break;
    case "forEach":
      collectExprIdentifiers(stmt.iterable, out);
      for (const s of stmt.body) collectStmtIdentifiers(s, out);
      break;
    case "assert":
      collectExprIdentifiers(stmt.cond, out);
      if (stmt.message) collectExprIdentifiers(stmt.message, out);
      break;
    case "synchronized":
      collectExprIdentifiers(stmt.monitor, out);
      for (const s of stmt.body) collectStmtIdentifiers(s, out);
      break;
    case "throw":
      collectExprIdentifiers(stmt.expr, out);
      break;
    case "tryCatch":
      for (const s of stmt.tryBody) collectStmtIdentifiers(s, out);
      for (const c of stmt.catches) for (const s of c.body) collectStmtIdentifiers(s, out);
      if (stmt.finallyBody) for (const s of stmt.finallyBody) collectStmtIdentifiers(s, out);
      break;
    case "break":
    case "continue":
      break;
    case "labeled":
      collectStmtIdentifiers(stmt.stmt, out);
      break;
    case "block":
      for (const s of stmt.stmts) collectStmtIdentifiers(s, out);
      break;
  }
}
function collectAssignedInStmt(stmt, out) {
  switch (stmt.kind) {
    case "assign":
      if (stmt.target.kind === "ident") out.add(stmt.target.name);
      collectAssignedInExpr(stmt.target, out);
      collectAssignedInExpr(stmt.value, out);
      break;
    case "compoundAssign":
      if (stmt.target.kind === "ident") out.add(stmt.target.name);
      collectAssignedInExpr(stmt.target, out);
      collectAssignedInExpr(stmt.value, out);
      break;
    case "exprStmt":
      collectAssignedInExpr(stmt.expr, out);
      break;
    case "if":
      collectAssignedInExpr(stmt.cond, out);
      for (const s of stmt.then) collectAssignedInStmt(s, out);
      if (stmt.else_) for (const s of stmt.else_) collectAssignedInStmt(s, out);
      break;
    case "for":
      if (stmt.init) collectAssignedInStmt(stmt.init, out);
      if (stmt.cond) collectAssignedInExpr(stmt.cond, out);
      if (stmt.update) collectAssignedInStmt(stmt.update, out);
      for (const s of stmt.body) collectAssignedInStmt(s, out);
      break;
    case "while":
    case "doWhile":
      collectAssignedInExpr(stmt.cond, out);
      for (const s of stmt.body) collectAssignedInStmt(s, out);
      break;
    case "forEach":
      collectAssignedInExpr(stmt.iterable, out);
      for (const s of stmt.body) collectAssignedInStmt(s, out);
      break;
    case "block":
      for (const s of stmt.stmts) collectAssignedInStmt(s, out);
      break;
    case "tryCatch":
      for (const s of stmt.tryBody) collectAssignedInStmt(s, out);
      for (const c of stmt.catches) for (const s of c.body) collectAssignedInStmt(s, out);
      if (stmt.finallyBody) for (const s of stmt.finallyBody) collectAssignedInStmt(s, out);
      break;
    case "switch":
      collectAssignedInExpr(stmt.selector, out);
      for (const c of stmt.cases) {
        if (c.guard) collectAssignedInExpr(c.guard, out);
        if (c.expr) collectAssignedInExpr(c.expr, out);
        if (c.stmts) for (const s of c.stmts) collectAssignedInStmt(s, out);
      }
      break;
    case "synchronized":
      collectAssignedInExpr(stmt.monitor, out);
      for (const s of stmt.body) collectAssignedInStmt(s, out);
      break;
    case "throw":
      collectAssignedInExpr(stmt.expr, out);
      break;
    case "assert":
      collectAssignedInExpr(stmt.cond, out);
      if (stmt.message) collectAssignedInExpr(stmt.message, out);
      break;
    case "labeled":
      collectAssignedInStmt(stmt.stmt, out);
      break;
    case "varDecl":
      if (stmt.init) collectAssignedInExpr(stmt.init, out);
      break;
    case "return":
      if (stmt.value) collectAssignedInExpr(stmt.value, out);
      break;
    case "yield":
      collectAssignedInExpr(stmt.value, out);
      break;
    default:
      break;
  }
}
function collectAssignedInExpr(expr, out) {
  switch (expr.kind) {
    case "postIncrement":
    case "preIncrement":
      if (expr.operand.kind === "ident") out.add(expr.operand.name);
      collectAssignedInExpr(expr.operand, out);
      break;
    case "binary":
      collectAssignedInExpr(expr.left, out);
      collectAssignedInExpr(expr.right, out);
      break;
    case "unary":
      collectAssignedInExpr(expr.operand, out);
      break;
    case "call":
      if (expr.object) collectAssignedInExpr(expr.object, out);
      for (const a of expr.args) collectAssignedInExpr(a, out);
      break;
    case "staticCall":
      for (const a of expr.args) collectAssignedInExpr(a, out);
      break;
    case "newExpr":
      for (const a of expr.args) collectAssignedInExpr(a, out);
      break;
    case "fieldAccess":
      collectAssignedInExpr(expr.object, out);
      break;
    case "cast":
      collectAssignedInExpr(expr.expr, out);
      break;
    case "instanceof":
      collectAssignedInExpr(expr.expr, out);
      break;
    case "arrayAccess":
      collectAssignedInExpr(expr.array, out);
      collectAssignedInExpr(expr.index, out);
      break;
    case "arrayLit":
      for (const e of expr.elements) collectAssignedInExpr(e, out);
      break;
    case "newArray":
      collectAssignedInExpr(expr.size, out);
      break;
    case "ternary":
      collectAssignedInExpr(expr.cond, out);
      collectAssignedInExpr(expr.thenExpr, out);
      collectAssignedInExpr(expr.elseExpr, out);
      break;
    case "switchExpr":
      collectAssignedInExpr(expr.selector, out);
      for (const c of expr.cases) {
        if (c.guard) collectAssignedInExpr(c.guard, out);
        if (c.expr) collectAssignedInExpr(c.expr, out);
        if (c.stmts) for (const s of c.stmts) collectAssignedInStmt(s, out);
      }
      break;
    case "superCall":
      for (const a of expr.args) collectAssignedInExpr(a, out);
      break;
    case "methodRef":
      collectAssignedInExpr(expr.target, out);
      break;
    default:
      break;
  }
}
var OBJECT_PUBLIC_INSTANCE_METHODS2 = /* @__PURE__ */ new Set([
  "toString()",
  "hashCode()",
  "equals(Ljava/lang/Object;)",
  "getClass()",
  "notify()",
  "notifyAll()",
  "wait()",
  "wait(J)",
  "wait(JI)"
]);
function functionalSigForType(ctx, t) {
  if (!(typeof t === "object" && "className" in t)) {
    throw new Error("Lambda target type must be a functional interface");
  }
  const ifaceName = resolveClassName(ctx, t.className);
  const abstractMethods = /* @__PURE__ */ new Map();
  const visited = /* @__PURE__ */ new Set();
  const collectAbstractMethods = (current) => {
    if (visited.has(current)) return;
    visited.add(current);
    const decl = ctx.classDecls.get(current);
    if (!decl) return;
    for (const m of decl.methods) {
      if (m.name === "<init>") continue;
      if (m.isStatic) continue;
      if (!m.isAbstract) continue;
      const params = m.params.map((p) => p.type);
      const key = `${m.name}(${params.map(typeToDescriptor).join("")})`;
      if (OBJECT_PUBLIC_INSTANCE_METHODS2.has(key)) continue;
      if (!abstractMethods.has(key)) {
        abstractMethods.set(key, { samMethod: m.name, params, returnType: m.returnType });
      }
    }
    for (const parent of decl.interfaces ?? []) {
      collectAbstractMethods(resolveClassName(ctx, parent));
    }
  };
  collectAbstractMethods(ifaceName);
  if (abstractMethods.size === 1) {
    return { ifaceName, sig: Array.from(abstractMethods.values())[0] };
  }
  const known = findKnownFunctionalInterface(ifaceName);
  if (known) return { ifaceName, sig: known };
  throw new Error(`Unsupported functional interface for lambda/method reference: ${ifaceName}`);
}
var BUILTIN_SUPERS = {
  "java/lang/String": "java/lang/Object",
  "java/lang/Integer": "java/lang/Object",
  "java/lang/StringBuilder": "java/lang/Object",
  "java/util/ArrayList": "java/lang/Object",
  "java/io/PrintStream": "java/lang/Object",
  "java/lang/Throwable": "java/lang/Object",
  "java/lang/Exception": "java/lang/Throwable",
  "java/lang/RuntimeException": "java/lang/Exception",
  "java/lang/Error": "java/lang/Throwable",
  "java/io/IOException": "java/lang/Exception"
};
function toInternalClassName(ctx, t) {
  if (t === "String") return "java/lang/String";
  if (typeof t === "object" && "className" in t) return resolveClassName(ctx, t.className);
  return void 0;
}
function isClassSupertype(ctx, maybeSuper, maybeSub) {
  if (maybeSuper === maybeSub) return true;
  let cur = maybeSub;
  const seen = /* @__PURE__ */ new Set();
  while (!seen.has(cur)) {
    seen.add(cur);
    const next = ctx.classSupers.get(cur) ?? BUILTIN_SUPERS[cur];
    if (!next) return false;
    if (next === maybeSuper) return true;
    cur = next;
  }
  return false;
}
function isPatternTotalForSelector(ctx, selectorType, patternTypeName) {
  const selectorClass = toInternalClassName(ctx, selectorType);
  if (!selectorClass) return false;
  const patternClass = resolveClassName(ctx, patternTypeName);
  return isClassSupertype(ctx, patternClass, selectorClass);
}
function validateSwitchSemanticsCompile(ctx, selectorType, cases, isExpr) {
  let seenTotalNonNullPattern = false;
  let seenNullCase = false;
  const unguardedPatterns = [];
  for (const c of cases) {
    const hasGuard = !!c.guard;
    for (const l of c.labels) {
      if (l.kind === "bool" && selectorType !== "boolean") {
        throw new Error("boolean case label requires boolean switch selector");
      }
      if (l.kind === "int" && selectorType !== "int") {
        throw new Error("int case label requires int switch selector");
      }
      if (l.kind === "null" && !isRefType(selectorType)) {
        throw new Error("null case label requires reference switch selector");
      }
      if (l.kind === "string" && !isRefType(selectorType)) {
        throw new Error("String case label requires reference switch selector");
      }
      if ((l.kind === "typePattern" || l.kind === "recordPattern") && !isRefType(selectorType)) {
        throw new Error("type pattern case requires reference switch selector");
      }
      if (l.kind === "null") {
        seenNullCase = true;
        if (seenTotalNonNullPattern) {
        }
      } else {
        if (seenTotalNonNullPattern) {
          throw new Error("switch label is dominated by previous total type pattern");
        }
      }
      if (l.kind === "typePattern" || l.kind === "recordPattern") {
        const pat = resolveClassName(ctx, l.typeName);
        if (!hasGuard) {
          for (const prev of unguardedPatterns) {
            if (isClassSupertype(ctx, prev, pat)) {
              throw new Error(`dominated switch label pattern: ${"typeName" in l ? l.typeName : pat}`);
            }
          }
          unguardedPatterns.push(pat);
          if (isPatternTotalForSelector(ctx, selectorType, "typeName" in l ? l.typeName : pat)) {
            seenTotalNonNullPattern = true;
          }
        }
      }
    }
    if (c.guard && inferType(ctx, c.guard) !== "boolean") {
      throw new Error("switch guard must be boolean");
    }
  }
  if (isExpr) {
    const hasUnguardedDefault = cases.some((c) => !c.guard && c.labels.some((l) => l.kind === "default"));
    if (hasUnguardedDefault) return;
    const hasTrue = cases.some((c) => !c.guard && c.labels.some((l) => l.kind === "bool" && l.value));
    const hasFalse = cases.some((c) => !c.guard && c.labels.some((l) => l.kind === "bool" && !l.value));
    const exhaustiveBoolean = selectorType === "boolean" && hasTrue && hasFalse;
    const exhaustiveRef = isRefType(selectorType) && seenNullCase && seenTotalNonNullPattern;
    if (!exhaustiveBoolean && !exhaustiveRef) {
      throw new Error("switch expression is not exhaustive: provide default or exhaustive labels");
    }
  }
}
function resolveClassDecl(ctx, typeName) {
  const internal = resolveClassName(ctx, typeName);
  return ctx.classDecls.get(internal) ?? ctx.classDecls.get(typeName);
}
function isIntLike(t) {
  return t === "int" || t === "short" || t === "byte" || t === "char" || t === "boolean";
}
function emitWideningConversion(emitter, from, to) {
  if (sameType(from, to)) return;
  if (isIntLike(from) && isIntLike(to)) return;
  if (isIntLike(from) && to === "long") {
    emitter.emit(133);
    return;
  }
  if (isIntLike(from) && to === "float") {
    emitter.emit(134);
    return;
  }
  if (isIntLike(from) && to === "double") {
    emitter.emit(135);
    return;
  }
  if (from === "long" && to === "float") {
    emitter.emit(137);
    return;
  }
  if (from === "long" && to === "double") {
    emitter.emit(138);
    return;
  }
  if (from === "float" && to === "double") {
    emitter.emit(141);
    return;
  }
}
function emitNarrowingConversion(emitter, from, to) {
  if (sameType(from, to)) return;
  if (isIntLike(from) && to === "byte") {
    emitter.emit(145);
    return;
  }
  if (isIntLike(from) && to === "char") {
    emitter.emit(146);
    return;
  }
  if (isIntLike(from) && to === "short") {
    emitter.emit(147);
    return;
  }
  if (from === "long" && isIntLike(to)) {
    emitter.emit(136);
    return;
  }
  if (from === "long" && to === "float") {
    emitter.emit(137);
    return;
  }
  if (from === "long" && to === "double") {
    emitter.emit(138);
    return;
  }
  if (from === "float" && isIntLike(to)) {
    emitter.emit(139);
    return;
  }
  if (from === "float" && to === "long") {
    emitter.emit(140);
    return;
  }
  if (from === "double" && isIntLike(to)) {
    emitter.emit(142);
    return;
  }
  if (from === "double" && to === "long") {
    emitter.emit(143);
    return;
  }
  if (from === "double" && to === "float") {
    emitter.emit(144);
    return;
  }
}
function emitStoreLocalByType(emitter, slot, t) {
  if (t === "long") emitter.emitLstore(slot);
  else if (t === "float") emitter.emitFstore(slot);
  else if (t === "double") emitter.emitDstore(slot);
  else if (t === "int" || t === "boolean" || t === "short" || t === "byte" || t === "char") emitter.emitIstore(slot);
  else emitter.emitAstore(slot);
}
function emitLoadLocalByType(emitter, slot, t) {
  if (t === "long") emitter.emitLload(slot);
  else if (t === "float") emitter.emitFload(slot);
  else if (t === "double") emitter.emitDload(slot);
  else if (t === "int" || t === "boolean" || t === "short" || t === "byte" || t === "char") emitter.emitIload(slot);
  else emitter.emitAload(slot);
}
function bindPatternLabelLocals(ctx, emitter, selectorSlot, selectorType, label) {
  if (label.kind !== "typePattern" && label.kind !== "recordPattern") {
    throw new Error("internal: expected pattern label");
  }
  emitLoadLocalByType(emitter, selectorSlot, selectorType);
  const checkClass = resolveClassName(ctx, label.typeName);
  const classIdx = ctx.cp.addClass(checkClass);
  emitter.emit(192);
  emitter.emitU16(classIdx);
  if (label.kind === "typePattern") {
    const slot = addLocal(ctx, label.bindVar, { className: checkClass });
    if (emitter.maxLocals <= slot) emitter.maxLocals = slot + 1;
    emitter.emitAstore(slot);
    return;
  }
  const recordDecl = resolveClassDecl(ctx, label.typeName);
  if (!recordDecl?.isRecord || !recordDecl.recordComponents) {
    throw new Error(`record pattern requires known record declaration: ${label.typeName}`);
  }
  if (recordDecl.recordComponents.length !== label.bindVars.length) {
    throw new Error(`record pattern arity mismatch for ${label.typeName}`);
  }
  const recSlot = addLocal(ctx, "$rec_pat", { className: checkClass }, true);
  if (emitter.maxLocals <= recSlot) emitter.maxLocals = recSlot + 1;
  emitter.emitAstore(recSlot);
  for (let i = 0; i < label.bindVars.length; i++) {
    const c = recordDecl.recordComponents[i];
    emitter.emitAload(recSlot);
    const mRef = ctx.cp.addMethodref(checkClass, c.name, "()" + typeToDescriptor(c.type));
    emitter.emitInvokevirtual(mRef, 0, true);
    const slot = addLocal(ctx, label.bindVars[i], c.type);
    if (emitter.maxLocals <= slot) emitter.maxLocals = slot + 1;
    emitStoreLocalByType(emitter, slot, c.type);
  }
}
function emitSwitchLabelMatch(ctx, emitter, selectorSlot, selectorType, label) {
  if (label.kind === "default") return emitter.emitBranch(167);
  if (label.kind === "bool") {
    if (selectorType !== "boolean") {
      throw new Error("boolean case label requires boolean switch selector");
    }
    emitter.emitIload(selectorSlot);
    emitter.emitIconst(label.value ? 1 : 0);
    return emitter.emitBranch(159);
  }
  if (label.kind === "int") {
    if (selectorType !== "int") {
      throw new Error("int case label requires int switch selector");
    }
    emitter.emitIload(selectorSlot);
    if (!emitter.emitIconst(label.value)) {
      emitter.emitLdc(ctx.cp.addInteger(label.value));
    }
    return emitter.emitBranch(159);
  }
  if (label.kind === "null") {
    if (!isRefType(selectorType)) throw new Error("null case label requires reference switch selector");
    emitter.emitAload(selectorSlot);
    return emitter.emitBranch(198);
  }
  if (label.kind === "string") {
    if (selectorType !== "String" && !(typeof selectorType === "object" && "className" in selectorType)) {
      throw new Error("String case label requires reference switch selector");
    }
    emitter.emitAload(selectorSlot);
    const patchNull = emitter.emitBranch(198);
    emitter.emitAload(selectorSlot);
    emitter.emitLdc(ctx.cp.addString(label.value));
    const equalsRef = ctx.cp.addMethodref("java/lang/String", "equals", "(Ljava/lang/Object;)Z");
    emitter.emitInvokevirtual(equalsRef, 1, true);
    const patchMatch = emitter.emitBranch(154);
    emitter.patchBranch(patchNull, emitter.pc);
    return patchMatch;
  }
  if (!isRefType(selectorType)) throw new Error("type pattern case requires reference switch selector");
  emitter.emitAload(selectorSlot);
  const checkClass = resolveClassName(ctx, label.typeName);
  const classIdx = ctx.cp.addClass(checkClass);
  emitter.emit(193);
  emitter.emitU16(classIdx);
  return emitter.emitBranch(154);
}
function compileSwitchCaseStmts(ctx, emitter, c) {
  if (c.expr) {
    compileExpr(ctx, emitter, c.expr);
    emitter.emit(87);
    return;
  }
  for (const s of c.stmts ?? []) compileStmt(ctx, emitter, s);
}
function compileSwitchStmt(ctx, emitter, stmt) {
  withScopedLocals(ctx, () => {
    const selectorType = inferType(ctx, stmt.selector);
    validateSwitchSemanticsCompile(ctx, selectorType, stmt.cases, false);
    const selectorSlot = addLocal(ctx, "$switch_sel", selectorType, true);
    if (emitter.maxLocals <= selectorSlot) emitter.maxLocals = selectorSlot + 1;
    if (selectorType === "int" || selectorType === "boolean") {
      compileExpr(ctx, emitter, stmt.selector, selectorType);
      emitter.emitIstore(selectorSlot);
    } else {
      compileExpr(ctx, emitter, stmt.selector, selectorType);
      emitter.emitAstore(selectorSlot);
    }
    const endPatches = [];
    for (const c of stmt.cases) {
      const matches = c.labels.map((l) => ({ label: l, patch: emitSwitchLabelMatch(ctx, emitter, selectorSlot, selectorType, l) }));
      const patchNext = emitter.emitBranch(167);
      const bodyStart = emitter.pc;
      for (const m of matches) emitter.patchBranch(m.patch, bodyStart);
      withScopedLocals(ctx, () => {
        const patternLabel = c.labels.find((l) => l.kind === "typePattern" || l.kind === "recordPattern");
        if (patternLabel) {
          bindPatternLabelLocals(ctx, emitter, selectorSlot, selectorType, patternLabel);
        }
        if (c.guard) {
          if (inferType(ctx, c.guard) !== "boolean") {
            throw new Error("switch guard must be boolean");
          }
          compileExpr(ctx, emitter, c.guard, "boolean");
          const guardFail = emitter.emitBranch(153);
          compileSwitchCaseStmts(ctx, emitter, c);
          endPatches.push(emitter.emitBranch(167));
          emitter.patchBranch(guardFail, emitter.pc);
        } else {
          compileSwitchCaseStmts(ctx, emitter, c);
          endPatches.push(emitter.emitBranch(167));
        }
      });
      emitter.patchBranch(patchNext, emitter.pc);
    }
    for (const p of endPatches) emitter.patchBranch(p, emitter.pc);
  });
}
function compileSwitchExpr(ctx, emitter, expr, expectedType) {
  const resultType = expectedType ?? inferType(ctx, expr);
  withScopedLocals(ctx, () => {
    const selectorType = inferType(ctx, expr.selector);
    validateSwitchSemanticsCompile(ctx, selectorType, expr.cases, true);
    const selectorSlot = addLocal(ctx, "$switch_expr_sel", selectorType, true);
    if (emitter.maxLocals <= selectorSlot) emitter.maxLocals = selectorSlot + 1;
    if (selectorType === "int" || selectorType === "boolean") {
      compileExpr(ctx, emitter, expr.selector, selectorType);
      emitter.emitIstore(selectorSlot);
    } else {
      compileExpr(ctx, emitter, expr.selector, selectorType);
      emitter.emitAstore(selectorSlot);
    }
    const endPatches = [];
    for (const c of expr.cases) {
      const matches = c.labels.map((l) => ({ label: l, patch: emitSwitchLabelMatch(ctx, emitter, selectorSlot, selectorType, l) }));
      const patchNext = emitter.emitBranch(167);
      const bodyStart = emitter.pc;
      for (const m of matches) emitter.patchBranch(m.patch, bodyStart);
      withScopedLocals(ctx, () => {
        const patternLabel = c.labels.find((l) => l.kind === "typePattern" || l.kind === "recordPattern");
        if (patternLabel) {
          bindPatternLabelLocals(ctx, emitter, selectorSlot, selectorType, patternLabel);
        }
        if (c.guard) {
          if (inferType(ctx, c.guard) !== "boolean") {
            throw new Error("switch guard must be boolean");
          }
          compileExpr(ctx, emitter, c.guard, "boolean");
          const guardFail = emitter.emitBranch(153);
          if (c.expr) {
            compileExpr(ctx, emitter, c.expr, resultType);
            endPatches.push(emitter.emitBranch(167));
          } else {
            let yielded = false;
            for (const s of c.stmts ?? []) {
              if (s.kind === "yield") {
                compileExpr(ctx, emitter, s.value, resultType);
                endPatches.push(emitter.emitBranch(167));
                yielded = true;
                break;
              }
              compileStmt(ctx, emitter, s);
            }
            if (!yielded) throw new Error("switch expression block must yield a value");
          }
          emitter.patchBranch(guardFail, emitter.pc);
        } else if (c.expr) {
          compileExpr(ctx, emitter, c.expr, resultType);
          endPatches.push(emitter.emitBranch(167));
        } else {
          let yielded = false;
          for (const s of c.stmts ?? []) {
            if (s.kind === "yield") {
              compileExpr(ctx, emitter, s.value, resultType);
              endPatches.push(emitter.emitBranch(167));
              yielded = true;
              break;
            }
            compileStmt(ctx, emitter, s);
          }
          if (!yielded) throw new Error("switch expression block must yield a value");
        }
      });
      emitter.patchBranch(patchNext, emitter.pc);
    }
    if (endPatches.length === 0) throw new Error("switch expression has no producible branch");
    for (const p of endPatches) emitter.patchBranch(p, emitter.pc);
  });
}
function compileStmt(ctx, emitter, stmt) {
  switch (stmt.kind) {
    case "varDecl": {
      let declType = stmt.type;
      if (stmt.init) {
        const initType = inferType(ctx, stmt.init);
        const isObjectFallback = typeof declType === "object" && "className" in declType && declType.className === "java/lang/Object";
        const isMoreSpecific = typeof initType === "object" && "className" in initType && initType.className !== "java/lang/Object";
        if (isObjectFallback && isMoreSpecific) {
          declType = initType;
        }
      }
      const slot = addLocal(ctx, stmt.name, declType);
      if (emitter.maxLocals <= slot) emitter.maxLocals = slot + 1;
      if (stmt.init) {
        let init = stmt.init;
        if (init.kind === "arrayLit" && typeof declType === "object" && "array" in declType) {
          init = { ...init, elemType: declType.array };
        }
        const initType = inferType(ctx, init);
        ensureAssignable(ctx, declType, initType, `local '${stmt.name}'`);
        compileExpr(ctx, emitter, init, declType);
        emitWideningConversion(emitter, initType, declType);
        emitStoreLocalByType(emitter, slot, declType);
      }
      break;
    }
    case "assign": {
      if (stmt.target.kind === "ident") {
        const loc = findLocal(ctx, stmt.target.name);
        if (loc) {
          const valType = inferType(ctx, stmt.value);
          ensureAssignable(ctx, loc.type, valType, `local '${stmt.target.name}'`);
          compileExpr(ctx, emitter, stmt.value, loc.type);
          emitWideningConversion(emitter, valType, loc.type);
          emitStoreLocalByType(emitter, loc.slot, loc.type);
        } else {
          const field = ctx.fieldMap.get(stmt.target.name);
          if (field) {
            ensureAssignable(ctx, field.type, inferType(ctx, stmt.value), `field '${stmt.target.name}'`);
            if (field.isStatic) {
              compileExpr(ctx, emitter, stmt.value, field.type);
              const fRef = ctx.cp.addFieldref(ctx.className, field.name, typeToDescriptor(field.type));
              emitter.emit(179);
              emitter.emitU16(fRef);
            } else {
              emitter.emitAload(0);
              compileExpr(ctx, emitter, stmt.value, field.type);
              const fRef = ctx.cp.addFieldref(ctx.className, field.name, typeToDescriptor(field.type));
              emitter.emit(181);
              emitter.emitU16(fRef);
            }
          }
        }
      } else if (stmt.target.kind === "fieldAccess") {
        compileExpr(ctx, emitter, stmt.target.object);
        const targetType = inferType(ctx, stmt.target);
        ensureAssignable(ctx, targetType, inferType(ctx, stmt.value), `field '${stmt.target.field}'`);
        compileExpr(ctx, emitter, stmt.value, targetType);
        const objType = inferType(ctx, stmt.target.object);
        const ownerClass = typeof objType === "object" && "className" in objType ? objType.className : ctx.className;
        const fld = ctx.fieldMap.get(stmt.target.field);
        const fieldType = fld ? typeToDescriptor(fld.type) : typeToDescriptor(inferType(ctx, stmt.value));
        const fieldRef = ctx.cp.addFieldref(ownerClass, stmt.target.field, fieldType);
        emitter.emit(181);
        emitter.emitU16(fieldRef);
      } else if (stmt.target.kind === "arrayAccess") {
        compileExpr(ctx, emitter, stmt.target.array);
        compileExpr(ctx, emitter, stmt.target.index);
        const elemType = inferType(ctx, stmt.target);
        compileExpr(ctx, emitter, stmt.value, elemType);
        if (elemType === "int" || elemType === "boolean") {
          emitter.emit(79);
        } else {
          emitter.emit(83);
        }
      }
      break;
    }
    case "compoundAssign": {
      const tempName = (p) => `${p}${ctx.nextSlot}`;
      const emitBinaryIntoTarget = (leftExpr, targetType, targetLabel) => {
        const binaryExpr = { kind: "binary", op: stmt.op, left: leftExpr, right: stmt.value };
        const resultType = inferType(ctx, binaryExpr);
        ensureAssignable(ctx, targetType, resultType, targetLabel);
        compileExpr(ctx, emitter, binaryExpr, targetType);
        emitWideningConversion(emitter, resultType, targetType);
        emitNarrowingConversion(emitter, resultType, targetType);
        return resultType;
      };
      if (stmt.target.kind === "ident") {
        const loc = findLocal(ctx, stmt.target.name);
        if (loc) {
          emitBinaryIntoTarget({ kind: "ident", name: stmt.target.name }, loc.type, `local '${stmt.target.name}'`);
          emitStoreLocalByType(emitter, loc.slot, loc.type);
        } else {
          const field = ctx.fieldMap.get(stmt.target.name);
          if (field) {
            emitBinaryIntoTarget({ kind: "ident", name: stmt.target.name }, field.type, `field '${stmt.target.name}'`);
            if (field.isStatic) {
              const fRef = ctx.cp.addFieldref(ctx.className, field.name, typeToDescriptor(field.type));
              emitter.emit(179);
              emitter.emitU16(fRef);
            } else {
              const resultSlot = addLocal(ctx, tempName("$ca_res_"), field.type, true);
              if (emitter.maxLocals <= resultSlot) emitter.maxLocals = resultSlot + 1;
              emitStoreLocalByType(emitter, resultSlot, field.type);
              emitter.emitAload(0);
              emitLoadLocalByType(emitter, resultSlot, field.type);
              const fRef = ctx.cp.addFieldref(ctx.className, field.name, typeToDescriptor(field.type));
              emitter.emit(181);
              emitter.emitU16(fRef);
            }
          } else {
            throw new Error(`compound assignment target not found: '${stmt.target.name}'`);
          }
        }
      } else if (stmt.target.kind === "fieldAccess") {
        const targetType = inferType(ctx, stmt.target);
        const objType = inferType(ctx, stmt.target.object);
        const ownerClass = typeof objType === "object" && "className" in objType ? objType.className : ctx.className;
        const fieldRef = ctx.cp.addFieldref(ownerClass, stmt.target.field, typeToDescriptor(targetType));
        compileExpr(ctx, emitter, stmt.target.object);
        const objSlot = addLocal(ctx, tempName("$ca_obj_"), objType, true);
        if (emitter.maxLocals <= objSlot) emitter.maxLocals = objSlot + 1;
        emitter.emitAstore(objSlot);
        emitter.emitAload(objSlot);
        emitter.emit(180);
        emitter.emitU16(fieldRef);
        const leftName = tempName("$ca_left_");
        const leftSlot = addLocal(ctx, leftName, targetType, true);
        if (emitter.maxLocals <= leftSlot) emitter.maxLocals = leftSlot + 1;
        emitStoreLocalByType(emitter, leftSlot, targetType);
        emitBinaryIntoTarget({ kind: "ident", name: leftName }, targetType, `field '${stmt.target.field}'`);
        const resSlot = addLocal(ctx, tempName("$ca_res_"), targetType, true);
        if (emitter.maxLocals <= resSlot) emitter.maxLocals = resSlot + 1;
        emitStoreLocalByType(emitter, resSlot, targetType);
        emitter.emitAload(objSlot);
        emitLoadLocalByType(emitter, resSlot, targetType);
        emitter.emit(181);
        emitter.emitU16(fieldRef);
      } else if (stmt.target.kind === "arrayAccess") {
        const elemType = inferType(ctx, stmt.target);
        const arrType = inferType(ctx, stmt.target.array);
        const indexType = inferType(ctx, stmt.target.index);
        const emitArrayLoad = (t) => {
          if (t === "int") emitter.emit(46);
          else if (t === "long") emitter.emit(47);
          else if (t === "float") emitter.emit(48);
          else if (t === "double") emitter.emit(49);
          else if (t === "byte" || t === "boolean") emitter.emit(51);
          else if (t === "char") emitter.emit(52);
          else if (t === "short") emitter.emit(53);
          else emitter.emit(50);
        };
        const emitArrayStore = (t) => {
          if (t === "int") emitter.emit(79);
          else if (t === "long") emitter.emit(80);
          else if (t === "float") emitter.emit(81);
          else if (t === "double") emitter.emit(82);
          else if (t === "byte" || t === "boolean") emitter.emit(84);
          else if (t === "char") emitter.emit(85);
          else if (t === "short") emitter.emit(86);
          else emitter.emit(83);
        };
        compileExpr(ctx, emitter, stmt.target.array);
        const arrSlot = addLocal(ctx, tempName("$ca_arr_"), arrType, true);
        if (emitter.maxLocals <= arrSlot) emitter.maxLocals = arrSlot + 1;
        emitter.emitAstore(arrSlot);
        compileExpr(ctx, emitter, stmt.target.index, "int");
        if (indexType === "long") {
          emitter.emit(136);
        } else if (!(indexType === "int" || indexType === "byte" || indexType === "short" || indexType === "char")) {
          throw new Error(`Invalid array index type in compound assignment: ${String(indexType)}`);
        }
        const idxSlot = addLocal(ctx, tempName("$ca_idx_"), "int", true);
        if (emitter.maxLocals <= idxSlot) emitter.maxLocals = idxSlot + 1;
        emitter.emitIstore(idxSlot);
        emitter.emitAload(arrSlot);
        emitter.emitIload(idxSlot);
        emitArrayLoad(elemType);
        emitter.adjustStackForArrayLoad();
        const leftName = tempName("$ca_left_");
        const leftSlot = addLocal(ctx, leftName, elemType, true);
        if (emitter.maxLocals <= leftSlot) emitter.maxLocals = leftSlot + 1;
        emitStoreLocalByType(emitter, leftSlot, elemType);
        emitBinaryIntoTarget({ kind: "ident", name: leftName }, elemType, "array element");
        const resSlot = addLocal(ctx, tempName("$ca_res_"), elemType, true);
        if (emitter.maxLocals <= resSlot) emitter.maxLocals = resSlot + 1;
        emitStoreLocalByType(emitter, resSlot, elemType);
        emitter.emitAload(arrSlot);
        emitter.emitIload(idxSlot);
        emitLoadLocalByType(emitter, resSlot, elemType);
        emitArrayStore(elemType);
      } else {
        throw new Error(`Unsupported compound assignment target of kind '${stmt.target.kind}'`);
      }
      break;
    }
    case "exprStmt": {
      if (stmt.expr.kind === "postIncrement" || stmt.expr.kind === "preIncrement") {
        const op = stmt.expr.op === "++" ? "+" : "-";
        compileStmt(ctx, emitter, {
          kind: "compoundAssign",
          target: stmt.expr.operand,
          op,
          value: { kind: "intLit", value: 1 }
        });
        break;
      }
      compileExpr(ctx, emitter, stmt.expr);
      const exprType = inferType(ctx, stmt.expr);
      if (exprType !== "void") {
        emitter.emit(87);
      }
      break;
    }
    case "return": {
      if (stmt.value) {
        const retValType = inferType(ctx, stmt.value);
        const returnNeedsBoxing = isRefType(ctx.method.returnType) && isPrimitiveType(retValType);
        if (!returnNeedsBoxing) {
          ensureAssignable(ctx, ctx.method.returnType, retValType, `return in ${ctx.method.name}`);
        }
        compileExpr(ctx, emitter, stmt.value, ctx.method.returnType);
        if (returnNeedsBoxing) {
          const info = BOX_INFO[retValType];
          if (!info) {
            throw new Error(`Type mismatch for return in ${ctx.method.name}: cannot assign ${typeToDescriptor(retValType)} to ${typeToDescriptor(ctx.method.returnType)}`);
          }
          const methodRef = ctx.cp.addMethodref(info.wrapper, "valueOf", info.desc);
          emitter.emit(184);
          emitter.emitU16(methodRef);
        }
        emitWideningConversion(emitter, retValType, ctx.method.returnType);
      }
      emitPendingExitActions(ctx, emitter);
      emitter.emitReturn(ctx.method.returnType);
      break;
    }
    case "yield": {
      throw new Error("yield statement is only allowed in switch expressions");
    }
    case "if": {
      if (inferType(ctx, stmt.cond) !== "boolean") throw new Error("if condition must be boolean");
      compileExpr(ctx, emitter, stmt.cond);
      const patchElse = emitter.emitBranch(153);
      withScopedLocals(ctx, () => {
        if (stmt.cond.kind === "instanceof" && (stmt.cond.bindVar || stmt.cond.recordBindVars)) {
          const checkClass = resolveClassName(ctx, stmt.cond.checkType);
          compileExpr(ctx, emitter, stmt.cond.expr);
          const classIdx = ctx.cp.addClass(checkClass);
          emitter.emit(192);
          emitter.emitU16(classIdx);
          if (stmt.cond.bindVar) {
            const slot = addLocal(ctx, stmt.cond.bindVar, { className: checkClass });
            if (emitter.maxLocals <= slot) emitter.maxLocals = slot + 1;
            emitter.emitAstore(slot);
          } else {
            const recordDecl = resolveClassDecl(ctx, stmt.cond.checkType);
            if (!recordDecl?.isRecord || !recordDecl.recordComponents) {
              throw new Error(`record pattern requires known record declaration: ${stmt.cond.checkType}`);
            }
            const bindVars = stmt.cond.recordBindVars ?? [];
            if (bindVars.length !== recordDecl.recordComponents.length) {
              throw new Error(`record pattern arity mismatch for ${stmt.cond.checkType}`);
            }
            const recSlot = addLocal(ctx, "$if_rec_pat", { className: checkClass }, true);
            if (emitter.maxLocals <= recSlot) emitter.maxLocals = recSlot + 1;
            emitter.emitAstore(recSlot);
            for (let i = 0; i < bindVars.length; i++) {
              const c = recordDecl.recordComponents[i];
              emitter.emitAload(recSlot);
              const mRef = ctx.cp.addMethodref(checkClass, c.name, "()" + typeToDescriptor(c.type));
              emitter.emitInvokevirtual(mRef, 0, true);
              const slot = addLocal(ctx, bindVars[i], c.type);
              if (emitter.maxLocals <= slot) emitter.maxLocals = slot + 1;
              emitStoreLocalByType(emitter, slot, c.type);
            }
          }
        }
        for (const s of stmt.then) compileStmt(ctx, emitter, s);
      });
      if (stmt.else_) {
        const patchEnd = emitter.emitBranch(167);
        emitter.patchBranch(patchElse, emitter.pc);
        withScopedLocals(ctx, () => {
          for (const s of stmt.else_) compileStmt(ctx, emitter, s);
        });
        emitter.patchBranch(patchEnd, emitter.pc);
      } else {
        emitter.patchBranch(patchElse, emitter.pc);
      }
      break;
    }
    case "while": {
      if (inferType(ctx, stmt.cond) !== "boolean") throw new Error("while condition must be boolean");
      const breakInfo = { label: void 0, patches: [], exitDepth: getExitActions(ctx).length };
      const continueInfo = { label: void 0, targets: [], exitDepth: getExitActions(ctx).length };
      ctx.breakPatches.push(breakInfo);
      ctx.continuePatches.push(continueInfo);
      const loopStart = emitter.pc;
      compileExpr(ctx, emitter, stmt.cond);
      const patchExit = emitter.emitBranch(153);
      withScopedLocals(ctx, () => {
        for (const s of stmt.body) compileStmt(ctx, emitter, s);
      });
      const continueTarget = emitter.pc;
      const gotoOp = emitter.emitBranch(167);
      emitter.patchBranch(gotoOp, loopStart);
      emitter.patchBranch(patchExit, emitter.pc);
      ctx.breakPatches.pop();
      ctx.continuePatches.pop();
      for (const p of breakInfo.patches) emitter.patchBranch(p, emitter.pc);
      for (const p of continueInfo.targets) emitter.patchBranch(p, continueTarget);
      break;
    }
    case "for": {
      withScopedLocals(ctx, () => {
        if (stmt.init) compileStmt(ctx, emitter, stmt.init);
        const breakInfo = { label: void 0, patches: [], exitDepth: getExitActions(ctx).length };
        const continueInfo = { label: void 0, targets: [], exitDepth: getExitActions(ctx).length };
        ctx.breakPatches.push(breakInfo);
        ctx.continuePatches.push(continueInfo);
        const loopStart = emitter.pc;
        let patchExit = -1;
        if (stmt.cond) {
          if (inferType(ctx, stmt.cond) !== "boolean") throw new Error("for condition must be boolean");
          compileExpr(ctx, emitter, stmt.cond);
          patchExit = emitter.emitBranch(153);
        }
        withScopedLocals(ctx, () => {
          for (const s of stmt.body) compileStmt(ctx, emitter, s);
        });
        const continueTarget = emitter.pc;
        if (stmt.update) compileStmt(ctx, emitter, stmt.update);
        const gotoOp = emitter.emitBranch(167);
        emitter.patchBranch(gotoOp, loopStart);
        if (patchExit >= 0) emitter.patchBranch(patchExit, emitter.pc);
        ctx.breakPatches.pop();
        ctx.continuePatches.pop();
        for (const p of breakInfo.patches) emitter.patchBranch(p, emitter.pc);
        for (const p of continueInfo.targets) emitter.patchBranch(p, continueTarget);
      });
      break;
    }
    case "switch": {
      compileSwitchStmt(ctx, emitter, stmt);
      break;
    }
    case "doWhile": {
      if (inferType(ctx, stmt.cond) !== "boolean") throw new Error("do-while condition must be boolean");
      const breakInfo = { label: void 0, patches: [], exitDepth: getExitActions(ctx).length };
      const continueInfo = { label: void 0, targets: [], exitDepth: getExitActions(ctx).length };
      ctx.breakPatches.push(breakInfo);
      ctx.continuePatches.push(continueInfo);
      const loopStart = emitter.pc;
      withScopedLocals(ctx, () => {
        for (const s of stmt.body) compileStmt(ctx, emitter, s);
      });
      const continueTarget = emitter.pc;
      compileExpr(ctx, emitter, stmt.cond);
      const gotoOp = emitter.emitBranch(154);
      emitter.patchBranch(gotoOp, loopStart);
      ctx.breakPatches.pop();
      ctx.continuePatches.pop();
      for (const p of breakInfo.patches) emitter.patchBranch(p, emitter.pc);
      for (const p of continueInfo.targets) emitter.patchBranch(p, continueTarget);
      break;
    }
    case "forEach": {
      withScopedLocals(ctx, () => {
        const iterableType = inferType(ctx, stmt.iterable);
        const breakInfo = { label: void 0, patches: [], exitDepth: getExitActions(ctx).length };
        const continueInfo = { label: void 0, targets: [], exitDepth: getExitActions(ctx).length };
        ctx.breakPatches.push(breakInfo);
        ctx.continuePatches.push(continueInfo);
        if (typeof iterableType === "object" && "array" in iterableType) {
          compileExpr(ctx, emitter, stmt.iterable);
          const arrSlot = addLocal(ctx, "$forEach_arr", iterableType, true);
          if (emitter.maxLocals <= arrSlot) emitter.maxLocals = arrSlot + 1;
          emitter.emitAstore(arrSlot);
          const idxSlot = addLocal(ctx, "$forEach_idx", "int", true);
          if (emitter.maxLocals <= idxSlot) emitter.maxLocals = idxSlot + 1;
          emitter.emitIconst(0);
          emitter.emitIstore(idxSlot);
          const loopStart = emitter.pc;
          emitter.emitIload(idxSlot);
          emitter.emitAload(arrSlot);
          emitter.emit(190);
          emitter.adjustStackForCompare();
          const patchExit = emitter.emitBranch(162);
          const elemSlot = addLocal(ctx, stmt.varName, stmt.varType);
          if (emitter.maxLocals <= elemSlot) emitter.maxLocals = elemSlot + 1;
          emitter.emitAload(arrSlot);
          emitter.emitIload(idxSlot);
          if (stmt.varType === "int" || stmt.varType === "boolean" || stmt.varType === "byte" || stmt.varType === "short" || stmt.varType === "char") {
            emitter.emit(46);
          } else {
            emitter.emit(50);
          }
          emitter.adjustStackForArrayLoad();
          emitStoreLocalByType(emitter, elemSlot, stmt.varType);
          withScopedLocals(ctx, () => {
            for (const s of stmt.body) compileStmt(ctx, emitter, s);
          });
          const continueTarget = emitter.pc;
          emitter.emit(132);
          emitter.emit(idxSlot);
          emitter.emit(1);
          const gotoOp = emitter.emitBranch(167);
          emitter.patchBranch(gotoOp, loopStart);
          emitter.patchBranch(patchExit, emitter.pc);
          for (const p of breakInfo.patches) emitter.patchBranch(p, emitter.pc);
          for (const p of continueInfo.targets) emitter.patchBranch(p, continueTarget);
        } else {
          compileExpr(ctx, emitter, stmt.iterable);
          const iteratorRef = ctx.cp.addInterfaceMethodref("java/lang/Iterable", "iterator", "()Ljava/util/Iterator;");
          emitter.emitInvokeinterface(iteratorRef, 0, true);
          const itSlot = addLocal(ctx, "$forEach_it", { className: "java/util/Iterator" }, true);
          if (emitter.maxLocals <= itSlot) emitter.maxLocals = itSlot + 1;
          emitter.emitAstore(itSlot);
          const loopStart = emitter.pc;
          emitter.emitAload(itSlot);
          const hasNextRef = ctx.cp.addInterfaceMethodref("java/util/Iterator", "hasNext", "()Z");
          emitter.emitInvokeinterface(hasNextRef, 0, true);
          const patchExit = emitter.emitBranch(153);
          const elemSlot = addLocal(ctx, stmt.varName, stmt.varType);
          if (emitter.maxLocals <= elemSlot) emitter.maxLocals = elemSlot + 1;
          emitter.emitAload(itSlot);
          const nextRef = ctx.cp.addInterfaceMethodref("java/util/Iterator", "next", "()Ljava/lang/Object;");
          emitter.emitInvokeinterface(nextRef, 0, true);
          if (typeof stmt.varType === "object" && "className" in stmt.varType) {
            const classIdx = ctx.cp.addClass(stmt.varType.className);
            emitter.emit(192);
            emitter.emitU16(classIdx);
          } else if (stmt.varType === "String") {
            const classIdx = ctx.cp.addClass("java/lang/String");
            emitter.emit(192);
            emitter.emitU16(classIdx);
          }
          emitStoreLocalByType(emitter, elemSlot, stmt.varType);
          withScopedLocals(ctx, () => {
            for (const s of stmt.body) compileStmt(ctx, emitter, s);
          });
          const continueTarget = emitter.pc;
          const gotoOp = emitter.emitBranch(167);
          emitter.patchBranch(gotoOp, loopStart);
          emitter.patchBranch(patchExit, emitter.pc);
          for (const p of breakInfo.patches) emitter.patchBranch(p, emitter.pc);
          for (const p of continueInfo.targets) emitter.patchBranch(p, continueTarget);
        }
        ctx.breakPatches.pop();
        ctx.continuePatches.pop();
      });
      break;
    }
    case "throw": {
      compileExpr(ctx, emitter, stmt.expr);
      emitter.emit(191);
      break;
    }
    case "assert": {
      if (inferType(ctx, stmt.cond) !== "boolean") throw new Error("assert condition must be boolean");
      compileExpr(ctx, emitter, stmt.cond);
      const patchOk = emitter.emitBranch(154);
      const assertionClass = ctx.cp.addClass("java/lang/AssertionError");
      emitter.emit(187);
      emitter.emitU16(assertionClass);
      emitter.emit(89);
      if (stmt.message) {
        const msgType = inferType(ctx, stmt.message);
        compileExpr(ctx, emitter, stmt.message);
        if (isPrimitiveType(msgType)) {
          const info = BOX_INFO[msgType];
          if (!info) throw new Error("assert message boxing failed");
          const boxRef = ctx.cp.addMethodref(info.wrapper, "valueOf", info.desc);
          emitter.emit(184);
          emitter.emitU16(boxRef);
        }
        const initRef = ctx.cp.addMethodref("java/lang/AssertionError", "<init>", "(Ljava/lang/Object;)V");
        emitter.emitInvokespecial(initRef, 1, false);
      } else {
        const initRef = ctx.cp.addMethodref("java/lang/AssertionError", "<init>", "()V");
        emitter.emitInvokespecial(initRef, 0, false);
      }
      emitter.emit(191);
      emitter.patchBranch(patchOk, emitter.pc);
      break;
    }
    case "synchronized": {
      const monitorType = inferType(ctx, stmt.monitor);
      if (!isRefType(monitorType)) throw new Error("synchronized monitor must be a reference type");
      withScopedLocals(ctx, () => {
        const syncMonName = `$sync_mon_${ctx.nextSlot}`;
        const syncExName = `$sync_ex_${ctx.nextSlot}`;
        compileExpr(ctx, emitter, stmt.monitor);
        const monSlot = addLocal(ctx, syncMonName, monitorType, true);
        if (emitter.maxLocals <= monSlot) emitter.maxLocals = monSlot + 1;
        emitter.emitAstore(monSlot);
        emitter.emitAload(monSlot);
        emitter.emitPop(194);
        const syncStart = emitter.pc;
        const exitActions = getExitActions(ctx);
        exitActions.push({ kind: "monitor", slot: monSlot });
        withScopedLocals(ctx, () => {
          for (const s of stmt.body) compileStmt(ctx, emitter, s);
        });
        exitActions.pop();
        emitter.emitAload(monSlot);
        emitter.emitPop(195);
        const patchEnd = emitter.emitBranch(167);
        const handlerPc = emitter.pc;
        emitter.adjustStackForCatch();
        const exSlot = addLocal(ctx, syncExName, { className: "java/lang/Throwable" }, true);
        if (emitter.maxLocals <= exSlot) emitter.maxLocals = exSlot + 1;
        emitter.emitAstore(exSlot);
        emitter.emitAload(monSlot);
        emitter.emitPop(195);
        emitter.emitAload(exSlot);
        emitter.emit(191);
        emitter.exceptionTable.push({ startPc: syncStart, endPc: handlerPc, handlerPc, catchType: 0 });
        emitter.patchBranch(patchEnd, emitter.pc);
      });
      break;
    }
    case "tryCatch": {
      const tryStart = emitter.pc;
      const exitActions = getExitActions(ctx);
      if (stmt.finallyBody) exitActions.push({ kind: "finally", body: stmt.finallyBody });
      withScopedLocals(ctx, () => {
        for (const s of stmt.tryBody) compileStmt(ctx, emitter, s);
      });
      const tryEnd = emitter.pc;
      const patchEnd = emitter.emitBranch(167);
      const catchEndPatches = [patchEnd];
      const exceptionTable = [];
      const catchRanges = [];
      for (const c of stmt.catches) {
        const handlerPc = emitter.pc;
        const catchClass = resolveClassName(ctx, c.exType);
        const classIdx = ctx.cp.addClass(catchClass);
        exceptionTable.push({ startPc: tryStart, endPc: tryEnd, handlerPc, catchType: classIdx });
        const catchStart = emitter.pc;
        withScopedLocals(ctx, () => {
          emitter.adjustStackForCatch();
          const slot = addLocal(ctx, c.varName, { className: catchClass });
          if (emitter.maxLocals <= slot) emitter.maxLocals = slot + 1;
          emitter.emitAstore(slot);
          for (const s of c.body) compileStmt(ctx, emitter, s);
        });
        const catchEnd = emitter.pc;
        catchRanges.push({ startPc: catchStart, endPc: catchEnd });
        catchEndPatches.push(emitter.emitBranch(167));
      }
      if (stmt.finallyBody) {
        exitActions.pop();
        const finallyStart = emitter.pc;
        for (const p of catchEndPatches) emitter.patchBranch(p, finallyStart);
        withScopedLocals(ctx, () => {
          for (const s of stmt.finallyBody) compileStmt(ctx, emitter, s);
        });
        const patchAfterFinally = emitter.emitBranch(167);
        const finallyHandlerPc = emitter.pc;
        emitter.adjustStackForCatch();
        const exSlot = addLocal(ctx, `finally_ex_${ctx.nextSlot}`, { className: "java/lang/Throwable" }, true);
        if (emitter.maxLocals <= exSlot) emitter.maxLocals = exSlot + 1;
        emitter.emitAstore(exSlot);
        withScopedLocals(ctx, () => {
          for (const s of stmt.finallyBody) compileStmt(ctx, emitter, s);
        });
        emitter.emitAload(exSlot);
        emitter.emit(191);
        exceptionTable.push({ startPc: tryStart, endPc: tryEnd, handlerPc: finallyHandlerPc, catchType: 0 });
        for (const r of catchRanges) {
          if (r.endPc > r.startPc) {
            exceptionTable.push({ startPc: r.startPc, endPc: r.endPc, handlerPc: finallyHandlerPc, catchType: 0 });
          }
        }
        emitter.patchBranch(patchAfterFinally, emitter.pc);
      } else {
        for (const p of catchEndPatches) emitter.patchBranch(p, emitter.pc);
      }
      for (const entry of exceptionTable) {
        emitter.exceptionTable.push(entry);
      }
      break;
    }
    case "break": {
      if (stmt.label) {
        const info = [...ctx.breakPatches].reverse().find((b) => b.label === stmt.label);
        if (!info) throw new Error(`break label '${stmt.label}' not found`);
        emitPendingExitActions(ctx, emitter, info.exitDepth ?? 0);
        info.patches.push(emitter.emitBranch(167));
      } else {
        const info = ctx.breakPatches[ctx.breakPatches.length - 1];
        if (!info) throw new Error("break outside of loop/switch");
        emitPendingExitActions(ctx, emitter, info.exitDepth ?? 0);
        info.patches.push(emitter.emitBranch(167));
      }
      break;
    }
    case "continue": {
      if (stmt.label) {
        const info = [...ctx.continuePatches].reverse().find((c) => c.label === stmt.label);
        if (!info) throw new Error(`continue label '${stmt.label}' not found`);
        emitPendingExitActions(ctx, emitter, info.exitDepth ?? 0);
        info.targets.push(emitter.emitBranch(167));
      } else {
        const info = ctx.continuePatches[ctx.continuePatches.length - 1];
        if (!info) throw new Error("continue outside of loop");
        emitPendingExitActions(ctx, emitter, info.exitDepth ?? 0);
        info.targets.push(emitter.emitBranch(167));
      }
      break;
    }
    case "labeled": {
      const breakInfo = { label: stmt.label, patches: [], exitDepth: getExitActions(ctx).length };
      const continueInfo = { label: stmt.label, targets: [], exitDepth: getExitActions(ctx).length };
      ctx.breakPatches.push(breakInfo);
      ctx.continuePatches.push(continueInfo);
      compileStmt(ctx, emitter, stmt.stmt);
      ctx.breakPatches.pop();
      ctx.continuePatches.pop();
      for (const p of breakInfo.patches) emitter.patchBranch(p, emitter.pc);
      break;
    }
    case "block": {
      withScopedLocals(ctx, () => {
        for (const s of stmt.stmts) compileStmt(ctx, emitter, s);
      });
      break;
    }
    default:
      throw new Error(`Unsupported statement: ${stmt.kind}`);
  }
}
function compileMethod(classDecl, method, cp, allMethods, inheritedFields, classSupers, classDecls, lambdaCounter, generatedMethods, lambdaBootstraps) {
  const emitter = new BytecodeEmitter();
  const locals = [];
  let nextSlot = 0;
  if (!method.isStatic) {
    locals.push({ name: "this", type: { className: classDecl.name }, slot: 0 });
    nextSlot = 1;
  }
  for (const p of method.params) {
    locals.push({ name: p.name, type: p.type, slot: nextSlot });
    nextSlot++;
  }
  const ctx = {
    className: classDecl.name,
    superClass: classDecl.superClass,
    cp,
    method,
    locals,
    nextSlot,
    fields: classDecl.fields,
    fieldMap: new Map(classDecl.fields.map((f) => [f.name, f])),
    inheritedFields,
    inheritedFieldMap: buildNearestFieldMap(inheritedFields),
    allMethods,
    importMap: classDecl.importMap,
    packageImports: classDecl.packageImports,
    staticWildcardImports: classDecl.staticWildcardImports,
    classSupers,
    classDecls,
    lambdaCounter,
    generatedMethods,
    lambdaBootstraps,
    ownerIsStatic: method.isStatic,
    breakPatches: [],
    continuePatches: []
  };
  emitter.maxLocals = nextSlot;
  for (const stmt of method.body) {
    compileStmt(ctx, emitter, stmt);
  }
  emitter.emitReturn(method.returnType);
  return { code: emitter.code, maxStack: Math.max(emitter.maxStack, 4), maxLocals: emitter.maxLocals, exceptionTable: emitter.exceptionTable };
}
function exprHasSuperCall(expr) {
  switch (expr.kind) {
    case "superCall":
      return true;
    case "binary":
      return exprHasSuperCall(expr.left) || exprHasSuperCall(expr.right);
    case "unary":
      return exprHasSuperCall(expr.operand);
    case "call":
      return (expr.object ? exprHasSuperCall(expr.object) : false) || expr.args.some(exprHasSuperCall);
    case "staticCall":
      return expr.args.some(exprHasSuperCall);
    case "fieldAccess":
      return exprHasSuperCall(expr.object);
    case "newExpr":
      return expr.args.some(exprHasSuperCall);
    case "cast":
      return exprHasSuperCall(expr.expr);
    case "postIncrement":
      return exprHasSuperCall(expr.operand);
    case "preIncrement":
      return exprHasSuperCall(expr.operand);
    case "instanceof":
      return exprHasSuperCall(expr.expr);
    case "arrayAccess":
      return exprHasSuperCall(expr.array) || exprHasSuperCall(expr.index);
    case "arrayLit":
      return expr.elements.some(exprHasSuperCall);
    case "newArray":
      return exprHasSuperCall(expr.size);
    case "ternary":
      return exprHasSuperCall(expr.cond) || exprHasSuperCall(expr.thenExpr) || exprHasSuperCall(expr.elseExpr);
    case "switchExpr":
      return exprHasSuperCall(expr.selector) || expr.cases.some((c) => c.expr && exprHasSuperCall(c.expr) || c.stmts && c.stmts.some(stmtHasSuperCall));
    case "lambda":
      return !!expr.bodyExpr && exprHasSuperCall(expr.bodyExpr) || !!expr.bodyStmts && expr.bodyStmts.some(stmtHasSuperCall);
    case "methodRef":
      return exprHasSuperCall(expr.target);
    default:
      return false;
  }
}
function stmtHasSuperCall(stmt) {
  switch (stmt.kind) {
    case "varDecl":
      return !!stmt.init && exprHasSuperCall(stmt.init);
    case "assign":
      return exprHasSuperCall(stmt.target) || exprHasSuperCall(stmt.value);
    case "compoundAssign":
      return exprHasSuperCall(stmt.target) || exprHasSuperCall(stmt.value);
    case "exprStmt":
      return exprHasSuperCall(stmt.expr);
    case "return":
      return !!stmt.value && exprHasSuperCall(stmt.value);
    case "yield":
      return exprHasSuperCall(stmt.value);
    case "if":
      return exprHasSuperCall(stmt.cond) || stmt.then.some(stmtHasSuperCall) || !!stmt.else_?.some(stmtHasSuperCall);
    case "while":
      return exprHasSuperCall(stmt.cond) || stmt.body.some(stmtHasSuperCall);
    case "for":
      return !!stmt.init && stmtHasSuperCall(stmt.init) || !!stmt.cond && exprHasSuperCall(stmt.cond) || !!stmt.update && stmtHasSuperCall(stmt.update) || stmt.body.some(stmtHasSuperCall);
    case "switch":
      return exprHasSuperCall(stmt.selector) || stmt.cases.some((c) => c.expr && exprHasSuperCall(c.expr) || c.stmts && c.stmts.some(stmtHasSuperCall));
    case "doWhile":
      return exprHasSuperCall(stmt.cond) || stmt.body.some(stmtHasSuperCall);
    case "forEach":
      return exprHasSuperCall(stmt.iterable) || stmt.body.some(stmtHasSuperCall);
    case "assert":
      return exprHasSuperCall(stmt.cond) || !!stmt.message && exprHasSuperCall(stmt.message);
    case "synchronized":
      return exprHasSuperCall(stmt.monitor) || stmt.body.some(stmtHasSuperCall);
    case "throw":
      return exprHasSuperCall(stmt.expr);
    case "tryCatch":
      return stmt.tryBody.some(stmtHasSuperCall) || stmt.catches.some((c) => c.body.some(stmtHasSuperCall)) || !!stmt.finallyBody?.some(stmtHasSuperCall);
    case "break":
      return false;
    case "continue":
      return false;
    case "labeled":
      return stmtHasSuperCall(stmt.stmt);
    case "block":
      return stmt.stmts.some(stmtHasSuperCall);
  }
}
function validateConstructorBody(method) {
  if (method.name !== "<init>") {
    if (method.body.some(stmtHasSuperCall)) {
      throw new Error("super(...) call is only allowed in constructors");
    }
    return;
  }
  const topLevelSuperCalls = method.body.filter((s) => s.kind === "exprStmt" && s.expr.kind === "superCall");
  if (topLevelSuperCalls.length === 0) {
    if (method.body.some(stmtHasSuperCall)) {
      throw new Error("super(...) call must be the first statement in constructor");
    }
    return;
  }
  const first = method.body[0];
  if (!(first.kind === "exprStmt" && first.expr.kind === "superCall")) {
    throw new Error("super(...) call must be the first statement in constructor");
  }
  if (topLevelSuperCalls.length > 1) {
    throw new Error("super(...) call may appear at most once in constructor body");
  }
  for (let i = 1; i < method.body.length; i++) {
    if (stmtHasSuperCall(method.body[i])) {
      throw new Error("super(...) call must be the first statement in constructor");
    }
  }
}
function resolveClassNameInDecl(classDecl, classDecls, name) {
  if (name.includes("/")) return name;
  if (name.includes(".")) return name.replace(/\./g, "/");
  const explicit = classDecl.importMap.get(name);
  if (explicit) return explicit;
  if (classDecls.has(name)) return name;
  return resolveWildcardImport(name, classDecl.packageImports) ?? name;
}
function isClassSupertypeInMaps(classSupers, maybeSuper, maybeSub) {
  if (maybeSuper === maybeSub) return true;
  let cur = maybeSub;
  const seen = /* @__PURE__ */ new Set();
  while (!seen.has(cur)) {
    seen.add(cur);
    const next = classSupers.get(cur) ?? BUILTIN_SUPERS[cur];
    if (!next) return false;
    if (next === maybeSuper) return true;
    cur = next;
  }
  return false;
}
function isCheckedExceptionType(classSupers, exClass) {
  const isThrowable = isClassSupertypeInMaps(classSupers, "java/lang/Throwable", exClass);
  const isRuntime = isClassSupertypeInMaps(classSupers, "java/lang/RuntimeException", exClass);
  const isError = isClassSupertypeInMaps(classSupers, "java/lang/Error", exClass);
  if (!isThrowable) return true;
  if (isRuntime || isError) return false;
  return true;
}
function findDeclaredMethodByArity(classDecls, classSupers, ownerClass, methodName, argTypes, wantStatic) {
  const arity = argTypes.length;
  const argDescs = argTypes.map(typeToDescriptor).join("");
  const pick = (decl) => {
    const candidates = decl.methods.filter((m) => m.name === methodName && m.params.length === arity && (wantStatic === void 0 || m.isStatic === wantStatic));
    if (candidates.length === 0) return void 0;
    const exactMatches = candidates.filter((m) => m.params.map((p) => typeToDescriptor(p.type)).join("") === argDescs);
    if (exactMatches.length === 1) return exactMatches[0];
    if (exactMatches.length > 1) throw new Error(`Ambiguous method overload in checked-exception analysis: ${ownerClass}.${methodName}(${argDescs})`);
    if (candidates.length === 1) return candidates[0];
    throw new Error(`Ambiguous method overload in checked-exception analysis: ${ownerClass}.${methodName}(${argDescs})`);
  };
  const classChain = [];
  const seenClass = /* @__PURE__ */ new Set();
  let cur = ownerClass;
  while (cur && !seenClass.has(cur)) {
    seenClass.add(cur);
    classChain.push(cur);
    cur = classSupers.get(cur) ?? BUILTIN_SUPERS[cur];
  }
  for (const cls of classChain) {
    const decl = classDecls.get(cls);
    if (decl) {
      const found = pick(decl);
      if (found) return found;
    }
  }
  const queue = [];
  const seenIface = /* @__PURE__ */ new Set();
  for (const cls of classChain) {
    const decl = classDecls.get(cls);
    if (!decl) continue;
    for (const itf of decl.interfaces ?? []) queue.push(itf);
  }
  while (queue.length > 0) {
    const itf = queue.shift();
    if (seenIface.has(itf)) continue;
    seenIface.add(itf);
    const decl = classDecls.get(itf);
    if (!decl) continue;
    const found = pick(decl);
    if (found) return found;
    for (const parent of decl.interfaces ?? []) queue.push(parent);
  }
  return void 0;
}
function collectExprCheckedExceptions(classDecl, classDecls, classSupers, expr, localTypes, ownerIsStatic) {
  const fieldMap = new Map(classDecl.fields.map((f) => [f.name, f]));
  const emptyInheritedFieldMap = /* @__PURE__ */ new Map();
  const inferArgTypesForChecks = (args) => {
    const inferCtx = {
      className: classDecl.name,
      superClass: classDecl.superClass,
      fields: classDecl.fields,
      fieldMap,
      inheritedFields: [],
      inheritedFieldMap: emptyInheritedFieldMap,
      locals: Array.from(localTypes, ([name, type], idx) => ({ name, type, slot: idx })),
      importMap: classDecl.importMap,
      packageImports: classDecl.packageImports,
      staticWildcardImports: classDecl.staticWildcardImports,
      classSupers,
      classDecls,
      allMethods: classDecl.methods,
      ownerIsStatic
    };
    return args.map((a) => inferType(inferCtx, a));
  };
  const out = /* @__PURE__ */ new Set();
  const merge = (s) => {
    for (const e of s) out.add(e);
  };
  const addThrown = (name) => {
    if (!name) return;
    if (!isCheckedExceptionType(classSupers, name)) return;
    out.add(name);
  };
  const fromMethod = (owner, name, argTypes, wantStatic) => {
    const m = findDeclaredMethodByArity(classDecls, classSupers, owner, name, argTypes, wantStatic);
    for (const t of m?.throwsTypes ?? []) {
      const resolved = resolveClassNameInDecl(classDecl, classDecls, t);
      addThrown(resolved);
    }
  };
  switch (expr.kind) {
    case "binary":
      merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, expr.left, localTypes, ownerIsStatic));
      merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, expr.right, localTypes, ownerIsStatic));
      break;
    case "unary":
      merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, expr.operand, localTypes, ownerIsStatic));
      break;
    case "call":
      if (expr.object) merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, expr.object, localTypes, ownerIsStatic));
      for (const a of expr.args) merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, a, localTypes, ownerIsStatic));
      const callArgTypes = inferArgTypesForChecks(expr.args);
      if (!expr.object) {
        fromMethod(classDecl.name, expr.method, callArgTypes, void 0);
      } else if (expr.object.kind === "this") {
        fromMethod(classDecl.name, expr.method, callArgTypes, false);
      } else if (expr.object.kind === "newExpr") {
        const owner = resolveClassNameInDecl(classDecl, classDecls, expr.object.className);
        fromMethod(owner, expr.method, callArgTypes, false);
      } else if (expr.object.kind === "ident") {
        const t = localTypes.get(expr.object.name);
        if (t && typeof t === "object" && "className" in t) {
          fromMethod(resolveClassNameInDecl(classDecl, classDecls, t.className), expr.method, callArgTypes, false);
        } else {
          const owner = resolveClassNameInDecl(classDecl, classDecls, expr.object.name);
          const looksLikeClassRef = !localTypes.has(expr.object.name) && (/^[A-Z]/.test(expr.object.name) || classDecl.importMap.has(expr.object.name) || owner !== expr.object.name);
          if (looksLikeClassRef) fromMethod(owner, expr.method, callArgTypes, true);
        }
      }
      break;
    case "staticCall":
      for (const a of expr.args) merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, a, localTypes, ownerIsStatic));
      fromMethod(
        resolveClassNameInDecl(classDecl, classDecls, expr.className),
        expr.method,
        inferArgTypesForChecks(expr.args),
        true
      );
      break;
    case "fieldAccess":
      merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, expr.object, localTypes, ownerIsStatic));
      break;
    case "newExpr": {
      for (const a of expr.args) merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, a, localTypes, ownerIsStatic));
      const owner = resolveClassNameInDecl(classDecl, classDecls, expr.className);
      const ctorArgTypes = inferArgTypesForChecks(expr.args);
      const ctor = findDeclaredMethodByArity(classDecls, classSupers, owner, "<init>", ctorArgTypes, false);
      for (const t of ctor?.throwsTypes ?? []) addThrown(resolveClassNameInDecl(classDecl, classDecls, t));
      break;
    }
    case "cast":
      merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, expr.expr, localTypes, ownerIsStatic));
      break;
    case "postIncrement":
    case "preIncrement":
      merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, expr.operand, localTypes, ownerIsStatic));
      break;
    case "instanceof":
      merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, expr.expr, localTypes, ownerIsStatic));
      break;
    case "arrayAccess":
      merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, expr.array, localTypes, ownerIsStatic));
      merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, expr.index, localTypes, ownerIsStatic));
      break;
    case "arrayLit":
      for (const e of expr.elements) merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, e, localTypes, ownerIsStatic));
      break;
    case "newArray":
      merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, expr.size, localTypes, ownerIsStatic));
      break;
    case "ternary":
      merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, expr.cond, localTypes, ownerIsStatic));
      merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, expr.thenExpr, localTypes, ownerIsStatic));
      merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, expr.elseExpr, localTypes, ownerIsStatic));
      break;
    case "switchExpr":
      merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, expr.selector, localTypes, ownerIsStatic));
      for (const c of expr.cases) {
        if (c.guard) merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, c.guard, localTypes, ownerIsStatic));
        if (c.expr) merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, c.expr, localTypes, ownerIsStatic));
        if (c.stmts) merge(collectStmtListCheckedExceptions(classDecl, classDecls, classSupers, c.stmts, new Map(localTypes), ownerIsStatic));
      }
      break;
    case "methodRef":
      merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, expr.target, localTypes, ownerIsStatic));
      break;
    default:
      break;
  }
  return out;
}
function collectStmtListCheckedExceptions(classDecl, classDecls, classSupers, stmts, localTypes, ownerIsStatic) {
  const out = /* @__PURE__ */ new Set();
  const merge = (s) => {
    for (const e of s) out.add(e);
  };
  for (const s of stmts) {
    merge(collectStmtCheckedExceptions(classDecl, classDecls, classSupers, s, localTypes, ownerIsStatic));
  }
  return out;
}
function collectStmtCheckedExceptions(classDecl, classDecls, classSupers, stmt, localTypes, ownerIsStatic) {
  const out = /* @__PURE__ */ new Set();
  const merge = (s) => {
    for (const e of s) out.add(e);
  };
  const addThrown = (name) => {
    if (!name) return;
    if (!isCheckedExceptionType(classSupers, name)) return;
    out.add(name);
  };
  const fieldMap = new Map(classDecl.fields.map((f) => [f.name, f]));
  const emptyInheritedFieldMap = /* @__PURE__ */ new Map();
  const inferExprTypeForChecks = (expr) => {
    const inferCtx = {
      className: classDecl.name,
      superClass: classDecl.superClass,
      fields: classDecl.fields,
      fieldMap,
      inheritedFields: [],
      inheritedFieldMap: emptyInheritedFieldMap,
      locals: Array.from(localTypes, ([name, type], idx) => ({ name, type, slot: idx })),
      importMap: classDecl.importMap,
      packageImports: classDecl.packageImports,
      staticWildcardImports: classDecl.staticWildcardImports,
      classSupers,
      classDecls,
      allMethods: classDecl.methods,
      ownerIsStatic
    };
    return inferType(inferCtx, expr);
  };
  switch (stmt.kind) {
    case "varDecl":
      if (stmt.init) merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, stmt.init, localTypes, ownerIsStatic));
      localTypes.set(stmt.name, stmt.type);
      break;
    case "assign":
      merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, stmt.target, localTypes, ownerIsStatic));
      merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, stmt.value, localTypes, ownerIsStatic));
      break;
    case "compoundAssign":
      merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, stmt.target, localTypes, ownerIsStatic));
      merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, stmt.value, localTypes, ownerIsStatic));
      break;
    case "exprStmt":
      merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, stmt.expr, localTypes, ownerIsStatic));
      break;
    case "return":
      if (stmt.value) merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, stmt.value, localTypes, ownerIsStatic));
      break;
    case "yield":
      merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, stmt.value, localTypes, ownerIsStatic));
      break;
    case "if":
      merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, stmt.cond, localTypes, ownerIsStatic));
      merge(collectStmtListCheckedExceptions(classDecl, classDecls, classSupers, stmt.then, new Map(localTypes), ownerIsStatic));
      if (stmt.else_) merge(collectStmtListCheckedExceptions(classDecl, classDecls, classSupers, stmt.else_, new Map(localTypes), ownerIsStatic));
      break;
    case "while":
      merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, stmt.cond, localTypes, ownerIsStatic));
      merge(collectStmtListCheckedExceptions(classDecl, classDecls, classSupers, stmt.body, new Map(localTypes), ownerIsStatic));
      break;
    case "for": {
      const scoped = new Map(localTypes);
      if (stmt.init) merge(collectStmtCheckedExceptions(classDecl, classDecls, classSupers, stmt.init, scoped, ownerIsStatic));
      if (stmt.cond) merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, stmt.cond, scoped, ownerIsStatic));
      if (stmt.update) merge(collectStmtCheckedExceptions(classDecl, classDecls, classSupers, stmt.update, scoped, ownerIsStatic));
      merge(collectStmtListCheckedExceptions(classDecl, classDecls, classSupers, stmt.body, scoped, ownerIsStatic));
      break;
    }
    case "switch":
      merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, stmt.selector, localTypes, ownerIsStatic));
      for (const c of stmt.cases) {
        if (c.guard) merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, c.guard, localTypes, ownerIsStatic));
        if (c.expr) merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, c.expr, localTypes, ownerIsStatic));
        if (c.stmts) merge(collectStmtListCheckedExceptions(classDecl, classDecls, classSupers, c.stmts, new Map(localTypes), ownerIsStatic));
      }
      break;
    case "doWhile":
      merge(collectStmtListCheckedExceptions(classDecl, classDecls, classSupers, stmt.body, new Map(localTypes), ownerIsStatic));
      merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, stmt.cond, localTypes, ownerIsStatic));
      break;
    case "forEach":
      merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, stmt.iterable, localTypes, ownerIsStatic));
      merge(collectStmtListCheckedExceptions(classDecl, classDecls, classSupers, stmt.body, new Map(localTypes), ownerIsStatic));
      break;
    case "assert":
      merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, stmt.cond, localTypes, ownerIsStatic));
      if (stmt.message) merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, stmt.message, localTypes, ownerIsStatic));
      break;
    case "synchronized":
      merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, stmt.monitor, localTypes, ownerIsStatic));
      merge(collectStmtListCheckedExceptions(classDecl, classDecls, classSupers, stmt.body, new Map(localTypes), ownerIsStatic));
      break;
    case "throw": {
      merge(collectExprCheckedExceptions(classDecl, classDecls, classSupers, stmt.expr, localTypes, ownerIsStatic));
      if (stmt.expr.kind === "newExpr") {
        addThrown(resolveClassNameInDecl(classDecl, classDecls, stmt.expr.className));
      } else if (stmt.expr.kind === "ident") {
        if (stmt.expr.name.startsWith("twr_")) break;
        const t = localTypes.get(stmt.expr.name);
        if (t && typeof t === "object" && "className" in t) {
          addThrown(resolveClassNameInDecl(classDecl, classDecls, t.className));
        }
      } else {
        const exprType = stmt.expr.staticType ?? stmt.expr.type ?? inferExprTypeForChecks(stmt.expr);
        if (exprType && typeof exprType === "object" && "className" in exprType) {
          addThrown(resolveClassNameInDecl(classDecl, classDecls, exprType.className));
        }
      }
      break;
    }
    case "tryCatch": {
      const thrownTry = collectStmtListCheckedExceptions(classDecl, classDecls, classSupers, stmt.tryBody, new Map(localTypes), ownerIsStatic);
      for (const c of stmt.catches) {
        const catchType = resolveClassNameInDecl(classDecl, classDecls, c.exType);
        for (const e of Array.from(thrownTry)) {
          if (isClassSupertypeInMaps(classSupers, catchType, e)) thrownTry.delete(e);
        }
      }
      merge(thrownTry);
      for (const c of stmt.catches) {
        const catchScope = new Map(localTypes);
        catchScope.set(c.varName, { className: resolveClassNameInDecl(classDecl, classDecls, c.exType) });
        merge(collectStmtListCheckedExceptions(classDecl, classDecls, classSupers, c.body, catchScope, ownerIsStatic));
      }
      if (stmt.finallyBody) {
        merge(collectStmtListCheckedExceptions(classDecl, classDecls, classSupers, stmt.finallyBody, new Map(localTypes), ownerIsStatic));
      }
      break;
    }
    case "labeled":
      merge(collectStmtCheckedExceptions(classDecl, classDecls, classSupers, stmt.stmt, new Map(localTypes), ownerIsStatic));
      break;
    case "block":
      merge(collectStmtListCheckedExceptions(classDecl, classDecls, classSupers, stmt.stmts, new Map(localTypes), ownerIsStatic));
      break;
    default:
      break;
  }
  return out;
}
function validateCheckedExceptions(classDecl, method, classDecls, classSupers) {
  if (method.name.startsWith("lambda$")) return;
  const localTypes = /* @__PURE__ */ new Map();
  if (!method.isStatic) localTypes.set("this", { className: classDecl.name });
  for (const p of method.params) localTypes.set(p.name, p.type);
  const uncaught = collectStmtListCheckedExceptions(classDecl, classDecls, classSupers, method.body, localTypes, method.isStatic);
  const declared = (method.throwsTypes ?? []).map((t) => resolveClassNameInDecl(classDecl, classDecls, t));
  for (const ex of uncaught) {
    const covered = declared.some((d) => isClassSupertypeInMaps(classSupers, d, ex));
    if (!covered) {
      throw new Error(`Unhandled checked exception in ${classDecl.name}.${method.name}: ${ex}`);
    }
  }
}
function flattenClasses(decls) {
  const result = [];
  for (const cd of decls) {
    result.push(cd);
    if (cd.nestedClasses.length > 0) {
      result.push(...flattenClasses(cd.nestedClasses));
    }
  }
  return result;
}
function compile(source, implicitClassName) {
  const tokens = lex(source);
  const classDecls = flattenClasses(parseAll(tokens, implicitClassName));
  if (classDecls.length === 1) {
    return generateClassFile(classDecls[0], classDecls);
  }
  const classFiles = classDecls.map((cd) => generateClassFile(cd, classDecls));
  let total = 0;
  for (const cf of classFiles) total += 4 + cf.length;
  const bundle = new Uint8Array(total);
  let off = 0;
  for (const cf of classFiles) {
    bundle[off++] = cf.length >> 24 & 255;
    bundle[off++] = cf.length >> 16 & 255;
    bundle[off++] = cf.length >> 8 & 255;
    bundle[off++] = cf.length & 255;
    bundle.set(cf, off);
    off += cf.length;
  }
  return bundle;
}
function generateClassFile(classDecl, allClassDecls = [classDecl]) {
  const allMethods = allClassDecls.flatMap((cd) => cd.methods);
  const classSupers = /* @__PURE__ */ new Map();
  const classDecls = /* @__PURE__ */ new Map();
  for (const cd of allClassDecls) {
    classSupers.set(cd.name, cd.superClass);
    classDecls.set(cd.name, cd);
  }
  const lambdaCounter = { value: 0 };
  const generatedMethods = [];
  const lambdaBootstraps = [];
  const inheritedFields = [];
  let superName = classDecl.superClass;
  while (superName && superName !== "java/lang/Object") {
    const superDecl = allClassDecls.find((cd) => cd.name === superName);
    if (!superDecl) break;
    inheritedFields.push(...superDecl.fields.filter((f) => !f.isStatic));
    superName = superDecl.superClass;
  }
  const cp = new ConstantPoolBuilder();
  const thisClassIdx = cp.addClass(classDecl.name);
  const superClassIdx = cp.addClass(classDecl.superClass);
  const ifaceIndexes = (classDecl.interfaces ?? []).map((i) => cp.addClass(i));
  const isInterfaceLike = classDecl.kind === "interface" || classDecl.kind === "annotation";
  const isEnumClass = classDecl.kind === "enum";
  const hasInit = classDecl.methods.some((m) => m.name === "<init>");
  if (!isInterfaceLike && !hasInit) {
    classDecl.methods.unshift({
      name: "<init>",
      returnType: "void",
      params: [],
      body: [],
      isStatic: false
    });
  }
  const compiledMethods = [];
  const methodQueue = [...classDecl.methods];
  let generatedDrain = 0;
  for (let mi = 0; mi < methodQueue.length; mi++) {
    const method = methodQueue[mi];
    validateConstructorBody(method);
    validateCheckedExceptions(classDecl, method, classDecls, classSupers);
    const nameIdx = cp.addUtf8(method.name);
    const desc = isEnumClass && method.name === "<init>" ? enumConstructorDescriptor(method.params.map((p) => p.type)) : methodDescriptor(method.params, method.returnType);
    const descIdx = cp.addUtf8(desc);
    let accessFlags = method.isPrivate ? 2 : method.isProtected ? 4 : 1;
    if (method.name === "<init>" && classDecl.kind === "enum") accessFlags = 2;
    if (method.isStatic) accessFlags |= 8;
    const methodIsAbstract = method.name !== "<init>" && !!method.isAbstract;
    if (method.isFinal && !methodIsAbstract) accessFlags |= 16;
    if (method.isSynchronized && !methodIsAbstract) accessFlags |= 32;
    if (methodIsAbstract) accessFlags |= 1024;
    if (methodIsAbstract) {
      compiledMethods.push({ nameIdx, descIdx, accessFlags, hasCode: false });
    } else if (method.name === "<init>") {
      const emitter = new BytecodeEmitter();
      const hasSuperCall = method.body.length > 0 && method.body[0].kind === "exprStmt" && method.body[0].expr.kind === "superCall";
      if (isEnumClass) {
        if (hasSuperCall) {
          throw new Error("explicit super(...) call in enum constructor is not supported");
        }
        const superInitRef = cp.addMethodref("java/lang/Enum", "<init>", "(Ljava/lang/String;I)V");
        emitter.emitAload(0);
        emitter.emitAload(1);
        emitter.emitIload(2);
        emitter.emitInvokespecial(superInitRef, 2, false);
      } else if (!hasSuperCall) {
        const superInitRef = cp.addMethodref(classDecl.superClass, "<init>", "()V");
        emitter.emitAload(0);
        emitter.emitInvokespecial(superInitRef, 0, false);
      }
      const initParamSlotBase = isEnumClass ? 3 : 1;
      const initCtx = {
        className: classDecl.name,
        superClass: classDecl.superClass,
        cp,
        method,
        locals: method.params.map((p, i) => ({ name: p.name, type: p.type, slot: i + initParamSlotBase })),
        nextSlot: method.params.length + initParamSlotBase,
        fields: classDecl.fields,
        fieldMap: new Map(classDecl.fields.map((f) => [f.name, f])),
        inheritedFields,
        inheritedFieldMap: buildNearestFieldMap(inheritedFields),
        allMethods,
        importMap: classDecl.importMap,
        packageImports: classDecl.packageImports,
        staticWildcardImports: classDecl.staticWildcardImports,
        classSupers,
        classDecls,
        lambdaCounter,
        generatedMethods,
        lambdaBootstraps,
        ownerIsStatic: false,
        breakPatches: [],
        continuePatches: []
      };
      const minLocals = method.params.length + initParamSlotBase;
      if (emitter.maxLocals < minLocals) emitter.maxLocals = minLocals;
      for (const field of classDecl.fields) {
        if (!field.isStatic && field.initializer) {
          emitter.emitAload(0);
          compileExpr(initCtx, emitter, field.initializer, field.type);
          const fRef = cp.addFieldref(classDecl.name, field.name, typeToDescriptor(field.type));
          emitter.emit(181);
          emitter.emitU16(fRef);
        }
      }
      for (const stmt of method.body) {
        compileStmt(initCtx, emitter, stmt);
      }
      if (method.isCompactConstructor && classDecl.isRecord && classDecl.recordComponents) {
        for (const c of classDecl.recordComponents) {
          const desc2 = typeToDescriptor(c.type);
          const local = findLocal(initCtx, c.name);
          if (!local) throw new Error(`Compact constructor: component ${c.name} not found in locals`);
          const slot = local.slot;
          emitter.emitAload(0);
          if (desc2 === "J") emitter.emitLload(slot);
          else if (desc2 === "F") emitter.emitFload(slot);
          else if (desc2 === "D") emitter.emitDload(slot);
          else if (desc2 === "I" || desc2 === "Z" || desc2 === "B" || desc2 === "C" || desc2 === "S") emitter.emitIload(slot);
          else emitter.emitAload(slot);
          const fRef = cp.addFieldref(classDecl.name, c.name, desc2);
          emitter.emit(181);
          emitter.emitU16(fRef);
        }
      }
      emitter.emit(177);
      compiledMethods.push({
        nameIdx,
        descIdx,
        accessFlags,
        hasCode: true,
        code: emitter.code,
        maxStack: Math.max(emitter.maxStack, 4),
        maxLocals: Math.max(emitter.maxLocals, minLocals),
        exceptionTable: emitter.exceptionTable.length > 0 ? emitter.exceptionTable : void 0
      });
    } else {
      const result = compileMethod(
        classDecl,
        method,
        cp,
        allMethods,
        inheritedFields,
        classSupers,
        classDecls,
        lambdaCounter,
        generatedMethods,
        lambdaBootstraps
      );
      compiledMethods.push({
        nameIdx,
        descIdx,
        accessFlags,
        hasCode: true,
        code: result.code,
        maxStack: result.maxStack,
        maxLocals: result.maxLocals,
        exceptionTable: result.exceptionTable.length > 0 ? result.exceptionTable : void 0
      });
    }
    while (generatedDrain < generatedMethods.length) {
      const gm = generatedMethods[generatedDrain++];
      methodQueue.push(gm);
      allMethods.push(gm);
    }
  }
  const hasClinit = classDecl.methods.some((m) => m.name === "<clinit>");
  const hasStaticFieldInitializers = classDecl.fields.some((f) => f.isStatic && !!f.initializer);
  const enumConstantCount = isEnumClass ? classDecl.fields.filter((f) => !!f.isEnumConstant).length : 0;
  if (!hasClinit && (hasStaticFieldInitializers || enumConstantCount > 0)) {
    const clinitMethod = { name: "<clinit>", returnType: "void", params: [], body: [], isStatic: true };
    const clinitCtx = {
      className: classDecl.name,
      superClass: classDecl.superClass,
      cp,
      method: clinitMethod,
      locals: [],
      nextSlot: 0,
      fields: classDecl.fields,
      fieldMap: new Map(classDecl.fields.map((f) => [f.name, f])),
      inheritedFields,
      inheritedFieldMap: buildNearestFieldMap(inheritedFields),
      allMethods,
      importMap: classDecl.importMap,
      packageImports: classDecl.packageImports,
      staticWildcardImports: classDecl.staticWildcardImports,
      classSupers,
      classDecls,
      lambdaCounter,
      generatedMethods,
      lambdaBootstraps,
      ownerIsStatic: true,
      breakPatches: [],
      continuePatches: []
    };
    const emitter = new BytecodeEmitter();
    const classIdx = cp.addClass(classDecl.name);
    const enumCtors = classDecl.methods.filter((m) => m.name === "<init>");
    let enumOrdinal = 0;
    for (const field of classDecl.fields) {
      if (!field.isStatic) continue;
      if (field.isEnumConstant) {
        const init = field.initializer;
        if (!init || init.kind !== "newExpr") {
          throw new Error(`Enum constant ${field.name} must have initializer`);
        }
        const ctor = enumCtors.find((m) => m.params.length === init.args.length);
        if (!ctor) {
          throw new Error(`No enum constructor matches ${field.name}(${init.args.length} args)`);
        }
        emitter.emit(187);
        emitter.emitU16(classIdx);
        emitter.emit(89);
        emitter.emitLdc(cp.addString(field.name));
        emitter.emitIconst(enumOrdinal++);
        for (let ai = 0; ai < init.args.length; ai++) {
          compileExpr(clinitCtx, emitter, init.args[ai], ctor.params[ai]?.type);
        }
        const ctorDesc = enumConstructorDescriptor(ctor.params.map((p) => p.type));
        const ctorRef = cp.addMethodref(classDecl.name, "<init>", ctorDesc);
        emitter.emitInvokespecial(ctorRef, 2 + init.args.length, false);
        const fieldRef2 = cp.addFieldref(classDecl.name, field.name, typeToDescriptor(field.type));
        emitter.emit(179);
        emitter.emitU16(fieldRef2);
        continue;
      }
      if (!field.initializer) continue;
      compileExpr(clinitCtx, emitter, field.initializer, field.type);
      const fieldRef = cp.addFieldref(classDecl.name, field.name, typeToDescriptor(field.type));
      emitter.emit(179);
      emitter.emitU16(fieldRef);
    }
    if (isEnumClass && enumConstantCount > 0) {
      const enumConstants = classDecl.fields.filter((f) => !!f.isEnumConstant);
      const arrayType = `[L${classDecl.name};`;
      emitter.emitIconst(enumConstantCount);
      emitter.emit(189);
      emitter.emitU16(classIdx);
      for (let i = 0; i < enumConstants.length; i++) {
        emitter.emit(89);
        emitter.emitIconst(i);
        emitter.emit(178);
        emitter.emitU16(cp.addFieldref(classDecl.name, enumConstants[i].name, `L${classDecl.name};`));
        emitter.emit(83);
      }
      const valuesFieldRef = cp.addFieldref(classDecl.name, "$VALUES", arrayType);
      emitter.emit(179);
      emitter.emitU16(valuesFieldRef);
    }
    emitter.emit(177);
    compiledMethods.push({
      nameIdx: cp.addUtf8("<clinit>"),
      descIdx: cp.addUtf8("()V"),
      accessFlags: 8,
      // ACC_STATIC
      hasCode: true,
      code: emitter.code,
      maxStack: Math.max(emitter.maxStack, 6),
      maxLocals: 0
    });
  }
  const compiledFields = [];
  for (const field of classDecl.fields) {
    const nameIdx = cp.addUtf8(field.name);
    const descIdx = cp.addUtf8(typeToDescriptor(field.type));
    let accessFlags = field.isPrivate ? 2 : field.isProtected ? 4 : 1;
    if (field.isStatic) accessFlags |= 8;
    if (field.isFinal) accessFlags |= 16;
    if (field.isVolatile) accessFlags |= 64;
    if (field.isTransient) accessFlags |= 128;
    if (isEnumClass && field.isEnumConstant) accessFlags |= 16384;
    compiledFields.push({ nameIdx, descIdx, accessFlags });
  }
  if (isEnumClass) {
    compiledFields.push({
      nameIdx: cp.addUtf8("$VALUES"),
      descIdx: cp.addUtf8(`[L${classDecl.name};`),
      accessFlags: 4122
      // ACC_PRIVATE | ACC_STATIC | ACC_FINAL | ACC_SYNTHETIC
    });
  }
  const codeAttrName = cp.addUtf8("Code");
  const bootstrapAttrName = cp.addUtf8("BootstrapMethods");
  const recordAttrName = classDecl.isRecord ? cp.addUtf8("Record") : 0;
  const permittedAttrName = classDecl.isSealed ? cp.addUtf8("PermittedSubclasses") : 0;
  const permittedClassIndices = [];
  if (classDecl.isSealed && classDecl.permittedSubclasses) {
    for (const sub of classDecl.permittedSubclasses) {
      permittedClassIndices.push(cp.addClass(sub));
    }
  }
  const recordComponentCpEntries = [];
  if (classDecl.isRecord && classDecl.recordComponents) {
    for (const c of classDecl.recordComponents) {
      recordComponentCpEntries.push({
        nameIdx: cp.addUtf8(c.name),
        descIdx: cp.addUtf8(typeToDescriptor(c.type))
      });
    }
  }
  const serializedBootstrapMethods = [];
  for (const lb of lambdaBootstraps) {
    const metafactoryRef = cp.addMethodref("java/lang/invoke/LambdaMetafactory", "metafactory", "()V");
    const bootstrapMethodRef = cp.addMethodHandle(6, metafactoryRef);
    const implMethodRef = lb.implIsInterface ? cp.addInterfaceMethodref(lb.implOwner, lb.implMethodName, lb.implDescriptor) : cp.addMethodref(lb.implOwner, lb.implMethodName, lb.implDescriptor);
    const implHandle = cp.addMethodHandle(lb.implRefKind, implMethodRef);
    const samType = cp.addMethodType(lb.samDescriptor);
    const instantiatedType = cp.addMethodType(lb.implDescriptor);
    serializedBootstrapMethods.push({ methodRef: bootstrapMethodRef, args: [samType, implHandle, instantiatedType] });
  }
  const out = [];
  out.push(202, 254, 186, 190);
  out.push(0, 0);
  out.push(0, 52);
  out.push(...cp.serialize());
  const hasAbstractMethods = classDecl.methods.some((m) => !!m.isAbstract);
  let classFlags;
  if (classDecl.kind === "annotation") classFlags = 9729;
  else if (classDecl.kind === "interface") classFlags = 1537;
  else if (classDecl.kind === "enum") classFlags = 16433;
  else if (classDecl.isImplicit) classFlags = 49;
  else classFlags = classDecl.isRecord ? 49 : 33;
  if (classDecl.kind === "class" && !classDecl.isRecord && !classDecl.isImplicit) {
    if (classDecl.isFinal) classFlags |= 16;
    if (classDecl.isAbstract) classFlags |= 1024;
  }
  if (hasAbstractMethods && classDecl.kind !== "interface" && classDecl.kind !== "annotation") {
    classFlags &= ~16;
    classFlags |= 1024;
  }
  out.push(classFlags >> 8 & 255, classFlags & 255);
  out.push(thisClassIdx >> 8 & 255, thisClassIdx & 255);
  out.push(superClassIdx >> 8 & 255, superClassIdx & 255);
  out.push(ifaceIndexes.length >> 8 & 255, ifaceIndexes.length & 255);
  for (const ii of ifaceIndexes) {
    out.push(ii >> 8 & 255, ii & 255);
  }
  out.push(compiledFields.length >> 8 & 255, compiledFields.length & 255);
  for (const f of compiledFields) {
    out.push(f.accessFlags >> 8 & 255, f.accessFlags & 255);
    out.push(f.nameIdx >> 8 & 255, f.nameIdx & 255);
    out.push(f.descIdx >> 8 & 255, f.descIdx & 255);
    out.push(0, 0);
  }
  out.push(compiledMethods.length >> 8 & 255, compiledMethods.length & 255);
  for (const m of compiledMethods) {
    out.push(m.accessFlags >> 8 & 255, m.accessFlags & 255);
    out.push(m.nameIdx >> 8 & 255, m.nameIdx & 255);
    out.push(m.descIdx >> 8 & 255, m.descIdx & 255);
    if (!m.hasCode) {
      out.push(0, 0);
    } else {
      out.push(0, 1);
      out.push(codeAttrName >> 8 & 255, codeAttrName & 255);
      const codeLen = m.code.length;
      const exTblLen = m.exceptionTable ? m.exceptionTable.length : 0;
      const attrLen = 2 + 2 + 4 + codeLen + 2 + exTblLen * 8 + 2;
      out.push(attrLen >> 24 & 255, attrLen >> 16 & 255, attrLen >> 8 & 255, attrLen & 255);
      out.push((m.maxStack ?? 0) >> 8 & 255, (m.maxStack ?? 0) & 255);
      out.push((m.maxLocals ?? 0) >> 8 & 255, (m.maxLocals ?? 0) & 255);
      out.push(codeLen >> 24 & 255, codeLen >> 16 & 255, codeLen >> 8 & 255, codeLen & 255);
      out.push(...m.code);
      out.push(exTblLen >> 8 & 255, exTblLen & 255);
      if (m.exceptionTable) {
        for (const e of m.exceptionTable) {
          out.push(e.startPc >> 8 & 255, e.startPc & 255);
          out.push(e.endPc >> 8 & 255, e.endPc & 255);
          out.push(e.handlerPc >> 8 & 255, e.handlerPc & 255);
          out.push(e.catchType >> 8 & 255, e.catchType & 255);
        }
      }
      out.push(0, 0);
    }
  }
  let classAttrCount = 0;
  if (serializedBootstrapMethods.length > 0) classAttrCount++;
  if (classDecl.isRecord && recordComponentCpEntries.length > 0) classAttrCount++;
  if (classDecl.isSealed && permittedClassIndices.length > 0) classAttrCount++;
  out.push(classAttrCount >> 8 & 255, classAttrCount & 255);
  if (serializedBootstrapMethods.length > 0) {
    out.push(bootstrapAttrName >> 8 & 255, bootstrapAttrName & 255);
    const bmCount = serializedBootstrapMethods.length;
    const bodyLen = 2 + serializedBootstrapMethods.reduce((s, bm) => s + 4 + bm.args.length * 2, 0);
    out.push(bodyLen >> 24 & 255, bodyLen >> 16 & 255, bodyLen >> 8 & 255, bodyLen & 255);
    out.push(bmCount >> 8 & 255, bmCount & 255);
    for (const bm of serializedBootstrapMethods) {
      out.push(bm.methodRef >> 8 & 255, bm.methodRef & 255);
      out.push(bm.args.length >> 8 & 255, bm.args.length & 255);
      for (const a of bm.args) out.push(a >> 8 & 255, a & 255);
    }
  }
  if (classDecl.isRecord && recordComponentCpEntries.length > 0) {
    out.push(recordAttrName >> 8 & 255, recordAttrName & 255);
    const recBodyLen = 2 + recordComponentCpEntries.length * 6;
    out.push(recBodyLen >> 24 & 255, recBodyLen >> 16 & 255, recBodyLen >> 8 & 255, recBodyLen & 255);
    out.push(recordComponentCpEntries.length >> 8 & 255, recordComponentCpEntries.length & 255);
    for (const rc of recordComponentCpEntries) {
      out.push(rc.nameIdx >> 8 & 255, rc.nameIdx & 255);
      out.push(rc.descIdx >> 8 & 255, rc.descIdx & 255);
      out.push(0, 0);
    }
  }
  if (classDecl.isSealed && permittedClassIndices.length > 0) {
    out.push(permittedAttrName >> 8 & 255, permittedAttrName & 255);
    const permBodyLen = 2 + permittedClassIndices.length * 2;
    out.push(permBodyLen >> 24 & 255, permBodyLen >> 16 & 255, permBodyLen >> 8 & 255, permBodyLen & 255);
    out.push(permittedClassIndices.length >> 8 & 255, permittedClassIndices.length & 255);
    for (const ci of permittedClassIndices) {
      out.push(ci >> 8 & 255, ci & 255);
    }
  }
  return new Uint8Array(out);
}

// web/javac/disasm.ts
var OPCODES = {
  0: "nop",
  1: "aconst_null",
  2: "iconst_m1",
  3: "iconst_0",
  4: "iconst_1",
  5: "iconst_2",
  6: "iconst_3",
  7: "iconst_4",
  8: "iconst_5",
  9: "lconst_0",
  10: "lconst_1",
  11: "fconst_0",
  12: "fconst_1",
  13: "fconst_2",
  14: "dconst_0",
  15: "dconst_1",
  16: "bipush",
  17: "sipush",
  18: "ldc",
  19: "ldc_w",
  20: "ldc2_w",
  21: "iload",
  22: "lload",
  23: "fload",
  24: "dload",
  25: "aload",
  26: "iload_0",
  27: "iload_1",
  28: "iload_2",
  29: "iload_3",
  30: "lload_0",
  31: "lload_1",
  32: "lload_2",
  33: "lload_3",
  34: "fload_0",
  35: "fload_1",
  36: "fload_2",
  37: "fload_3",
  38: "dload_0",
  39: "dload_1",
  40: "dload_2",
  41: "dload_3",
  42: "aload_0",
  43: "aload_1",
  44: "aload_2",
  45: "aload_3",
  50: "aaload",
  51: "baload",
  52: "caload",
  53: "saload",
  54: "istore",
  55: "lstore",
  56: "fstore",
  57: "dstore",
  58: "astore",
  59: "istore_0",
  60: "istore_1",
  61: "istore_2",
  62: "istore_3",
  63: "lstore_0",
  64: "lstore_1",
  65: "lstore_2",
  66: "lstore_3",
  67: "fstore_0",
  68: "fstore_1",
  69: "fstore_2",
  70: "fstore_3",
  71: "dstore_0",
  72: "dstore_1",
  73: "dstore_2",
  74: "dstore_3",
  75: "astore_0",
  76: "astore_1",
  77: "astore_2",
  78: "astore_3",
  79: "iastore",
  80: "lastore",
  81: "fastore",
  82: "dastore",
  83: "aastore",
  84: "bastore",
  85: "castore",
  86: "sastore",
  87: "pop",
  88: "pop2",
  89: "dup",
  90: "dup_x1",
  91: "dup_x2",
  92: "dup2",
  93: "dup2_x1",
  94: "dup2_x2",
  95: "swap",
  96: "iadd",
  97: "ladd",
  98: "fadd",
  99: "dadd",
  100: "isub",
  101: "lsub",
  102: "fsub",
  103: "dsub",
  104: "imul",
  105: "lmul",
  106: "fmul",
  107: "dmul",
  108: "idiv",
  109: "ldiv",
  110: "fdiv",
  111: "ddiv",
  112: "irem",
  113: "lrem",
  114: "frem",
  115: "drem",
  116: "ineg",
  117: "lneg",
  118: "fneg",
  119: "dneg",
  120: "ishl",
  121: "lshl",
  122: "ishr",
  123: "lshr",
  124: "iushr",
  125: "lushr",
  126: "iand",
  127: "land",
  128: "ior",
  129: "lor",
  130: "ixor",
  131: "lxor",
  132: "iinc",
  133: "i2l",
  134: "i2f",
  135: "i2d",
  136: "l2i",
  137: "l2f",
  138: "l2d",
  139: "f2i",
  140: "f2l",
  141: "f2d",
  142: "d2i",
  143: "d2l",
  144: "d2f",
  145: "i2b",
  146: "i2c",
  147: "i2s",
  148: "lcmp",
  149: "fcmpl",
  150: "fcmpg",
  151: "dcmpl",
  152: "dcmpg",
  153: "ifeq",
  154: "ifne",
  155: "iflt",
  156: "ifge",
  157: "ifgt",
  158: "ifle",
  159: "if_icmpeq",
  160: "if_icmpne",
  161: "if_icmplt",
  162: "if_icmpge",
  163: "if_icmpgt",
  164: "if_icmple",
  165: "if_acmpeq",
  166: "if_acmpne",
  167: "goto",
  170: "tableswitch",
  171: "lookupswitch",
  172: "ireturn",
  173: "lreturn",
  174: "freturn",
  175: "dreturn",
  176: "areturn",
  177: "return",
  178: "getstatic",
  179: "putstatic",
  180: "getfield",
  181: "putfield",
  182: "invokevirtual",
  183: "invokespecial",
  184: "invokestatic",
  185: "invokeinterface",
  186: "invokedynamic",
  187: "new",
  188: "newarray",
  189: "anewarray",
  190: "arraylength",
  191: "athrow",
  192: "checkcast",
  193: "instanceof",
  194: "monitorenter",
  195: "monitorexit",
  196: "wide",
  197: "multianewarray",
  198: "ifnull",
  199: "ifnonnull",
  200: "goto_w"
};
var OPCODE_WIDTHS = {
  16: 1,
  17: 2,
  18: 1,
  19: 2,
  20: 2,
  21: 1,
  22: 1,
  23: 1,
  24: 1,
  25: 1,
  54: 1,
  55: 1,
  56: 1,
  57: 1,
  58: 1,
  132: 2,
  153: 2,
  154: 2,
  155: 2,
  156: 2,
  157: 2,
  158: 2,
  159: 2,
  160: 2,
  161: 2,
  162: 2,
  163: 2,
  164: 2,
  165: 2,
  166: 2,
  167: 2,
  170: -1,
  171: -1,
  178: 2,
  179: 2,
  180: 2,
  181: 2,
  182: 2,
  183: 2,
  184: 2,
  185: 4,
  186: 4,
  187: 2,
  188: 1,
  189: 2,
  192: 2,
  193: 2,
  197: 3,
  198: 2,
  199: 2,
  200: 4
};
function disassemble(classBytes) {
  const dv = new DataView(classBytes.buffer, classBytes.byteOffset, classBytes.byteLength);
  const lines = [];
  let pos = 0;
  function u8() {
    return dv.getUint8(pos++);
  }
  function u16() {
    const v = dv.getUint16(pos);
    pos += 2;
    return v;
  }
  function u32() {
    const v = dv.getUint32(pos);
    pos += 4;
    return v;
  }
  function skip(n) {
    pos += n;
  }
  const magic = u32();
  if (magic !== 3405691582) return "Not a valid .class file";
  const minor = u16(), major = u16();
  const cpCount = u16();
  const cp = [null];
  for (let i = 1; i < cpCount; i++) {
    const tag = u8();
    switch (tag) {
      case 1: {
        const len = u16();
        let s = "";
        for (let j = 0; j < len; j++) s += String.fromCharCode(u8());
        cp.push(s);
        break;
      }
      case 7: {
        cp.push(`#class:${u16()}`);
        break;
      }
      case 8: {
        cp.push(`#str:${u16()}`);
        break;
      }
      case 9: {
        cp.push(`#field:${u16()}:${u16()}`);
        break;
      }
      case 10: {
        cp.push(`#meth:${u16()}:${u16()}`);
        break;
      }
      case 11: {
        cp.push(`#imeth:${u16()}:${u16()}`);
        break;
      }
      case 12: {
        cp.push(`#nat:${u16()}:${u16()}`);
        break;
      }
      case 18: {
        cp.push(`#indy:${u16()}:${u16()}`);
        break;
      }
      case 3: {
        cp.push(`int:${dv.getInt32(pos)}`);
        pos += 4;
        break;
      }
      case 4: {
        cp.push(`float:${dv.getFloat32(pos)}`);
        pos += 4;
        break;
      }
      case 5: {
        let longRepr;
        if (typeof dv.getBigInt64 === "function") {
          longRepr = String(dv.getBigInt64(pos));
        } else if (typeof BigInt !== "undefined") {
          const hi = dv.getUint32(pos);
          const lo = dv.getUint32(pos + 4);
          let v = BigInt(hi) << 32n | BigInt(lo);
          if (hi & 2147483648) v = v - (1n << 64n);
          longRepr = String(v);
        } else {
          longRepr = "?";
        }
        cp.push(`long:${longRepr}`);
        pos += 8;
        cp.push(null);
        i++;
        break;
      }
      case 6: {
        cp.push(`double:${dv.getFloat64(pos)}`);
        pos += 8;
        cp.push(null);
        i++;
        break;
      }
      case 15: {
        cp.push(`#mhnd:${u8()}:${u16()}`);
        break;
      }
      case 16: {
        cp.push(`#mtype:${u16()}`);
        break;
      }
      case 17: {
        skip(4);
        cp.push(null);
        break;
      }
      // Dynamic
      case 19: {
        skip(2);
        cp.push(null);
        break;
      }
      // Module
      case 20: {
        skip(2);
        cp.push(null);
        break;
      }
      // Package
      default: {
        cp.push(`?tag${tag}`);
        break;
      }
    }
  }
  function cpClass(idx) {
    const entry = cp[idx];
    if (!entry) return `#${idx}`;
    const m = entry.match(/^#class:(\d+)$/);
    return m ? (cp[+m[1]] ?? `#${m[1]}`).replace(/\//g, ".") : entry;
  }
  function cpNat(idx) {
    const entry = cp[idx] ?? "";
    const m = entry.match(/^#nat:(\d+):(\d+)$/);
    if (!m) return ["?", "?"];
    return [cp[+m[1]] ?? "?", cp[+m[2]] ?? "?"];
  }
  function cpRef(idx) {
    const entry = cp[idx] ?? "";
    const m = entry.match(/^#(?:meth|field|imeth):(\d+):(\d+)$/);
    if (!m) return `#${idx}`;
    const cls = cpClass(+m[1]);
    const [name, desc] = cpNat(+m[2]);
    return `${cls}.${name}:${desc}`;
  }
  function cpString(idx) {
    const entry = cp[idx] ?? "";
    const m = entry.match(/^#str:(\d+)$/);
    return m ? `"${cp[+m[1]] ?? ""}"` : entry;
  }
  function cpIndy(idx) {
    const entry = cp[idx] ?? "";
    const m = entry.match(/^#indy:(\d+):(\d+)$/);
    if (!m) return `#${idx}`;
    const [name, desc] = cpNat(+m[2]);
    return `#${m[1]}:${name}${desc}`;
  }
  const accessFlags = u16();
  const thisClass = cpClass(u16());
  const superClass = cpClass(u16());
  const flagStr = [
    accessFlags & 1 ? "public" : "",
    accessFlags & 32 ? "/* super */" : ""
  ].filter(Boolean).join(" ");
  lines.push(`${flagStr} class ${thisClass}`);
  if (superClass && superClass !== "java.lang.Object") {
    lines.push(`  extends ${superClass}`);
  }
  const ifCount = u16();
  for (let i = 0; i < ifCount; i++) u16();
  const fieldCount = u16();
  if (fieldCount > 0) lines.push("");
  for (let i = 0; i < fieldCount; i++) {
    const fFlags = u16();
    const fName = cp[u16()] ?? "?";
    const fDesc = cp[u16()] ?? "?";
    const fAccess = [
      fFlags & 1 ? "public" : fFlags & 2 ? "private" : "",
      fFlags & 8 ? "static" : "",
      fFlags & 16 ? "final" : ""
    ].filter(Boolean).join(" ");
    lines.push(`  ${fAccess} ${descToType(fDesc)} ${fName};`);
    const attrCount = u16();
    for (let a = 0; a < attrCount; a++) {
      u16();
      skip(u32());
    }
  }
  const methodCount = u16();
  for (let i = 0; i < methodCount; i++) {
    const mFlags = u16();
    const mName = cp[u16()] ?? "?";
    const mDesc = cp[u16()] ?? "?";
    const mAccess = [
      mFlags & 1 ? "public" : mFlags & 2 ? "private" : "",
      mFlags & 8 ? "static" : ""
    ].filter(Boolean).join(" ");
    const [paramTypes, retType] = parseDescriptor(mDesc);
    const paramStr = paramTypes.map((t, j) => `${t} arg${j}`).join(", ");
    const displayName = mName === "<init>" ? thisClass.split(".").pop() : mName;
    lines.push("");
    lines.push(`  ${mAccess} ${mName === "<init>" ? "" : retType + " "}${displayName}(${paramStr});`);
    const attrCount = u16();
    for (let a = 0; a < attrCount; a++) {
      const attrName = cp[u16()] ?? "?";
      const attrLen = u32();
      if (attrName === "Code") {
        lines.push("    Code:");
        u16();
        u16();
        const codeLen = u32();
        const codeStart = pos;
        const codeEnd = codeStart + codeLen;
        while (pos < codeEnd) {
          const offset = pos - codeStart;
          const op = u8();
          const opName = OPCODES[op] ?? `unknown(0x${op.toString(16).padStart(2, "0")})`;
          const width = OPCODE_WIDTHS[op] ?? 0;
          let operandStr = "";
          if (op === 182 || op === 183 || op === 184) {
            const ref = u16();
            operandStr = `#${ref.toString().padStart(2)} // ${cpRef(ref)}`;
          } else if (op === 185 || op === 186) {
            const ref = u16();
            skip(2);
            const label = op === 186 ? cpIndy(ref) : cpRef(ref);
            operandStr = `#${ref.toString().padStart(2)} // ${op === 186 ? "InvokeDynamic" : "InterfaceMethod"} ${label}`;
          } else if (op === 178 || op === 179 || op === 180 || op === 181) {
            const ref = u16();
            operandStr = `#${ref.toString().padStart(2)} // ${cpRef(ref)}`;
          } else if (op === 187 || op === 192 || op === 193) {
            const ref = u16();
            operandStr = `#${ref.toString().padStart(2)} // class ${cpClass(ref)}`;
          } else if (op === 18) {
            const ref = u8();
            const v = cp[ref] ?? `#${ref}`;
            operandStr = `#${ref.toString().padStart(2)} // ${v.startsWith("#str:") ? cpString(ref) : v}`;
          } else if (op === 19) {
            const ref = u16();
            const v = cp[ref] ?? `#${ref}`;
            operandStr = `#${ref.toString().padStart(2)} // ${v.startsWith("#str:") ? cpString(ref) : v}`;
          } else if (op === 132) {
            const idx = u8(), c = dv.getInt8(pos++);
            operandStr = `${idx}, ${c}`;
          } else if (op === 16) {
            operandStr = `${dv.getInt8(pos++)}`;
          } else if (op === 17) {
            operandStr = `${dv.getInt16(pos)}`;
            pos += 2;
          } else if (width === 1) {
            operandStr = `${u8()}`;
          } else if (width === 2) {
            const raw = dv.getInt16(pos);
            pos += 2;
            if (op >= 153 && op <= 167) operandStr = `${offset + raw}`;
            else operandStr = `${raw}`;
          } else if (width === 4) {
            operandStr = `${dv.getInt32(pos)}`;
            pos += 4;
          }
          lines.push(`       ${offset.toString().padStart(3)}: ${opName.padEnd(18)} ${operandStr}`);
        }
        const excCount = u16();
        skip(excCount * 8);
        const codeAttrCount = u16();
        for (let ca = 0; ca < codeAttrCount; ca++) {
          u16();
          skip(u32());
        }
      } else {
        skip(attrLen);
      }
    }
  }
  lines.unshift(`// class file v${major}.${minor}`);
  return lines.join("\n");
}
function descToType(desc) {
  if (desc === "I") return "int";
  if (desc === "Z") return "boolean";
  if (desc === "V") return "void";
  if (desc === "J") return "long";
  if (desc === "D") return "double";
  if (desc === "F") return "float";
  if (desc.startsWith("L") && desc.endsWith(";")) {
    return desc.slice(1, -1).split("/").pop();
  }
  if (desc.startsWith("[")) return descToType(desc.slice(1)) + "[]";
  return desc;
}
function parseDescriptor(desc) {
  const m = desc.match(/^\(([^)]*)\)(.+)$/);
  if (!m) return [[], desc];
  const params = [];
  let i = 0;
  const p = m[1];
  while (i < p.length) {
    if (p[i] === "L") {
      const end = p.indexOf(";", i);
      params.push(descToType(p.slice(i, end + 1)));
      i = end + 1;
    } else if (p[i] === "[") {
      let j = i + 1;
      while (j < p.length && p[j] === "[") j++;
      if (p[j] === "L") {
        const end = p.indexOf(";", j);
        params.push(descToType(p.slice(i, end + 1)));
        i = end + 1;
      } else {
        params.push(descToType(p.slice(i, j + 1)));
        i = j + 1;
      }
    } else {
      params.push(descToType(p[i]));
      i++;
    }
  }
  return [params, descToType(m[2])];
}
export {
  TokenKind,
  buildClassInterfaces,
  buildMethodRegistry,
  classFilesToBundle,
  compile,
  disassemble,
  generateClassFile,
  getKnownClassNames,
  getKnownClassesByPackage,
  getMethodsForClass,
  hasKnownMethodOwnerPrefix,
  lex,
  parseAll,
  parseBundleMeta,
  parseClassMeta,
  readJar,
  resetMethodRegistry,
  setClassInterfaces,
  setMethodRegistry
};
