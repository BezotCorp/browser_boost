import fs from 'node:fs';

const version = process.argv[2];

if (!version) {
  throw new Error('Missing version argument');
}

if (!/^\d+\.\d+\.\d+(\.\d+)?$/.test(version)) {
  throw new Error(`Invalid Firefox extension version: ${version}`);
}

function updateJson(path, updater) {
  const json = JSON.parse(fs.readFileSync(path, 'utf8'));
  updater(json);
  fs.writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
}

updateJson('package.json', (json) => {
  json.version = version;
});
