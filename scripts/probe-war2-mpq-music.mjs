import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";

const mpqPaths = process.argv.slice(2);
if (mpqPaths.length === 0) {
  console.error("Usage: node scripts/probe-war2-mpq-music.mjs [--extract <out-dir>] <archive.mpq> [...]");
  process.exit(2);
}
let extractRoot = null;
if (mpqPaths[0] === "--extract") {
  extractRoot = mpqPaths[1] ?? null;
  mpqPaths.splice(0, 2);
  if (!extractRoot || mpqPaths.length === 0) {
    console.error("Usage: node scripts/probe-war2-mpq-music.mjs --extract <out-dir> <archive.mpq> [...]");
    process.exit(2);
  }
}

const musicNames = [
  "HUMAN1.WAV", "HUMAN2.WAV", "HUMAN3.WAV", "HUMAN4.WAV", "HUMAN5.WAV", "HUMAN6.WAV",
  "ORC1.WAV", "ORC2.WAV", "ORC3.WAV", "ORC4.WAV", "ORC5.WAV", "ORC6.WAV",
  "HWARROOM.WAV", "OWARROOM.WAV", "HVICTORY.WAV", "OVICTORY.WAV", "HDEFEAT.WAV", "ODEFEAT.WAV",
  "DISCOWC.WAV"
];
const candidateNames = musicNames.flatMap((name) => [name, `Music\\${name}`, `music\\${name}`]);
const cryptTable = buildCryptTable();
const outputNames = new Map([
  ["Music\\HUMAN1.WAV", "Human Battle 1.wav"],
  ["Music\\HUMAN2.WAV", "Human Battle 2.wav"],
  ["Music\\HUMAN3.WAV", "Human Battle 3.wav"],
  ["Music\\HUMAN4.WAV", "Human Battle 4.wav"],
  ["Music\\HUMAN5.WAV", "Human Battle 5.wav"],
  ["Music\\HUMAN6.WAV", "Human Battle 6.wav"],
  ["Music\\ORC1.WAV", "Orc Battle 1.wav"],
  ["Music\\ORC2.WAV", "Orc Battle 2.wav"],
  ["Music\\ORC3.WAV", "Orc Battle 3.wav"],
  ["Music\\ORC4.WAV", "Orc Battle 4.wav"],
  ["Music\\ORC5.WAV", "Orc Battle 5.wav"],
  ["Music\\ORC6.WAV", "Orc Battle 6.wav"],
  ["Music\\HWARROOM.WAV", "Human Briefing.wav"],
  ["Music\\OWARROOM.WAV", "Orc Briefing.wav"],
  ["Music\\HVICTORY.WAV", "Human Victory.wav"],
  ["Music\\OVICTORY.WAV", "Orc Victory.wav"],
  ["Music\\HDEFEAT.WAV", "Human Defeat.wav"],
  ["Music\\ODEFEAT.WAV", "Orc Defeat.wav"],
  ["Music\\DISCOWC.WAV", "I'm a Medieval Man.wav"]
]);

for (const archivePath of mpqPaths) {
  const bytes = readFileSync(archivePath);
  const headerOffset = findMpqHeader(bytes);
  if (headerOffset < 0) {
    console.log(`${archivePath}: no MPQ header found`);
    continue;
  }
  const header = readHeader(bytes, headerOffset);
  const hashTable = decryptTable(
    bytes.subarray(headerOffset + header.hashTableOffset, headerOffset + header.hashTableOffset + header.hashTableEntries * 16),
    hashString("(hash table)", 3)
  );
  const blockTable = decryptTable(
    bytes.subarray(headerOffset + header.blockTableOffset, headerOffset + header.blockTableOffset + header.blockTableEntries * 16),
    hashString("(block table)", 3)
  );
  const hashes = parseHashTable(hashTable);
  const blocks = parseBlockTable(blockTable);
  const matches = [];
  for (const candidate of candidateNames) {
    const hash = findHashEntry(hashes, candidate);
    if (!hash) {
      continue;
    }
    const block = blocks[hash.blockIndex];
    if (!block || (block.flags & 0x80000000) === 0) {
      continue;
    }
    matches.push({ name: candidate, blockIndex: hash.blockIndex, offset: block.offset, compressedSize: block.compressedSize, fileSize: block.fileSize, flags: `0x${block.flags.toString(16)}` });
  }
  console.log(`${archivePath}: header@${headerOffset}, hashEntries=${header.hashTableEntries}, blockEntries=${header.blockTableEntries}, musicMatches=${matches.length}`);
  for (const match of matches) {
    console.log(`  ${match.name}: block=${match.blockIndex}, offset=${match.offset}, packed=${match.compressedSize}, size=${match.fileSize}, flags=${match.flags}`);
  }
  if (extractRoot && matches.length > 0) {
    mkdirSync(extractRoot, { recursive: true });
    const uniqueMatches = new Map(matches.filter((match) => outputNames.has(match.name)).map((match) => [match.name, match]));
    for (const [name, match] of uniqueMatches) {
      const block = blocks[match.blockIndex];
      const extracted = extractFile(bytes, headerOffset, header, block, name);
      const outputName = outputNames.get(name);
      const outputPath = path.join(extractRoot, outputName);
      writeFileSync(outputPath, extracted);
      console.log(`  extracted ${name} -> ${outputPath} (${extracted.length} bytes)`);
    }
  }
}

