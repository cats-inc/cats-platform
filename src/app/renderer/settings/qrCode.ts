interface QrVersion {
  version: number;
  size: number;
  dataCodewords: number;
  errorCodewords: number;
  alignmentCenters: number[];
}

export interface QrCodeMatrix {
  size: number;
  cells: boolean[][];
}

const QR_VERSIONS: QrVersion[] = [
  { version: 1, size: 21, dataCodewords: 19, errorCodewords: 7, alignmentCenters: [] },
  { version: 2, size: 25, dataCodewords: 34, errorCodewords: 10, alignmentCenters: [6, 18] },
  { version: 3, size: 29, dataCodewords: 55, errorCodewords: 15, alignmentCenters: [6, 22] },
  { version: 4, size: 33, dataCodewords: 80, errorCodewords: 20, alignmentCenters: [6, 26] },
  { version: 5, size: 37, dataCodewords: 108, errorCodewords: 26, alignmentCenters: [6, 30] },
];

const BYTE_MODE = 0b0100;
const ERROR_CORRECTION_LEVEL_L = 0b01;
const MASK_PATTERN = 0;
const FORMAT_XOR_MASK = 0x5412;
const FORMAT_GENERATOR = 0x537;
const PAD_CODEWORDS = [0xec, 0x11];

const GF_EXP = new Array<number>(512);
const GF_LOG = new Array<number>(256);

let gfValue = 1;
for (let index = 0; index < 255; index += 1) {
  GF_EXP[index] = gfValue;
  GF_LOG[gfValue] = index;
  gfValue <<= 1;
  if ((gfValue & 0x100) !== 0) {
    gfValue ^= 0x11d;
  }
}
for (let index = 255; index < GF_EXP.length; index += 1) {
  GF_EXP[index] = GF_EXP[index - 255] ?? 1;
}

function gfMultiply(left: number, right: number): number {
  if (left === 0 || right === 0) {
    return 0;
  }
  return GF_EXP[(GF_LOG[left] ?? 0) + (GF_LOG[right] ?? 0)] ?? 0;
}

function computeReedSolomonDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;

  for (let index = 0; index < degree; index += 1) {
    for (let item = 0; item < degree; item += 1) {
      result[item] = gfMultiply(result[item] ?? 0, root);
      if (item + 1 < degree) {
        result[item] ^= result[item + 1] ?? 0;
      }
    }
    root = gfMultiply(root, 0x02);
  }

  return result;
}

function computeReedSolomonRemainder(data: number[], divisor: number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0);

  for (const byte of data) {
    const factor = byte ^ (result.shift() ?? 0);
    result.push(0);
    for (let index = 0; index < divisor.length; index += 1) {
      result[index] = (result[index] ?? 0) ^ gfMultiply(divisor[index] ?? 0, factor);
    }
  }

  return result;
}

function appendBits(target: number[], value: number, bitCount: number): void {
  for (let index = bitCount - 1; index >= 0; index -= 1) {
    target.push((value >>> index) & 1);
  }
}

function bitsToCodewords(bits: number[]): number[] {
  const result: number[] = [];
  for (let index = 0; index < bits.length; index += 8) {
    let value = 0;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value << 1) | (bits[index + bit] ?? 0);
    }
    result.push(value);
  }
  return result;
}

function selectQrVersion(byteLength: number): QrVersion | null {
  return QR_VERSIONS.find((version) => {
    const requiredBits = 4 + 8 + byteLength * 8;
    return requiredBits <= version.dataCodewords * 8;
  }) ?? null;
}

