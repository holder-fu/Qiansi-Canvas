import { readFile, writeFile } from 'node:fs/promises';

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;

const sourceModelPath = new URL('../src/assets/director/studio-man.glb', import.meta.url);
const materialReferencePath = new URL(
  '../src/assets/director/studio-mannequin.glb',
  import.meta.url,
);

function padToFour(value) {
  return (value + 3) & ~3;
}

function parseGlb(bytes) {
  if (bytes.readUInt32LE(0) !== GLB_MAGIC || bytes.readUInt32LE(4) !== 2) {
    throw new Error('Expected a glTF 2.0 binary file.');
  }

  const jsonLength = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== JSON_CHUNK_TYPE) {
    throw new Error('The first GLB chunk must contain JSON.');
  }

  const jsonStart = 20;
  const jsonEnd = jsonStart + jsonLength;
  const binHeader = jsonEnd;
  const binLength = bytes.readUInt32LE(binHeader);
  if (bytes.readUInt32LE(binHeader + 4) !== BIN_CHUNK_TYPE) {
    throw new Error('The second GLB chunk must contain binary data.');
  }

  return {
    document: JSON.parse(bytes.toString('utf8', jsonStart, jsonEnd).trimEnd()),
    binary: bytes.subarray(binHeader + 8, binHeader + 8 + binLength),
  };
}

function buildGlb(document, binary) {
  const json = Buffer.from(JSON.stringify(document), 'utf8');
  const paddedJson = Buffer.alloc(padToFour(json.length), 0x20);
  json.copy(paddedJson);

  const paddedBinary = Buffer.alloc(padToFour(binary.length));
  binary.copy(paddedBinary);

  const output = Buffer.alloc(12 + 8 + paddedJson.length + 8 + paddedBinary.length);
  output.writeUInt32LE(GLB_MAGIC, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(paddedJson.length, 12);
  output.writeUInt32LE(JSON_CHUNK_TYPE, 16);
  paddedJson.copy(output, 20);

  const binHeader = 20 + paddedJson.length;
  output.writeUInt32LE(paddedBinary.length, binHeader);
  output.writeUInt32LE(BIN_CHUNK_TYPE, binHeader + 4);
  paddedBinary.copy(output, binHeader + 8);
  return output;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const source = parseGlb(await readFile(sourceModelPath));
const reference = parseGlb(await readFile(materialReferencePath));
const document = clone(source.document);

const imageBufferViews = new Set(
  (document.images ?? [])
    .map((image) => image.bufferView)
    .filter((bufferView) => Number.isInteger(bufferView)),
);
const bufferViewRemap = new Map();
const binaryParts = [];
let binaryLength = 0;

document.bufferViews = document.bufferViews.flatMap((bufferView, oldIndex) => {
  if (imageBufferViews.has(oldIndex)) return [];

  const alignedOffset = padToFour(binaryLength);
  if (alignedOffset > binaryLength) {
    binaryParts.push(Buffer.alloc(alignedOffset - binaryLength));
  }

  const start = bufferView.byteOffset ?? 0;
  const bytes = source.binary.subarray(start, start + bufferView.byteLength);
  const newIndex = bufferViewRemap.size;
  bufferViewRemap.set(oldIndex, newIndex);
  binaryParts.push(bytes);
  binaryLength = alignedOffset + bytes.length;

  return [{ ...bufferView, byteOffset: alignedOffset }];
});

for (const accessor of document.accessors ?? []) {
  if (Number.isInteger(accessor.bufferView)) {
    const remapped = bufferViewRemap.get(accessor.bufferView);
    if (!Number.isInteger(remapped)) {
      throw new Error(`Accessor references removed bufferView ${accessor.bufferView}.`);
    }
    accessor.bufferView = remapped;
  }

  if (accessor.sparse) {
    for (const sparsePart of [accessor.sparse.indices, accessor.sparse.values]) {
      const remapped = bufferViewRemap.get(sparsePart.bufferView);
      if (!Number.isInteger(remapped)) {
        throw new Error(`Sparse accessor references removed bufferView ${sparsePart.bufferView}.`);
      }
      sparsePart.bufferView = remapped;
    }
  }
}

const lightweightSurfaceMaterial = clone(reference.document.materials?.[1]);
if (!lightweightSurfaceMaterial) {
  throw new Error('The mannequin surface material is unavailable.');
}
lightweightSurfaceMaterial.name = 'Ch36_Body_Lightweight';
document.materials = [lightweightSurfaceMaterial];
delete document.images;
delete document.textures;
delete document.samplers;

const compactBinary = Buffer.concat(binaryParts, binaryLength);
document.buffers = [{ byteLength: compactBinary.length }];
const generatorMarker = 'Qiansi lightweight material optimization';
if (!document.asset.generator.includes(generatorMarker)) {
  document.asset.generator = `${document.asset.generator}; ${generatorMarker}`;
}

const optimized = buildGlb(document, compactBinary);
const verification = parseGlb(optimized).document;
const textureReference = JSON.stringify(verification.materials).match(/Texture/g);

if (
  (verification.images?.length ?? 0) !== 0 ||
  (verification.textures?.length ?? 0) !== 0 ||
  textureReference
) {
  throw new Error('Texture data or texture references remain after optimization.');
}
if (
  verification.nodes.length !== source.document.nodes.length ||
  verification.meshes.length !== source.document.meshes.length ||
  verification.skins.length !== source.document.skins.length ||
  verification.accessors.length !== source.document.accessors.length
) {
  throw new Error('Geometry, skeleton, or accessor counts changed unexpectedly.');
}

await writeFile(sourceModelPath, optimized);
process.stdout.write(
  `${JSON.stringify(
    {
      beforeBytes: source.document.buffers[0].byteLength,
      afterBytes: verification.buffers[0].byteLength,
      outputBytes: optimized.length,
      nodes: verification.nodes.length,
      meshes: verification.meshes.length,
      skins: verification.skins.length,
      accessors: verification.accessors.length,
      images: verification.images?.length ?? 0,
      textures: verification.textures?.length ?? 0,
    },
    null,
    2,
  )}\n`,
);