function findMpqHeader(bytes) {
  for (let offset = 0; offset <= bytes.length - 4; offset += 512) {
    if (bytes[offset] === 0x4d && bytes[offset + 1] === 0x50 && bytes[offset + 2] === 0x51 && bytes[offset + 3] === 0x1a) {
      return offset;
    }
  }
  return -1;
}

function readHeader(bytes, offset) {
  return {
    headerSize: bytes.readUInt32LE(offset + 4),
    archiveSize: bytes.readUInt32LE(offset + 8),
    formatVersion: bytes.readUInt16LE(offset + 12),
    sectorSizeShift: bytes.readUInt16LE(offset + 14),
    hashTableOffset: bytes.readUInt32LE(offset + 16),
    blockTableOffset: bytes.readUInt32LE(offset + 20),
    hashTableEntries: bytes.readUInt32LE(offset + 24),
    blockTableEntries: bytes.readUInt32LE(offset + 28)
  };
}

function decryptTable(encrypted, key) {
  const out = Buffer.alloc(encrypted.length);
  let seed = 0xeeeeeeee;
  for (let offset = 0; offset < encrypted.length; offset += 4) {
    seed = uint32(seed + cryptTable[0x400 + (key & 0xff)]);
    const value = encrypted.readUInt32LE(offset);
    const decrypted = uint32(value ^ uint32(key + seed));
    key = uint32((((~key) << 21) + 0x11111111) | (key >>> 11));
    seed = uint32(decrypted + seed + (seed << 5) + 3);
    out.writeUInt32LE(decrypted, offset);
  }
  return out;
}

function parseHashTable(table) {
  const entries = [];
  for (let offset = 0; offset < table.length; offset += 16) {
    entries.push({
      name1: table.readUInt32LE(offset),
      name2: table.readUInt32LE(offset + 4),
      locale: table.readUInt16LE(offset + 8),
      platform: table.readUInt16LE(offset + 10),
      blockIndex: table.readUInt32LE(offset + 12)
    });
  }
  return entries;
}

function parseBlockTable(table) {
  const entries = [];
  for (let offset = 0; offset < table.length; offset += 16) {
    entries.push({
      offset: table.readUInt32LE(offset),
      compressedSize: table.readUInt32LE(offset + 4),
      fileSize: table.readUInt32LE(offset + 8),
      flags: table.readUInt32LE(offset + 12)
    });
  }
  return entries;
}

function findHashEntry(entries, fileName) {
  const tableOffset = hashString(fileName, 0) % entries.length;
  const name1 = hashString(fileName, 1);
  const name2 = hashString(fileName, 2);
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[(tableOffset + i) % entries.length];
    if (entry.blockIndex === 0xffffffff) {
      return null;
    }
    if (entry.name1 === name1 && entry.name2 === name2 && entry.blockIndex !== 0xfffffffe) {
      return entry;
    }
  }
  return null;
}

function extractFile(bytes, headerOffset, header, block, fileName) {
  const fileOffsetCandidates = [headerOffset + block.offset, block.offset];
  const sectorSize = 512 << header.sectorSizeShift;
  const sectorCount = Math.ceil(block.fileSize / sectorSize);
  const encrypted = (block.flags & 0x00010000) !== 0;
  const fixKey = (block.flags & 0x00020000) !== 0;
  const compressed = (block.flags & 0x00000200) !== 0 || (block.flags & 0x00000100) !== 0;
  const baseKeys = [...new Set([fileName, path.basename(fileName), fileName.replace(/^Music\\/i, "")])].map((name) => hashString(name, 3));
  let key = fixKey ? uint32((baseKeys[0] + block.offset) ^ block.fileSize) : baseKeys[0];
  if (sectorCount <= 1 && block.compressedSize === block.fileSize && !compressed) {
    let data = Buffer.from(bytes.subarray(fileOffsetCandidates[0], fileOffsetCandidates[0] + block.fileSize));
    if (encrypted) {
      data = decryptBytes(data, key);
    }
    return data;
  }
  const tableSize = (sectorCount + 1) * 4;
  const sectorPlan = chooseSectorPlan(bytes, fileOffsetCandidates, baseKeys, key, block, headerOffset, sectorCount, tableSize, encrypted);
  key = sectorPlan.key;
  const fileOffset = sectorPlan.fileOffset;
  const sectorOffsets = sectorPlan.offsets;
  const out = [];
  for (let index = 0; index < sectorCount; index += 1) {
    const start = fileOffset + sectorOffsets[index];
    const end = fileOffset + sectorOffsets[index + 1];
    let sector = Buffer.from(bytes.subarray(start, end));
    if (encrypted) {
      sector = decryptBytes(sector, uint32(key + index));
    }
    const expectedSize = Math.min(sectorSize, block.fileSize - index * sectorSize);
    if (sector.length < expectedSize || compressed) {
      sector = decompressSector(sector, expectedSize, fileName, index);
    }
    out.push(sector);
  }
  return Buffer.concat(out, block.fileSize);
}