function encodeDataCodewords(value: string, version: QrVersion): number[] {
  const bytes = Array.from(new TextEncoder().encode(value));
  const bits: number[] = [];
  const capacityBits = version.dataCodewords * 8;

  appendBits(bits, BYTE_MODE, 4);
  appendBits(bits, bytes.length, 8);
  for (const byte of bytes) {
    appendBits(bits, byte, 8);
  }

  appendBits(bits, 0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const codewords = bitsToCodewords(bits);
  let padIndex = 0;
  while (codewords.length < version.dataCodewords) {
    codewords.push(PAD_CODEWORDS[padIndex % PAD_CODEWORDS.length] ?? 0xec);
    padIndex += 1;
  }
  return codewords;
}

function makeEmptyMatrix(size: number): {
  modules: boolean[][];
  functionModules: boolean[][];
} {
  return {
    modules: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
    functionModules: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
  };
}

function setFunctionModule(
  modules: boolean[][],
  functionModules: boolean[][],
  x: number,
  y: number,
  dark: boolean,
): void {
  if (y < 0 || y >= modules.length || x < 0 || x >= modules.length) {
    return;
  }
  modules[y]![x] = dark;
  functionModules[y]![x] = true;
}

function drawFinderPattern(
  modules: boolean[][],
  functionModules: boolean[][],
  centerX: number,
  centerY: number,
): void {
  for (let y = -4; y <= 4; y += 1) {
    for (let x = -4; x <= 4; x += 1) {
      const distance = Math.max(Math.abs(x), Math.abs(y));
      setFunctionModule(
        modules,
        functionModules,
        centerX + x,
        centerY + y,
        distance !== 2 && distance !== 4,
      );
    }
  }
}

function drawAlignmentPattern(
  modules: boolean[][],
  functionModules: boolean[][],
  centerX: number,
  centerY: number,
): void {
  for (let y = -2; y <= 2; y += 1) {
    for (let x = -2; x <= 2; x += 1) {
      const distance = Math.max(Math.abs(x), Math.abs(y));
      setFunctionModule(
        modules,
        functionModules,
        centerX + x,
        centerY + y,
        distance !== 1,
      );
    }
  }
}

function reserveFormatModules(modules: boolean[][], functionModules: boolean[][]): void {
  const size = modules.length;
  for (let index = 0; index <= 8; index += 1) {
    if (index !== 6) {
      setFunctionModule(modules, functionModules, 8, index, false);
      setFunctionModule(modules, functionModules, index, 8, false);
    }
  }
  for (let index = 0; index < 8; index += 1) {
    setFunctionModule(modules, functionModules, size - 1 - index, 8, false);
  }
  for (let index = 8; index < 15; index += 1) {
    setFunctionModule(modules, functionModules, 8, size - 15 + index, false);
  }
}

function drawFunctionPatterns(
  modules: boolean[][],
  functionModules: boolean[][],
  version: QrVersion,
): void {
  const size = modules.length;

  drawFinderPattern(modules, functionModules, 3, 3);
  drawFinderPattern(modules, functionModules, size - 4, 3);
  drawFinderPattern(modules, functionModules, 3, size - 4);

  for (const centerY of version.alignmentCenters) {
    for (const centerX of version.alignmentCenters) {
      if (!functionModules[centerY]?.[centerX]) {
        drawAlignmentPattern(modules, functionModules, centerX, centerY);
      }
    }
  }

  for (let index = 0; index < size; index += 1) {
    if (!functionModules[6]![index]) {
      setFunctionModule(modules, functionModules, index, 6, index % 2 === 0);
    }
    if (!functionModules[index]![6]) {
      setFunctionModule(modules, functionModules, 6, index, index % 2 === 0);
    }
  }

  setFunctionModule(modules, functionModules, 8, size - 8, true);
  reserveFormatModules(modules, functionModules);
}

function shouldApplyMask(x: number, y: number): boolean {
  return (x + y) % 2 === 0;
}

function drawDataModules(
  modules: boolean[][],
  functionModules: boolean[][],
  codewords: number[],
): void {
  const size = modules.length;
  const bits: number[] = [];
  for (const codeword of codewords) {
    appendBits(bits, codeword, 8);
  }

  let bitIndex = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right -= 1;
    }

    for (let vertical = 0; vertical < size; vertical += 1) {
      const y = upward ? size - 1 - vertical : vertical;
      for (let column = 0; column < 2; column += 1) {
        const x = right - column;
        if (functionModules[y]![x]) {
          continue;
        }
        const rawDark = (bits[bitIndex] ?? 0) === 1;
        modules[y]![x] = shouldApplyMask(x, y) ? !rawDark : rawDark;
        bitIndex += 1;
      }
    }
    upward = !upward;
  }
}

function computeFormatBits(): number {
  const data = (ERROR_CORRECTION_LEVEL_L << 3) | MASK_PATTERN;
  let remainder = data << 10;

  for (let bit = 14; bit >= 10; bit -= 1) {
    if (((remainder >>> bit) & 1) !== 0) {
      remainder ^= FORMAT_GENERATOR << (bit - 10);
    }
  }

  return ((data << 10) | remainder) ^ FORMAT_XOR_MASK;
}

function drawFormatBits(modules: boolean[][], functionModules: boolean[][]): void {
  const size = modules.length;
  const formatBits = computeFormatBits();
  const bitAt = (index: number) => ((formatBits >>> index) & 1) !== 0;

  for (let index = 0; index <= 5; index += 1) {
    setFunctionModule(modules, functionModules, 8, index, bitAt(index));
  }
  setFunctionModule(modules, functionModules, 8, 7, bitAt(6));
  setFunctionModule(modules, functionModules, 8, 8, bitAt(7));
  setFunctionModule(modules, functionModules, 7, 8, bitAt(8));
  for (let index = 9; index < 15; index += 1) {
    setFunctionModule(modules, functionModules, 14 - index, 8, bitAt(index));
  }
  for (let index = 0; index < 8; index += 1) {
    setFunctionModule(modules, functionModules, size - 1 - index, 8, bitAt(index));
  }
  for (let index = 8; index < 15; index += 1) {
    setFunctionModule(modules, functionModules, 8, size - 15 + index, bitAt(index));
  }
  setFunctionModule(modules, functionModules, 8, size - 8, true);
}

export function createQrCodeMatrix(value: string): QrCodeMatrix | null {
  const bytes = new TextEncoder().encode(value);
  const version = selectQrVersion(bytes.length);
  if (!version) {
    return null;
  }

  const dataCodewords = encodeDataCodewords(value, version);
  const errorCodewords = computeReedSolomonRemainder(
    dataCodewords,
    computeReedSolomonDivisor(version.errorCodewords),
  );
  const { modules, functionModules } = makeEmptyMatrix(version.size);
  drawFunctionPatterns(modules, functionModules, version);
  drawDataModules(modules, functionModules, [...dataCodewords, ...errorCodewords]);
  drawFormatBits(modules, functionModules);

  return {
    size: version.size,
    cells: modules,
  };
}