function chooseSectorPlan(bytes, fileOffsetCandidates, baseKeys, defaultKey, block, headerOffset, sectorCount, tableSize, encrypted) {
  for (const fileOffset of fileOffsetCandidates) {
    const encryptedSectorOffsetsBytes = Buffer.from(bytes.subarray(fileOffset, fileOffset + tableSize));
    if (!encrypted) {
      const offsets = readSectorOffsets(encryptedSectorOffsetsBytes, sectorCount);
      if (validSectorOffsets(offsets, tableSize, block.compressedSize)) {
        return { fileOffset, key: defaultKey, offsets };
      }
      continue;
    }
    const candidates = [defaultKey];
    for (const baseKey of baseKeys) {
      candidates.push(
        uint32((baseKey + block.offset) ^ block.fileSize),
        uint32((baseKey + headerOffset + block.offset) ^ block.fileSize),
        uint32((baseKey + fileOffset) ^ block.fileSize),
        uint32((baseKey + block.offset) ^ block.compressedSize),
        uint32((baseKey + headerOffset + block.offset) ^ block.compressedSize),
        uint32((baseKey + fileOffset) ^ block.compressedSize),
        baseKey
      );
    }
    for (const candidate of candidates) {
      const offsets = readSectorOffsets(decryptBytes(encryptedSectorOffsetsBytes, uint32(candidate - 1)), sectorCount);
      if (validSectorOffsets(offsets, tableSize, block.compressedSize)) {
        return { fileOffset, key: candidate, offsets };
      }
    }
  }
  const firstOffset = fileOffsetCandidates[0];
  const firstBytes = Buffer.from(bytes.subarray(firstOffset, firstOffset + tableSize));
  const offsets = readSectorOffsets(encrypted ? decryptBytes(firstBytes, uint32(defaultKey - 1)) : firstBytes, sectorCount);
  throw new Error(`Unable to decrypt MPQ sector table; first offsets=${offsets.slice(0, 6).join(",")}`);
}

function readSectorOffsets(bytes, sectorCount) {
  const offsets = [];
  for (let index = 0; index <= sectorCount; index += 1) {
    offsets.push(bytes.readUInt32LE(index * 4));
  }
  return offsets;
}

function validSectorOffsets(offsets, tableSize, compressedSize) {
  if (offsets[0] !== tableSize || offsets[offsets.length - 1] > compressedSize) {
    return false;
  }
  for (let index = 1; index < offsets.length; index += 1) {
    if (offsets[index] < offsets[index - 1] || offsets[index] > compressedSize) {
      return false;
    }
  }
  return true;
}

function decryptBytes(encrypted, key) {
  const length = encrypted.length - (encrypted.length % 4);
  const out = Buffer.from(encrypted);
  let seed = 0xeeeeeeee;
  for (let offset = 0; offset < length; offset += 4) {
    seed = uint32(seed + cryptTable[0x400 + (key & 0xff)]);
    const value = out.readUInt32LE(offset);
    const decrypted = uint32(value ^ uint32(key + seed));
    key = uint32((((~key) << 21) + 0x11111111) | (key >>> 11));
    seed = uint32(decrypted + seed + (seed << 5) + 3);
    out.writeUInt32LE(decrypted, offset);
  }
  return out;
}

function decompressSector(sector, expectedSize, fileName, sectorIndex) {
  if (sector.length === expectedSize) {
    return sector;
  }
  const compression = sector[0];
  const payload = sector.subarray(1);
  if (compression === 0x02) {
    return inflateSync(payload);
  }
  throw new Error(`Unsupported MPQ compression 0x${compression.toString(16)} for ${fileName} sector ${sectorIndex} (${sector.length} -> ${expectedSize})`);
}

function hashString(value, hashType) {
  let seed1 = 0x7fed7fed;
  let seed2 = 0xeeeeeeee;
  for (const byte of Buffer.from(value.toUpperCase(), "ascii")) {
    const tableValue = cryptTable[(hashType << 8) + byte];
    seed1 = uint32(tableValue ^ uint32(seed1 + seed2));
    seed2 = uint32(byte + seed1 + seed2 + (seed2 << 5) + 3);
  }
  return seed1 >>> 0;
}

function buildCryptTable() {
  const table = new Uint32Array(0x500);
  let seed = 0x00100001;
  for (let index1 = 0; index1 < 0x100; index1 += 1) {
    for (let index2 = index1; index2 < 0x500; index2 += 0x100) {
      seed = (seed * 125 + 3) % 0x2aaaab;
      const temp1 = (seed & 0xffff) << 16;
      seed = (seed * 125 + 3) % 0x2aaaab;
      const temp2 = seed & 0xffff;
      table[index2] = uint32(temp1 | temp2);
    }
  }
  return table;
}

function uint32(value) {
  return value >>> 0;
}
